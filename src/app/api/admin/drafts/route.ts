import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import {
  generateOutreachDrafts,
  DailyLimitExceededError,
} from "@/lib/outreach/generate";
import { z } from "zod";

const PostDraftSchema = z.object({
  jobId: z.string().min(1),
});

const GetDraftSchema = z.object({
  status: z.enum(["draft", "approved", "discarded", "all"]).optional(),
  jobId: z.string().optional(),
});

export async function POST(req: Request) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const parsed = PostDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload: jobId is required" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  const job = await repo.getJobById(parsed.data.jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  try {
    const generated = await generateOutreachDrafts(job, repo);
    const drafts = await repo.createDrafts(job.id, generated);
    const counts = await repo.countDrafts();

    return NextResponse.json(
      { drafts, counts },
      { headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  } catch (err: unknown) {
    if (err instanceof DailyLimitExceededError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to generate outreach drafts";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }
}

export async function GET(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const parsed = GetDraftSchema.safeParse({
    status: searchParams.get("status") || undefined,
    jobId: searchParams.get("jobId") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  const filterStatus =
    parsed.data.status && parsed.data.status !== "all"
      ? parsed.data.status
      : undefined;

  const [drafts, counts] = await Promise.all([
    repo.listDrafts({ status: filterStatus, jobId: parsed.data.jobId }),
    repo.countDrafts(parsed.data.jobId),
  ]);

  return NextResponse.json(
    { drafts, counts },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
