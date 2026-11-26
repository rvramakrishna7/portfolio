import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { checkRepliesAndAlert } from "@/lib/inbound/reply-detect";
import { syncSentFromGmail } from "@/lib/inbound/sent-sync";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden: origin validation failed" },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  // First pick up mails you sent yourself from Gmail, so replies to them can be matched below.
  const sent = await syncSentFromGmail({ repo }).catch(() => ({ looked: 0, marked: 0, error: "sent sync failed" }));
  const res = await checkRepliesAndAlert({ repo });

  return NextResponse.json(
    {
      success: true,
      ...res,
      sentMarked: sent.marked,
      sentError: sent.error && sent.error !== "imap not configured" ? sent.error : undefined,
    },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
