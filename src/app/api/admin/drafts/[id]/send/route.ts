import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { sendDraftEmail, type SendCode } from "@/lib/outreach/send-email";

export const maxDuration = 30;

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

const STATUS_BY_CODE: Record<SendCode, number> = {
  not_found: 404,
  not_sendable: 409,
  already_sent: 409,
  daily_cap: 429,
  not_configured: 503,
  send_failed: 502,
  unconfirmed: 502,
  db_error: 500,
};

// Sends one approved email draft from the owner's Gmail. Only the owner, only from the admin page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const { id } = await params;
  const repo = getJobsRepository();
  const result = await sendDraftEmail(repo, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: STATUS_BY_CODE[result.code], headers: HEADERS });
  }

  const counts = await repo.countDrafts();
  return NextResponse.json({ draft: result.draft, counts }, { headers: HEADERS });
}
