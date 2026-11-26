import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import { getJobsRepository } from "../../../../../lib/jobs/repository";
import { GroqProvider } from "../../../../../lib/llm/groq";
import { recheckExperience } from "../../../../../lib/jobs/recheck-experience";

export const maxDuration = 60;

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

// The AI reads saved jobs that are still visible and hides the ones that need experience.
export async function POST(req: Request) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is not set" }, { status: 503, headers: HEADERS });
  }

  const result = await recheckExperience({
    repo: getJobsRepository(),
    provider: new GroqProvider(),
    limit: 25,
    deadlineMs: 42000,
  });
  return NextResponse.json(result, { headers: HEADERS });
}
