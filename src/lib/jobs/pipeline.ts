import { NormalizedJob } from "./types";
import { fetchRemoteOk } from "./sources/remoteok";
import { fetchJobicy } from "./sources/jobicy";
import { fetchArbeitnow } from "./sources/arbeitnow";
import { fetchWeWorkRemotely } from "./sources/weworkremotely";
import { fetchGreenhouseBoard } from "./sources/greenhouse";
import { fetchLeverBoard } from "./sources/lever";
import { fetchAshbyBoard } from "./sources/ashby";
import { fetchHackerNews } from "./sources/hn";
import { VERIFIED_COMPANY_BOARDS } from "../../config/company-boards";
import {
  classifyExperience,
  classifyGeo,
  scoreMatch,
  ClassifyExperienceResult,
  ClassifyGeoResult,
  ScoreMatchResult,
} from "./classify";
import { LlmProvider } from "../llm/types";
import { GroqProvider } from "../llm/groq";
import { triageJobWithLlm } from "../llm/triage";
import { getJobsRepository, JobsRepository } from "./repository";

export interface PipelineState {
  runId: string;
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
  pendingJobs: Array<{
    job: NormalizedJob;
    ruleExp: ClassifyExperienceResult;
    ruleGeo: ClassifyGeoResult;
    ruleScore: ScoreMatchResult;
  }>;
  newJobsCount: number;
  filteredOutCount: number;
  stats: {
    llmCalls: number;
    llmErrors: number;
    llmSkippedStale: number;
    llmSkippedAlready: number;
    llmSkippedIrrelevant: number;
    shortlistCount: number;
    hiddenCount: number;
    languageHidden: number;
  };
}

// Global in-memory cache for resumable multi-step runs
const activePipelines = new Map<string, PipelineState>();

async function fetchAllCompanyBoards(): Promise<{
  greenhouseJobs: NormalizedJob[];
  leverJobs: NormalizedJob[];
  ashbyJobs: NormalizedJob[];
  errors: Record<string, string>;
}> {
  const greenhouseJobs: NormalizedJob[] = [];
  const leverJobs: NormalizedJob[] = [];
  const ashbyJobs: NormalizedJob[] = [];
  const errors: Record<string, string> = {};

  async function runPool<T>(items: T[], fn: (item: T) => Promise<void>, limit = 3) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await fn(item);
      }
    });
    await Promise.all(workers);
  }

  // 1. Greenhouse boards (concurrency 3)
  await runPool(
    VERIFIED_COMPANY_BOARDS.greenhouse,
    async (token) => {
      try {
        const res = await fetchGreenhouseBoard(token);
        if (res.error) errors[`greenhouse_${token}`] = res.error;
        greenhouseJobs.push(...res.jobs);
      } catch (e: unknown) {
        errors[`greenhouse_${token}`] = String(e);
      }
    },
    3
  );

  // 2. Ashby boards (concurrency 3)
  await runPool(
    VERIFIED_COMPANY_BOARDS.ashby,
    async (name) => {
      try {
        const res = await fetchAshbyBoard(name);
        if (res.error) errors[`ashby_${name}`] = res.error;
        ashbyJobs.push(...res.jobs);
      } catch (e: unknown) {
        errors[`ashby_${name}`] = String(e);
      }
    },
    3
  );

  // 3. Lever boards (sequential with 1.1s delay to respect rate limit)
  for (const site of VERIFIED_COMPANY_BOARDS.lever) {
    try {
      const res = await fetchLeverBoard(site);
      if (res.error) errors[`lever_${site}`] = res.error;
      leverJobs.push(...res.jobs);
    } catch (e: unknown) {
      errors[`lever_${site}`] = String(e);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  return { greenhouseJobs, leverJobs, ashbyJobs, errors };
}

export async function startJobSearch(
  repo: JobsRepository = getJobsRepository()
): Promise<{ runId: string; pendingTriage: number; totalFetched: number }> {
  const runId = await repo.createSearchRun();

  // 1. Fetch aggregators, HN, and company boards
  const [remoteOkRes, jobicyRes, arbeitnowRes, wwrRes, hnRes, companyRes] =
    await Promise.all([
      fetchRemoteOk(),
      fetchJobicy(),
      fetchArbeitnow(),
      fetchWeWorkRemotely(),
      fetchHackerNews(),
      fetchAllCompanyBoards(),
    ]);

  const sourceCounts: Record<string, number> = {
    remoteok: remoteOkRes.jobs.length,
    jobicy: jobicyRes.jobs.length,
    arbeitnow: arbeitnowRes.jobs.length,
    weworkremotely: wwrRes.jobs.length,
    hn: hnRes.jobs.length,
    greenhouse: companyRes.greenhouseJobs.length,
    lever: companyRes.leverJobs.length,
    ashby: companyRes.ashbyJobs.length,
  };

  const sourceErrors: Record<string, string> = { ...companyRes.errors };
  if (remoteOkRes.error) sourceErrors.remoteok = remoteOkRes.error;
  if (jobicyRes.error) sourceErrors.jobicy = jobicyRes.error;
  if (arbeitnowRes.error) sourceErrors.arbeitnow = arbeitnowRes.error;
  if (wwrRes.error) sourceErrors.weworkremotely = wwrRes.error;
  if (hnRes.error) sourceErrors.hn = hnRes.error;

  const rawJobs = [
    ...remoteOkRes.jobs,
    ...jobicyRes.jobs,
    ...arbeitnowRes.jobs,
    ...wwrRes.jobs,
    ...hnRes.jobs,
    ...companyRes.greenhouseJobs,
    ...companyRes.leverJobs,
    ...companyRes.ashbyJobs,
  ];

  // 2. Dedupe by URL and normalized (company + title)
  const dedupedJobs: NormalizedJob[] = [];
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const job of rawJobs) {
    const normUrl = job.url.toLowerCase().trim();
    const fingerprint = `${job.company.toLowerCase().trim()}|${job.title.toLowerCase().trim()}`;

    if (seenUrls.has(normUrl) || seenFingerprints.has(fingerprint)) {
      continue;
    }
    seenUrls.add(normUrl);
    seenFingerprints.add(fingerprint);
    dedupedJobs.push(job);
  }

  // 3. Apply fast rule engine
  const pendingJobs: PipelineState["pendingJobs"] = [];

  for (const job of dedupedJobs) {
    const ruleExp = classifyExperience(job.title, job.description);
    const ruleGeo = classifyGeo(job.title, job.location, job.remoteScope, job.description);
    const ruleScore = scoreMatch({
      title: job.title,
      description: job.description,
      tags: job.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    pendingJobs.push({
      job,
      ruleExp,
      ruleGeo,
      ruleScore,
    });
  }

  activePipelines.set(runId, {
    runId,
    sourceCounts,
    sourceErrors,
    pendingJobs,
    newJobsCount: 0,
    filteredOutCount: 0,
    stats: {
      llmCalls: 0,
      llmErrors: 0,
      llmSkippedStale: 0,
      llmSkippedAlready: 0,
      llmSkippedIrrelevant: 0,
      shortlistCount: 0,
      hiddenCount: 0,
      languageHidden: 0,
    },
  });

  return {
    runId,
    pendingTriage: pendingJobs.length,
    totalFetched: rawJobs.length,
  };
}

export async function stepJobSearch(
  runId: string,
  batchSize = 15,
  repo: JobsRepository = getJobsRepository(),
  llmProvider: LlmProvider = new GroqProvider()
): Promise<{
  runId: string;
  remaining: number;
  processed: number;
  done: boolean;
}> {
  const state = activePipelines.get(runId);
  if (!state) {
    return { runId, remaining: 0, processed: 0, done: true };
  }

  const batch = state.pendingJobs.splice(0, batchSize);
  const llmCallsMade = { count: 0 };

  for (const item of batch) {
    const prevCount = llmCallsMade.count;
    const existing = await repo.getJob(item.job.source, item.job.sourceId);
    const existingData = existing
      ? {
          triagedAt: existing.triaged_at || null,
          descriptionHash:
            (existing.raw as { descriptionHash?: string })?.descriptionHash || null,
        }
      : null;

    let triaged;
    try {
      triaged = await triageJobWithLlm(
        item.job,
        item.ruleExp,
        item.ruleGeo,
        item.ruleScore,
        llmProvider,
        llmCallsMade,
        existingData
      );
    } catch {
      state.stats.llmErrors++;
      // Fallback triaged result on unexpected LLM error
      triaged = {
        expClass: item.ruleExp.expClass,
        expMinYears: item.ruleExp.minYears,
        geoEligibility: item.ruleGeo.geo,
        geoReason: item.ruleGeo.reason,
        summaryLine: item.job.title,
        skills: item.ruleScore.matchedSkills,
        filterReason: item.ruleExp.reason || item.ruleGeo.reason,
        matchScore: item.ruleScore.score,
        triagedAt: new Date().toISOString(),
        descriptionHash: existingData?.descriptionHash || undefined,
      };
    }

    if (llmCallsMade.count > prevCount) {
      state.stats.llmCalls += llmCallsMade.count - prevCount;
    } else if (triaged.llmSkipped === "already") {
      state.stats.llmSkippedAlready++;
    } else if (triaged.llmSkipped === "irrelevant") {
      state.stats.llmSkippedIrrelevant++;
    } else if (triaged.llmSkipped === "stale") {
      state.stats.llmSkippedStale++;
    }

    const upsertRes = await repo.upsertJob(item.job, triaged);
    if (upsertRes === "new") {
      state.newJobsCount++;
    }
    if (triaged.filterReason) {
      state.filteredOutCount++;
      state.stats.hiddenCount++;
      if (triaged.filterReason.startsWith("description not in English")) {
        state.stats.languageHidden++;
      }
    } else {
      state.stats.shortlistCount++;
    }
  }

  const remaining = state.pendingJobs.length;
  const isDone = remaining === 0;

  if (isDone) {
    await repo.updateSearchRun(runId, {
      finished_at: new Date().toISOString(),
      status: "done",
      source_counts: state.sourceCounts,
      new_jobs: state.newJobsCount,
      filtered_out: state.filteredOutCount,
      stats: state.stats,
    });
    activePipelines.delete(runId);
  }

  return {
    runId,
    remaining,
    processed: batch.length,
    done: isDone,
  };
}
