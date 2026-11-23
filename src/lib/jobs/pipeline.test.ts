import { describe, it, expect, beforeEach } from "vitest";
import {
  startJobSearch,
  stepJobSearch,
  clearActivePipelinesForTest,
  BoardQueueItem,
} from "./pipeline";
import { InMemoryJobsRepository } from "./repository";
import { AdapterResult, NormalizedJob } from "./types";
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
});
