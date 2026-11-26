import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { checkRepliesAndAlert } from "@/lib/inbound/reply-detect";

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
  const res = await checkRepliesAndAlert({ repo });

  return NextResponse.json(
    {
      success: true,
      ...res,
    },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
