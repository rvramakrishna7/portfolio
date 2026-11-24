import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  startJobSearch,
  stepJobSearch,
  clearActivePipelinesForTest,
  BoardQueueItem,
} from "./pipeline";
import { InMemoryJobsRepository } from "./repository";
import { AdapterResult, NormalizedJob } from "./types";
import { TriagedJobResult } from "../llm/triage";
import { LlmProvider, LlmCompletionOpts } from "../llm/types";
import { z } from "zod";

class FakeLlmProvider implements LlmProvider {
  public callCount = 0;
  async completeJson<T>(_opts: LlmCompletionOpts, schema: z.ZodType<T>): Promise<T | null> {
    this.callCount++;
    const sample = {
      expClass: "junior",
      minYears: 1,
      geo: "worldwide",
      geoReason: "Open worldwide",
      summaryLine: "Junior software developer role",
      skills: ["TypeScript", "Node.js"],
    };
    return schema.parse(sample);
  }
}

describe("Resumable Job Search Pipeline", () => {
  let repo: InMemoryJobsRepository;
  let fakeLlm: FakeLlmProvider;

  beforeEach(() => {
    repo = new InMemoryJobsRepository();
    fakeLlm = new FakeLlmProvider();
    clearActivePipelinesForTest();
  });

  it("completes a run with 10 fake boards across several step calls within budget", async () => {
    let virtualTime = 1000;
    const clock = () => virtualTime;

    const fakeBoards: BoardQueueItem[] = Array.from({ length: 10 }, (_, i) => ({
      platform: i % 2 === 0 ? "greenhouse" : "ashby",
      name: `company-${i + 1}`,
    }));

    const startRes = await startJobSearch(repo, {
      boardQueue: fakeBoards,
      fetchAggregatorsFn: async () => ({ jobs: [] }),
    });
    expect(startRes.runId).toBeDefined();
    expect(startRes.remainingBoards).toBe(10);

    // Each board advances virtual clock by 800ms (batch of 3 takes 2400ms)
    const fakeBoardFetch = async (board: BoardQueueItem): Promise<AdapterResult> => {
      virtualTime += 800;
      const job: NormalizedJob = {
        source: board.platform,
        sourceId: `${board.name}-job-1`,
        url: `https://example.com/${board.name}/1`,
        title: "Junior Full Stack Engineer",
        company: board.name,
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "TypeScript and Next.js developer.",
        postedAt: new Date().toISOString(),
        tags: ["typescript"],
      };
      return { jobs: [job] };
    };

    let done = false;
    let stepsCount = 0;

    // Step loop with 6000ms maxDurationMs budget per step
    while (!done && stepsCount < 10) {
      const stepRes = await stepJobSearch(startRes.runId, 15, repo, fakeLlm, {
        maxDurationMs: 6000,
        clock,
        fetchBoardFn: fakeBoardFetch,
      });

      stepsCount++;
      done = stepRes.done;

      if (stepsCount === 1) {
        expect(stepRes.done).toBe(false);
        expect(stepRes.remainingBoards).toBeLessThan(10);
        expect(stepRes.remainingBoards).toBeGreaterThan(0);
      }
    }

    // Must have taken more than 1 step to finish all 10 boards
    expect(stepsCount).toBeGreaterThan(1);
    expect(done).toBe(true);

    const finalRun = await repo.getSearchRun(startRes.runId);
    expect(finalRun?.status).toBe("done");
    expect(finalRun?.stats?.boardsDone).toBe(10);
  });

  it("ensures a step never exceeds its budget", async () => {
    let virtualTime = 10_000;
    const clock = () => virtualTime;

    const fakeBoards: BoardQueueItem[] = Array.from({ length: 15 }, (_, i) => ({
      platform: "greenhouse",
      name: `board-${i + 1}`,
    }));

    const startRes = await startJobSearch(repo, {
      boardQueue: fakeBoards,
      fetchAggregatorsFn: async () => ({ jobs: [] }),
    });

    // Advance clock by 600ms per board
    const fakeBoardFetch = async (board: BoardQueueItem): Promise<AdapterResult> => {
      virtualTime += 600;
      return {
        jobs: [
          {
            source: board.platform,
            sourceId: `${board.name}-001`,
            url: `https://example.com/${board.name}`,
            title: "Frontend Developer",
            company: board.name,
            location: "Remote",
            remoteScope: "Remote",
            description: "React and TypeScript role.",
            postedAt: new Date().toISOString(),
            tags: ["react"],
          },
        ],
      };
    };

    const budgetMs = 5000;
    const stepStart = clock();

    const stepRes = await stepJobSearch(startRes.runId, 15, repo, fakeLlm, {
      maxDurationMs: budgetMs,
      clock,
      fetchBoardFn: fakeBoardFetch,
    });

    const elapsed = clock() - stepStart;
    // Step loop stops before starting a batch if now >= deadline - 1500
    // Each batch of 3 adds 1800ms.
    // So elapsed should never exceed budgetMs + 1800ms (one batch overshot at worst)
    expect(elapsed).toBeLessThanOrEqual(budgetMs + 1800);
    expect(stepRes.done).toBe(false);
  });

  it("handles an adapter that throws by recording the board error without failing the run", async () => {
    const virtualTime = 1000;
    const clock = () => virtualTime;

    const fakeBoards: BoardQueueItem[] = [
      { platform: "greenhouse", name: "good-company" },
      { platform: "lever", name: "failing-company" },
      { platform: "ashby", name: "another-good-company" },
    ];

    const startRes = await startJobSearch(repo, {
      boardQueue: fakeBoards,
      fetchAggregatorsFn: async () => ({ jobs: [] }),
    });

    const fakeBoardFetch = async (board: BoardQueueItem): Promise<AdapterResult> => {
      if (board.name === "failing-company") {
        throw new Error(`Simulated network failure on ${board.name}`);
      }
      return { jobs: [] };
    };

    const stepRes = await stepJobSearch(startRes.runId, 15, repo, fakeLlm, {
      maxDurationMs: 8000,
      clock,
      fetchBoardFn: fakeBoardFetch,
    });

    expect(stepRes).toBeDefined();

    const run = await repo.getSearchRun(startRes.runId);
    expect(run).toBeDefined();
    expect(run?.stats?.boardErrors).toBeDefined();

    const errorKeys = Object.keys(run?.stats?.boardErrors || {});
    expect(errorKeys).toContain("lever_failing-company");
    expect(run?.stats?.boardErrors?.["lever_failing-company"]).toContain("Simulated network failure");
  });

  it("resumes after an interruption without duplicating jobs on source+source_id", async () => {
    let virtualTime = 1000;
    const clock = () => virtualTime;

    const fakeBoards: BoardQueueItem[] = [
      { platform: "greenhouse", name: "alpha" },
      { platform: "greenhouse", name: "beta" },
      { platform: "ashby", name: "gamma" },
      { platform: "ashby", name: "delta" },
    ];

    const startRes = await startJobSearch(repo, {
      boardQueue: fakeBoards,
      fetchAggregatorsFn: async () => ({ jobs: [] }),
    });

    const fakeBoardFetch = async (board: BoardQueueItem): Promise<AdapterResult> => {
      virtualTime += 1000;
      return {
        jobs: [
          {
            source: board.platform,
            sourceId: `${board.name}-fixed-id`,
            url: `https://example.com/${board.name}`,
            title: "Junior Backend Developer",
            company: board.name,
            location: "Worldwide",
            remoteScope: "Worldwide",
            description: "Go and TypeScript developer.",
            postedAt: new Date().toISOString(),
            tags: ["typescript"],
          },
        ],
      };
    };

    // First step with short budget (should only process first batch of boards)
    const step1 = await stepJobSearch(startRes.runId, 15, repo, fakeLlm, {
      maxDurationMs: 3500,
      clock,
      fetchBoardFn: fakeBoardFetch,
    });

    expect(step1.done).toBe(false);
    expect(step1.boardsDone).toBeGreaterThan(0);

    const jobsAfterStep1 = await repo.getJobs({ limit: 100 });
    expect(jobsAfterStep1.total).toBeGreaterThan(0);

    // Simulate server restart / process exit by clearing in-memory pipeline state
    clearActivePipelinesForTest();

    // Re-run step on the same runId (should rehydrate from repo)
    const step2 = await stepJobSearch(startRes.runId, 15, repo, fakeLlm, {
      maxDurationMs: 5000,
      clock,
      fetchBoardFn: fakeBoardFetch,
    });

    const jobsAfterStep2 = await repo.getJobs({ limit: 100 });

    // The jobs must not be duplicated because upsertJob dedupes by (source, sourceId)
    const allSourceIds = jobsAfterStep2.jobs.map((j) => `${j.source}:${j.source_id}`);
    const uniqueSourceIds = new Set(allSourceIds);
    expect(allSourceIds.length).toBe(uniqueSourceIds.size);
    expect(step2.boardsDone).toBeGreaterThanOrEqual(step1.boardsDone ?? 0);
  });

  it("integrates LinkedIn and IMAP alert sources and tracks counts/errors", async () => {
    const fakeLinkedInJob: NormalizedJob = {
      source: "linkedin",
      sourceId: "li-123",
      url: "https://linkedin.com/jobs/view/123",
      title: "Junior React Engineer",
      company: "Acme Corp",
      location: "Remote",
      remoteScope: "Remote",
      description: "React and Next.js role.",
      postedAt: new Date().toISOString(),
      tags: ["react"],
    };

    const startRes = await startJobSearch(repo, {
      boardQueue: [],
      fetchAggregatorsFn: async () => ({ jobs: [] }),
      fetchLinkedInFn: async () => ({ jobs: [fakeLinkedInJob] }),
      ingestImapFn: async () => ({
        fetched: 2,
        added: 1,
        duplicates: 0,
        filtered: 0,
        seen: 2,
        fromKnownSender: 2,
        fromFallbackSubject: 0,
        parsedJobs: 2,
      }),
    });

    const run = await repo.getSearchRun(startRes.runId);
    expect(run?.source_counts.linkedin).toBe(1);
    expect(run?.source_counts.email).toBe(1);
    expect(run?.source_counts.telegram).toBe(0);
    expect(run?.source_counts.whatsapp).toBe(0);
    expect(run?.source_counts.paste).toBe(0);
  });

  it("rehydrates stats from stored run without dropping apify and email fields when activePipelines is empty", async () => {
    const runId = await repo.createSearchRun();
    await repo.updateSearchRun(runId, {
      status: "running",
      source_counts: { email: 3, remoteok: 2 },
      stats: {
        llmCalls: 0,
        llmErrors: 0,
        llmSkippedStale: 0,
        shortlistCount: 1,
        hiddenCount: 1,
        languageHidden: 0,
        boardsTotal: 1,
        boardsDone: 0,
        apifyRunId: "test-apify-run-999",
        apifyDatasetId: "test-dataset-999",
        apifyStartedAt: "2026-11-24T12:00:00.000Z",
        apifyStatus: "RUNNING",
        apifyCollected: false,
        sources: {
          email: {
            status: "ok",
            count: 3,
            seen: 5,
            parsedJobs: 3,
            fromKnownSender: 3,
          },
        },
      },
    });

    clearActivePipelinesForTest();

    const fakeBoardFetch = async (): Promise<AdapterResult> => ({ jobs: [] });
    await stepJobSearch(runId, 15, repo, fakeLlm, {
      maxDurationMs: 5000,
      fetchBoardFn: fakeBoardFetch,
    });

    const updatedRun = await repo.getSearchRun(runId);
    expect(updatedRun?.stats?.apifyRunId).toBe("test-apify-run-999");
    expect(updatedRun?.stats?.apifyDatasetId).toBe("test-dataset-999");
    expect(updatedRun?.stats?.apifyStartedAt).toBe("2026-11-24T12:00:00.000Z");
    expect(updatedRun?.stats?.sources?.email).toBeDefined();
    expect(updatedRun?.stats?.sources?.email?.count).toBe(3);
    expect(updatedRun?.stats?.sources?.email?.seen).toBe(5);
  });

  it("updates earlier search_runs row with apifyCollected: true and apifyStatus: SUCCEEDED when collecting pending run", async () => {
    const earlierRunId = await repo.createSearchRun();
    await repo.updateSearchRun(earlierRunId, {
      status: "running",
      stats: {
        llmCalls: 0,
        llmErrors: 0,
        llmSkippedStale: 0,
        shortlistCount: 0,
        hiddenCount: 0,
        languageHidden: 0,
        apifyRunId: "earlier-apify-run-123",
        apifyDatasetId: "earlier-dataset-123",
        apifyStartedAt: "2026-11-24T10:00:00.000Z",
        apifyStatus: "RUNNING",
        apifyCollected: false,
      },
    });

    const mockCheckStatus = vi.fn().mockResolvedValue({ status: "SUCCEEDED" });
    const mockFetchItems = vi.fn().mockResolvedValue({
      jobs: [
        {
          source: "linkedin",
          sourceId: "li-collect-1",
          url: "https://linkedin.com/jobs/view/101",
          title: "Junior Backend Engineer",
          company: "Acme",
          location: "Remote",
          remoteScope: "Remote",
          description: "Junior developer role with Go and Node.js.",
          postedAt: new Date().toISOString(),
          tags: ["go"],
        },
      ],
    });

    const startRes = await startJobSearch(repo, {
      boardQueue: [],
      fetchAggregatorsFn: async () => ({ jobs: [] }),
      checkApifyStatusFn: mockCheckStatus,
      fetchApifyItemsFn: mockFetchItems,
    });

    expect(startRes.runId).toBeDefined();
    expect(startRes.runId).not.toBe(earlierRunId);

    const earlierRun = await repo.getSearchRun(earlierRunId);
    expect(earlierRun?.stats?.apifyCollected).toBe(true);
    expect(earlierRun?.stats?.apifyStatus).toBe("SUCCEEDED");
    expect(earlierRun?.stats?.apifyCount).toBe(1);

    const newRun = await repo.getSearchRun(startRes.runId);
    expect(newRun?.stats?.apifyCollected).toBe(true);
    expect(newRun?.stats?.apifyStatus).toBe("SUCCEEDED");
    expect(newRun?.source_counts.linkedin).toBe(1);
  });

  it("immediately writes apifyRunId, apifyDatasetId, and apifyStartedAt to current search_runs row when started", async () => {
    const mockStartRun = vi.fn().mockImplementation(async () => ({
      started: true,
      apifyRunId: "new-actor-run-456",
      apifyDatasetId: "new-dataset-456",
      startedAt: "2026-11-24T15:30:00.000Z",
    }));

    const startRes = await startJobSearch(repo, {
      boardQueue: [],
      fetchAggregatorsFn: async () => ({ jobs: [] }),
      startApifyRunFn: mockStartRun,
    });

    const row = await repo.getSearchRun(startRes.runId);
    expect(row?.stats?.apifyRunId).toBe("new-actor-run-456");
    expect(row?.stats?.apifyDatasetId).toBe("new-dataset-456");
    expect(row?.stats?.apifyStartedAt).toBe("2026-11-24T15:30:00.000Z");
    expect(row?.stats?.apifyStatus).toBe("RUNNING");
  });

  it("persists collected jobs immediately to repository and ON CONFLICT UPDATE preserves refined classifications", async () => {
    const ambiguousJob: NormalizedJob = {
      source: "remoteok",
      sourceId: "ro-ambiguous-1",
      url: "https://remoteok.com/job/1",
      title: "Full Stack Engineer",
      company: "InnovateTech",
      location: "Worldwide",
      remoteScope: "Worldwide",
      description: "Join us as a full stack engineer building modern web applications.",
      postedAt: new Date().toISOString(),
      tags: ["react", "node"],
    };

    // 1. In startJobSearch, ambiguous job is immediately persisted to the DB with rule defaults
    await startJobSearch(repo, {
      boardQueue: [],
      fetchAggregatorsFn: async () => ({ jobs: [ambiguousJob] }),
    });

    const storedBeforeTriage = await repo.getJob("remoteok", "ro-ambiguous-1");
    expect(storedBeforeTriage).toBeDefined();
    expect(storedBeforeTriage?.title).toBe("Full Stack Engineer");
    expect(storedBeforeTriage?.exp_class).toBe("unclear");
    expect(storedBeforeTriage?.triaged_at).toBeNull();

    // 2. Simulate server restart by clearing in-memory state
    clearActivePipelinesForTest();

    // 3. LLM triages and refines the job to "junior"
    const refinedTriaged: TriagedJobResult = {
      expClass: "junior",
      expMinYears: 1,
      geoEligibility: "worldwide",
      geoReason: "Open globally",
      summaryLine: "Junior Full Stack role",
      skills: ["React", "Node.js"],
      matchScore: 80,
      triagedAt: new Date().toISOString(),
    };
    await repo.upsertJob(ambiguousJob, refinedTriaged);

    const storedAfterTriage = await repo.getJob("remoteok", "ro-ambiguous-1");
    expect(storedAfterTriage?.exp_class).toBe("junior");
    expect(storedAfterTriage?.triaged_at).toBeTruthy();

    // 4. A subsequent search run re-fetches the same job with unrefined/unclear rule defaults
    const unrefinedTriaged: TriagedJobResult = {
      expClass: "unclear",
      expMinYears: null,
      geoEligibility: "unclear",
      geoReason: "Need more info",
      summaryLine: "Full Stack Engineer",
      skills: [],
      matchScore: 50,
    };
    await repo.upsertJob(ambiguousJob, unrefinedTriaged);

    // 5. Assert the good classification (junior, worldwide, triaged_at) was NOT downgraded to unclear
    const storedAfterRefetch = await repo.getJob("remoteok", "ro-ambiguous-1");
    expect(storedAfterRefetch?.exp_class).toBe("junior");
    expect(storedAfterRefetch?.geo_eligibility).toBe("worldwide");
    expect(storedAfterRefetch?.summary_line).toBe("Junior Full Stack role");
    expect(storedAfterRefetch?.triaged_at).toBeTruthy();
  });
});
