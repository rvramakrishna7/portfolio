import { NormalizedJob, AdapterResult } from "./types";
import { fetchRemoteOk } from "./sources/remoteok";
import { fetchJobicy } from "./sources/jobicy";
import { fetchArbeitnow } from "./sources/arbeitnow";
import { fetchWeWorkRemotely } from "./sources/weworkremotely";
import { fetchGreenhouseBoard } from "./sources/greenhouse";
import { fetchLeverBoard } from "./sources/lever";
import { fetchAshbyBoard } from "./sources/ashby";
import { fetchHackerNews } from "./sources/hn";
import { fetchLinkedInApify } from "./sources/linkedin-apify";
import { ingestGmailAlerts } from "../inbound/imap";
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
import { triageJobWithLlm, hashString, TriagedJobResult } from "../llm/triage";
import { getJobsRepository, JobsRepository, SearchRunStats, CustomBoard } from "./repository";

export interface BoardQueueItem {
  platform: "greenhouse" | "lever" | "ashby";
  name: string;
}

export function getAllCompanyBoardsQueue(customBoards?: CustomBoard[]): BoardQueueItem[] {
  const queue: BoardQueueItem[] = [];
  const seen = new Set<string>();

  for (const token of VERIFIED_COMPANY_BOARDS.greenhouse) {
    const key = `greenhouse:${token.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ platform: "greenhouse", name: token });
    }
  }
  for (const site of VERIFIED_COMPANY_BOARDS.lever) {
    const key = `lever:${site.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ platform: "lever", name: site });
    }
  }
  for (const name of VERIFIED_COMPANY_BOARDS.ashby) {
    const key = `ashby:${name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ platform: "ashby", name });
    }
  }

  if (customBoards && customBoards.length > 0) {
    for (const b of customBoards) {
      const key = `${b.kind}:${b.slug.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ platform: b.kind, name: b.slug });
      }
    }
  }

  return queue;
}

export interface PipelineState {
  runId: string;
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
  boardQueue: BoardQueueItem[];
  boardsDone: number;
  pendingJobs: Array<{
    job: NormalizedJob;
    ruleExp: ClassifyExperienceResult;
    ruleGeo: ClassifyGeoResult;
    ruleScore: ScoreMatchResult;
  }>;
  newJobsCount: number;
  filteredOutCount: number;
  stats: SearchRunStats;
}

// Global in-memory cache for resumable multi-step runs
const activePipelines = new Map<string, PipelineState>();

export function clearActivePipelinesForTest(): void {
  activePipelines.clear();
}

let lastLeverCallTimestamp = 0;

export async function startJobSearch(
  repo: JobsRepository = getJobsRepository(),
  options?: {
    boardQueue?: BoardQueueItem[];
    fetchAggregatorsFn?: () => Promise<{ jobs: NormalizedJob[]; errors?: Record<string, string> }>;
    fetchLinkedInFn?: () => Promise<AdapterResult>;
    ingestImapFn?: () => Promise<{ fetched: number; added: number; duplicates?: number; filtered?: number; error?: string }>;
  }
): Promise<{
  runId: string;
  pendingTriage: number;
  totalFetched: number;
  remainingBoards: number;
}> {
  const runId = await repo.createSearchRun();

  // One-off re-classification for existing stored rows with geo_eligibility = 'unclear'
  try {
    if (typeof repo.reclassifyUnclearJobs === "function") {
      const res = await repo.reclassifyUnclearJobs();
      if (res?.error) {
        console.warn("[startJobSearch] reclassifyUnclearJobs encountered an error; continuing search run");
      }
    }
  } catch (err) {
    console.warn("[startJobSearch] Unexpected reclassify error; continuing search run:", err);
  }

  let rawJobs: NormalizedJob[] = [];
  const sourceCounts: Record<string, number> = {
    remoteok: 0,
    jobicy: 0,
    arbeitnow: 0,
    weworkremotely: 0,
    hn: 0,
    greenhouse: 0,
    lever: 0,
    ashby: 0,
    linkedin: 0,
    email: 0,
    telegram: 0,
    whatsapp: 0,
    paste: 0,
  };
  const sourceErrors: Record<string, string> = {};

  if (options?.fetchAggregatorsFn) {
    const aggRes = await options.fetchAggregatorsFn();
    rawJobs = aggRes.jobs;
    if (aggRes.errors) Object.assign(sourceErrors, aggRes.errors);
    for (const job of rawJobs) {
      sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1;
    }
  } else {
    // 1. Fetch fast aggregators + HN in parallel
    const [remoteOkRes, jobicyRes, arbeitnowRes, wwrRes, hnRes] =
      await Promise.all([
        fetchRemoteOk(),
        fetchJobicy(),
        fetchArbeitnow(),
        fetchWeWorkRemotely(),
        fetchHackerNews(),
      ]);

    sourceCounts.remoteok = remoteOkRes.jobs.length;
    sourceCounts.jobicy = jobicyRes.jobs.length;
    sourceCounts.arbeitnow = arbeitnowRes.jobs.length;
    sourceCounts.weworkremotely = wwrRes.jobs.length;
    sourceCounts.hn = hnRes.jobs.length;

    if (remoteOkRes.error) sourceErrors.remoteok = remoteOkRes.error;
    if (jobicyRes.error) sourceErrors.jobicy = jobicyRes.error;
    if (arbeitnowRes.error) sourceErrors.arbeitnow = arbeitnowRes.error;
    if (wwrRes.error) sourceErrors.weworkremotely = wwrRes.error;
    if (hnRes.error) sourceErrors.hn = hnRes.error;

    rawJobs = [
      ...remoteOkRes.jobs,
      ...jobicyRes.jobs,
      ...arbeitnowRes.jobs,
      ...wwrRes.jobs,
      ...hnRes.jobs,
    ];
  }

  // 1b. Fetch LinkedIn and Gmail IMAP in parallel
  const [linkedInRes, imapRes] = await Promise.all([
    options?.fetchLinkedInFn ? options.fetchLinkedInFn() : fetchLinkedInApify(),
    options?.ingestImapFn ? options.ingestImapFn() : ingestGmailAlerts({ repo }),
  ]);

  sourceCounts.linkedin = linkedInRes.jobs.length;
  sourceCounts.email = imapRes.added + (imapRes.duplicates || 0);

  if (linkedInRes.error) sourceErrors.linkedin = linkedInRes.error;
  if (imapRes.error) sourceErrors.email = imapRes.error;

  rawJobs.push(...linkedInRes.jobs);

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
    const ruleGeo = classifyGeo(job.title, job.location, job.remoteScope, job.description, {
      isRemote: job.isRemote,
      workplaceType: job.workplaceType,
    });
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

  let customBoards: CustomBoard[] = [];
  if (typeof repo.getCustomBoards === "function") {
    try {
      customBoards = await repo.getCustomBoards();
    } catch {
      // Fallback
    }
  }

  const boardQueue = options?.boardQueue ? [...options.boardQueue] : getAllCompanyBoardsQueue(customBoards);
  const boardsTotal = boardQueue.length;

  const stats: SearchRunStats = {
    llmCalls: 0,
    llmErrors: 0,
    llmSkippedStale: 0,
    llmSkippedAlready: 0,
    llmSkippedIrrelevant: 0,
    shortlistCount: 0,
    hiddenCount: 0,
    languageHidden: 0,
    boardsTotal,
    boardsDone: 0,
    boardErrors: {},
  };

  activePipelines.set(runId, {
    runId,
    sourceCounts,
    sourceErrors,
    boardQueue,
    boardsDone: 0,
    pendingJobs,
    newJobsCount: 0,
    filteredOutCount: 0,
    stats,
  });

  // Store initial cursor & status in repo
  await repo.updateSearchRun(runId, {
    status: "running",
    source_counts: sourceCounts,
    stats,
  });

  return {
    runId,
    pendingTriage: pendingJobs.length,
    totalFetched: rawJobs.length,
    remainingBoards: boardsTotal,
  };
}

export async function stepJobSearch(
  runId: string,
  batchSize = 15,
  repo: JobsRepository = getJobsRepository(),
  llmProvider: LlmProvider = new GroqProvider(),
  options?: {
    maxDurationMs?: number;
    clock?: () => number;
    fetchBoardFn?: (board: BoardQueueItem) => Promise<AdapterResult>;
  }
): Promise<{
  runId: string;
  remaining: number;
  remainingBoards: number;
  pendingTriage: number;
  processed: number;
  done: boolean;
  boardsDone?: number;
}> {
  let state = activePipelines.get(runId);
  if (!state) {
    // Attempt rehydrating from stored search run in repo
    const run = await repo.getSearchRun(runId);
    if (!run || run.status === "done") {
      return {
        runId,
        remaining: 0,
        remainingBoards: 0,
        pendingTriage: 0,
        processed: 0,
        done: true,
        boardsDone: run?.stats?.boardsDone ?? 0,
      };
    }

    let customBoards: CustomBoard[] = [];
    if (typeof repo.getCustomBoards === "function") {
      try {
        customBoards = await repo.getCustomBoards();
      } catch {
        // Fallback
      }
    }

    const fullQueue = getAllCompanyBoardsQueue(customBoards);
    const boardsDone = run.stats?.boardsDone ?? 0;
    const remainingQueue = fullQueue.slice(boardsDone);

    state = {
      runId,
      sourceCounts: run.source_counts || {},
      sourceErrors: run.stats?.boardErrors || {},
      boardQueue: remainingQueue,
      boardsDone,
      pendingJobs: [],
      newJobsCount: run.new_jobs || 0,
      filteredOutCount: run.filtered_out || 0,
      stats: {
        llmCalls: run.stats?.llmCalls ?? 0,
        llmErrors: run.stats?.llmErrors ?? 0,
        llmSkippedStale: run.stats?.llmSkippedStale ?? 0,
        llmSkippedAlready: run.stats?.llmSkippedAlready ?? 0,
        llmSkippedIrrelevant: run.stats?.llmSkippedIrrelevant ?? 0,
        shortlistCount: run.stats?.shortlistCount ?? 0,
        hiddenCount: run.stats?.hiddenCount ?? 0,
        languageHidden: run.stats?.languageHidden ?? 0,
        boardsTotal: run.stats?.boardsTotal ?? fullQueue.length,
        boardsDone,
        boardErrors: run.stats?.boardErrors || {},
      },
    };
    activePipelines.set(runId, state);
  }

  const now = options?.clock ?? Date.now;
  const maxDurationMs = options?.maxDurationMs ?? 8000;
  const startTime = now();
  const deadline = startTime + maxDurationMs;

  let processedCount = 0;

  // PHASE 1: Process next batch of company boards while budget permits
  // Keep max 3 concurrent boards, and respect Lever 1 req/s
  while (state.boardQueue.length > 0 && now() < deadline - 1500) {
    const boardBatch = state.boardQueue.splice(0, 3);

    await Promise.all(
      boardBatch.map(async (board) => {
        try {
          // If Lever, respect 1 req/sec rate limit (only for live network calls)
          if (board.platform === "lever" && !options?.fetchBoardFn) {
            const timeSinceLast = now() - lastLeverCallTimestamp;
            if (timeSinceLast < 1100) {
              await new Promise((r) => setTimeout(r, 1100 - timeSinceLast));
            }
            lastLeverCallTimestamp = now();
          }

          let res: AdapterResult;
          if (options?.fetchBoardFn) {
            res = await options.fetchBoardFn(board);
          } else if (board.platform === "greenhouse") {
            res = await fetchGreenhouseBoard(board.name);
          } else if (board.platform === "lever") {
            res = await fetchLeverBoard(board.name);
          } else {
            res = await fetchAshbyBoard(board.name);
          }

          if (res.error) {
            state.sourceErrors[`${board.platform}_${board.name}`] = res.error;
            state.stats.boardErrors = state.stats.boardErrors || {};
            state.stats.boardErrors[`${board.platform}_${board.name}`] = res.error;
          }

          state.sourceCounts[board.platform] =
            (state.sourceCounts[board.platform] || 0) + res.jobs.length;

          // Process and immediately upsert or queue jobs
          for (const job of res.jobs) {
            const ruleExp = classifyExperience(job.title, job.description);
            const ruleGeo = classifyGeo(job.title, job.location, job.remoteScope, job.description, {
              isRemote: job.isRemote,
              workplaceType: job.workplaceType,
            });
            const ruleScore = scoreMatch({
              title: job.title,
              description: job.description,
              tags: job.tags,
              expClass: ruleExp.expClass,
              geoEligibility: ruleGeo.geo,
            });

            // Ambiguous jobs need LLM triage
            if (ruleExp.expClass === "unclear" || ruleGeo.geo === "unclear") {
              state.pendingJobs.push({ job, ruleExp, ruleGeo, ruleScore });
            } else {
              // Resolved by rules: upsert immediately
              let filterReason: string | undefined;
              if (ruleExp.expClass === "senior") {
                filterReason = ruleExp.reason || "Senior experience required";
              } else if (ruleGeo.geo === "restricted") {
                filterReason = ruleGeo.reason || "Geographically restricted";
              } else if (ruleScore.score < 25) {
                filterReason = "Low relevance score";
              }

              const triaged: TriagedJobResult = {
                expClass: ruleExp.expClass,
                expMinYears: ruleExp.minYears,
                geoEligibility: ruleGeo.geo,
                geoReason: ruleGeo.reason,
                summaryLine: job.title,
                skills: ruleScore.matchedSkills,
                filterReason,
                matchScore: ruleScore.score,
                triagedAt: new Date().toISOString(),
                descriptionHash: hashString(job.description || ""),
                llmSkipped: "irrelevant",
              };

              const upsertRes = await repo.upsertJob(job, triaged);
              if (upsertRes === "new") {
                state.newJobsCount++;
              }
              if (filterReason) {
                state.filteredOutCount++;
                state.stats.hiddenCount++;
              } else {
                state.stats.shortlistCount++;
              }
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          state.sourceErrors[`${board.platform}_${board.name}`] = msg;
          state.stats.boardErrors = state.stats.boardErrors || {};
          state.stats.boardErrors[`${board.platform}_${board.name}`] = msg;
        } finally {
          state.boardsDone++;
          state.stats.boardsDone = state.boardsDone;
          processedCount++;
        }
      })
    );
  }

  // PHASE 2: Triage pending jobs while budget permits
  const llmCallsMade = { count: 0 };
  let jobsProcessed = 0;

  while (
    state.pendingJobs.length > 0 &&
    jobsProcessed < batchSize &&
    now() < deadline - 800
  ) {
    const item = state.pendingJobs.shift();
    if (!item) break;
    jobsProcessed++;
    processedCount++;

    const prevCount = llmCallsMade.count;
    const existing = await repo.getJob(item.job.source, item.job.sourceId);
    const existingData = existing
      ? {
          triagedAt: existing.triaged_at || null,
          descriptionHash:
            (existing.raw as { descriptionHash?: string })?.descriptionHash || null,
        }
      : null;

    let triaged: TriagedJobResult;
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
      triaged = {
        expClass: item.ruleExp.expClass,
        expMinYears: item.ruleExp.minYears,
        geoEligibility: item.ruleGeo.geo,
        geoReason: item.ruleGeo.reason,
        summaryLine: item.job.title,
        skills: item.ruleScore.matchedSkills,
        filterReason:
          item.ruleExp.expClass === "senior"
            ? item.ruleExp.reason || "Senior experience required"
            : item.ruleGeo.geo === "restricted"
            ? item.ruleGeo.reason || "Geographically restricted"
            : item.ruleGeo.geo === "unclear"
            ? item.ruleGeo.reason.startsWith("remote-unconfirmed:")
              ? undefined
              : "location not remote / not confirmed for India"
            : undefined,
        matchScore: item.ruleScore.score,
        triagedAt: new Date().toISOString(),
        descriptionHash: existingData?.descriptionHash || undefined,
      };
    }

    if (llmCallsMade.count > prevCount) {
      state.stats.llmCalls = (state.stats.llmCalls ?? 0) + (llmCallsMade.count - prevCount);
    } else if (triaged.llmSkipped === "already") {
      state.stats.llmSkippedAlready = (state.stats.llmSkippedAlready ?? 0) + 1;
    } else if (triaged.llmSkipped === "irrelevant") {
      state.stats.llmSkippedIrrelevant = (state.stats.llmSkippedIrrelevant ?? 0) + 1;
    } else if (triaged.llmSkipped === "stale") {
      state.stats.llmSkippedStale = (state.stats.llmSkippedStale ?? 0) + 1;
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

  const remainingBoards = state.boardQueue.length;
  const pendingTriage = state.pendingJobs.length;
  const isDone = remainingBoards === 0 && pendingTriage === 0;

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
  } else {
    // Keep status as 'running' so subsequent calls or next login can resume seamlessly
    await repo.updateSearchRun(runId, {
      status: "running",
      source_counts: state.sourceCounts,
      new_jobs: state.newJobsCount,
      filtered_out: state.filteredOutCount,
      stats: state.stats,
    });
  }

  return {
    runId,
    remaining: remainingBoards + pendingTriage,
    remainingBoards,
    pendingTriage,
    processed: processedCount,
    done: isDone,
    boardsDone: state.boardsDone,
  };
}
