import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import { generateApplicationAnswer, ALLOWED_WORD_LIMITS } from "../../../../../lib/outreach/answer";
import type { StoredJob } from "../../../../../lib/jobs/repository";

export const maxDuration = 60;

const Schema = z.object({
  description: z.string().min(20, "Paste the job description first").max(6000),
  questions: z.array(z.string().trim().min(3).max(800)).min(1, "Add at least one question").max(5),
  maxWords: z
    .number()
    .refine((n) => (ALLOWED_WORD_LIMITS as readonly number[]).includes(n))
    .optional(),
  title: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
});

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

// Answers questions from a pasted job description. Nothing is saved.
export async function POST(req: Request) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: HEADERS });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400, headers: HEADERS });
  }

  const { description, questions, maxWords, title, company } = parsed.data;
  const now = new Date().toISOString();
  const job: StoredJob = {
    id: "pasted",
    source: "pasted",
    source_id: "pasted",
    url: "",
    title: title?.trim() || "the role in the pasted description",
    company: company?.trim() || "the company",
    location: null,
    remote_scope: null,
    description,
    posted_at: null,
    fetched_at: now,
    exp_min_years: null,
    exp_class: "unclear",
    geo_eligibility: "unclear",
    geo_reason: null,
    skills: [],
    filter_reason: null,
    summary_line: null,
    match_score: null,
    status: "new",
    raw: {},
    last_seen_at: now,
  };

  const answers: Array<{ question: string; answer?: string; error?: string }> = [];
  for (const question of questions) {
    try {
      const draft = await generateApplicationAnswer({ job, question, pastedDescription: description, maxWords });
      // A pasted answer is not tracked, so show the plain portfolio link
      const plain = draft.body.replace(/https?:\/\/[^\s/]+\/r\/[A-Za-z0-9_-]+/g, "https://rramakrishna.vercel.app");
      answers.push({ question, answer: plain });
    } catch (err) {
      answers.push({ question, error: err instanceof Error ? err.message : "Could not write this answer" });
    }
  }

  return NextResponse.json({ answers }, { headers: HEADERS });
}
