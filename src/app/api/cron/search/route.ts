import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { startJobSearch, stepJobSearch } from "@/lib/jobs/pipeline";

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

  // Constant-time comparison
  const authBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(expectedHeader);

  if (authBuf.length !== expBuf.length || !timingSafeEqual(authBuf, expBuf)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const maxExecutionMs = 8000; // 8s Hobby timeout safeguard

  try {
    const startResult = await startJobSearch();
    const runId = startResult.runId;
    let done = false;
    let stepsRun = 0;

    // Run steps within 8-second budget
    while (!done && Date.now() - startTime < maxExecutionMs) {
      const stepRes = await stepJobSearch(runId, 15);
      stepsRun++;
      done = stepRes.done;
      if (done) break;
    }

    return NextResponse.json({
      success: true,
      runId,
      done,
      stepsRun,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron search failed" },
      { status: 500 }
    );
  }
}
