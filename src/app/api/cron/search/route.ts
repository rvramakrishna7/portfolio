import { NextResponse } from "next/server";
import { startJobSearch, stepJobSearch } from "@/lib/jobs/pipeline";
import { getJobsRepository } from "@/lib/jobs/repository";
import { safeCompare } from "@/lib/admin/safe-compare";
import { checkRepliesAndAlert } from "@/lib/inbound/reply-detect";

export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length === 0) {
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 401 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const expectedHeader = `Bearer ${cronSecret}`;

  if (!safeCompare(authHeader, expectedHeader)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const maxExecutionMs = 8000; // 8s budget per invocation

  try {
    const repo = getJobsRepository();
    // Continue active running run if present, or start a new run
    const lastRun = await repo.getLastSearchRun();
    let runId: string;
    if (lastRun && lastRun.status === "running") {
      runId = lastRun.id;
    } else {
      const startResult = await startJobSearch(repo);
      runId = startResult.runId;
    }

    let done = false;
    let stepsRun = 0;
    let remainingBoards = 0;
    let pendingTriage = 0;

    // Run steps within 8-second budget
    while (!done && Date.now() - startTime < maxExecutionMs) {
      const stepRes = await stepJobSearch(runId, 15, repo);
      stepsRun++;
      done = stepRes.done;
      remainingBoards = stepRes.remainingBoards;
      pendingTriage = stepRes.pendingTriage;
      if (done) break;
    }

    // Check replies and alert if budget permits
    let repliesChecked = 0;
    if (Date.now() - startTime < maxExecutionMs) {
      try {
        const replyRes = await checkRepliesAndAlert({
          repo,
          maxDurationMs: Math.max(1000, maxExecutionMs - (Date.now() - startTime)),
        });
        repliesChecked = replyRes.checked;
      } catch {
        // Silently tolerate reply check error in cron search
      }
    }

    return NextResponse.json({
      success: true,
      runId,
      done,
      stepsRun,
      remainingBoards,
      pendingTriage,
      repliesChecked,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron search failed" },
      { status: 500 }
    );
  }
}
