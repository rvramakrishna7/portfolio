import { NormalizedJob } from "./types";
import { fetchRemoteOk } from "./sources/remoteok";
import { fetchJobicy } from "./sources/jobicy";
import { fetchArbeitnow } from "./sources/arbeitnow";
import { fetchWeWorkRemotely } from "./sources/weworkremotely";
import { calculateJobAgeDays } from "./freshness";
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
    shortlistCount: number;
    hiddenCount: number;
    languageHidden: number;
  };
}

// Global in-memory cache for resumable multi-step runs
const activePipelines = new Map<string, PipelineState>();

export async function startJobSearch(
  repo: JobsRepository = getJobsRepository()
): Promise<{ runId: string; pendingTriage: number; totalFetched: number }> {
  const runId = await repo.createSearchRun();

  // 1. Fetch all 4 sources concurrently
  const [remoteOkRes, jobicyRes, arbeitnowRes, wwrRes] = await Promise.all([
    fetchRemoteOk(),
    fetchJobicy(),
    fetchArbeitnow(),
    fetchWeWorkRemotely(),
  ]);

  const sourceCounts: Record<string, number> = {
    remoteok: remoteOkRes.jobs.length,
    jobicy: jobicyRes.jobs.length,
    arbeitnow: arbeitnowRes.jobs.length,
    weworkremotely: wwrRes.jobs.length,
  };

  const sourceErrors: Record<string, string> = {};
  if (remoteOkRes.error) sourceErrors.remoteok = remoteOkRes.error;
  if (jobicyRes.error) sourceErrors.jobicy = jobicyRes.error;
  if (arbeitnowRes.error) sourceErrors.arbeitnow = arbeitnowRes.error;
  if (wwrRes.error) sourceErrors.weworkremotely = wwrRes.error;

  const rawJobs = [
    ...remoteOkRes.jobs,
    ...jobicyRes.jobs,
    ...arbeitnowRes.jobs,
    ...wwrRes.jobs,
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
    const isStale = calculateJobAgeDays(item.job.postedAt) > 10;
    if (isStale && (item.ruleExp.expClass === "unclear" || item.ruleGeo.geo === "unclear")) {
      state.stats.llmSkippedStale++;
    }

    let triaged;
    try {
      triaged = await triageJobWithLlm(
        item.job,
        item.ruleExp,
        item.ruleGeo,
        item.ruleScore,
        llmProvider,
        llmCallsMade
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
      };
    }

    if (llmCallsMade.count > prevCount) {
      state.stats.llmCalls += llmCallsMade.count - prevCount;
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
