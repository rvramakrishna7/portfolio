import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import {
  generateApplicationAnswer,
  DailyAnswerLimitExceededError,
  ALLOWED_WORD_LIMITS,
} from "@/lib/outreach/answer";
import { z } from "zod";

const PostAnswerSchema = z.object({
  jobId: z.string().min(1),
  question: z.string().min(1).max(500),
  pastedDescription: z.string().max(6000).optional(),
  maxWords: z.number().refine((n) => (ALLOWED_WORD_LIMITS as readonly number[]).includes(n)).optional(),
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

  const parsed = PostAnswerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message || "Invalid payload";
    return NextResponse.json(
      { error: issue },
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
    const answerDraft = await generateApplicationAnswer({
      job,
      question: parsed.data.question,
      pastedDescription: parsed.data.pastedDescription,
      maxWords: parsed.data.maxWords,
      repo,
    });

    const created = await repo.createDrafts(job.id, [answerDraft]);
    const [counts, answersToday] = await Promise.all([
      repo.countDrafts(),
      repo.countAnswersToday(),
    ]);

    return NextResponse.json(
      { draft: created[0], counts, answersToday },
      { headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  } catch (err: unknown) {
    if (err instanceof DailyAnswerLimitExceededError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to generate application answer";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }
}
