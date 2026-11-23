import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { startJobSearch } from "@/lib/jobs/pipeline";

export const maxDuration = 60;

export async function POST(req: Request) {
  // 1. Same-origin check using shared helper
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  // 2. Admin authorization
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const result = await startJobSearch();
    return NextResponse.json(result, {
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start job search" },
      { status: 500, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }
}
