import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { sendAllApproved } from "@/lib/outreach/send-email";

export const maxDuration = 60;

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

// Sends the approved, unsent email drafts, a limited number per click (see MAX_SENDS_PER_REQUEST) and never past the daily cap.
export async function POST(req: Request) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const repo = getJobsRepository();
  const summary = await sendAllApproved(repo);
  const counts = await repo.countDrafts();
  return NextResponse.json({ ...summary, counts }, { headers: HEADERS });
}
