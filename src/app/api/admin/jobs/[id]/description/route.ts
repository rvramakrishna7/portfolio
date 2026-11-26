import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../../lib/admin/origin";
import { getJobsRepository } from "../../../../../../lib/jobs/repository";
import { classifyExperience } from "../../../../../../lib/jobs/classify";
import { fetchDescriptionFromUrl } from "../../../../../../lib/jobs/fetch-description";
import { GroqProvider } from "../../../../../../lib/llm/groq";
import { experienceFilterReason, judgeExperience } from "../../../../../../lib/llm/experience-judge";

export const maxDuration = 60;

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

const BodySchema = z
  .object({
    description: z.string().max(20000).optional(),
    fetchFromLink: z.boolean().optional(),
  })
  .refine((b) => b.fetchFromLink || (b.description && b.description.trim().length >= 40), {
    message: "Paste the job description (at least a few lines)",
  });

// Saves the full job description (pasted, or read from the job link) and checks the experience with rules and the AI.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: HEADERS });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400, headers: HEADERS });
  }

  const { id } = await params;
  const repo = getJobsRepository();
  const job = await repo.getJobById(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404, headers: HEADERS });
  if (!repo.setJobDescription || !repo.applyExperienceVerdict) {
    return NextResponse.json({ error: "Not supported" }, { status: 501, headers: HEADERS });
  }

  let description = (parsed.data.description || "").trim();
  if (parsed.data.fetchFromLink) {
    const fetched = await fetchDescriptionFromUrl(job.apply_url || job.url);
    if (!fetched.ok || !fetched.text) {
      return NextResponse.json({ error: fetched.error || "Could not read the link" }, { status: 422, headers: HEADERS });
    }
    description = fetched.text;
  }

  await repo.setJobDescription(job.id, description);

  // 1. Rules first, then 2. the AI reads the whole text
  let verdict: { forFresher: "yes" | "no" | "unclear"; minYears: number | null; reason: string } | null = null;
  const ruleExp = classifyExperience(job.title, description);
  if (ruleExp.expClass === "senior") {
    verdict = { forFresher: "no", minYears: ruleExp.minYears, reason: ruleExp.reason };
    await repo.applyExperienceVerdict(job.id, {
      forFresher: "no",
      minYears: ruleExp.minYears,
      filterReason: `Experience too high: ${ruleExp.reason}`,
    });
  } else if (process.env.GROQ_API_KEY) {
    verdict = await judgeExperience({ title: job.title, company: job.company, description }, new GroqProvider());
    if (verdict) {
      await repo.applyExperienceVerdict(job.id, {
        forFresher: verdict.forFresher,
        minYears: verdict.minYears,
        filterReason: verdict.forFresher === "no" ? experienceFilterReason(verdict) : null,
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      characters: description.length,
      verdict: verdict ? verdict.forFresher : null,
      minYears: verdict?.minYears ?? null,
      reason: verdict?.reason ?? "",
      hidden: verdict?.forFresher === "no",
      aiChecked: Boolean(verdict),
    },
    { headers: HEADERS }
  );
}
