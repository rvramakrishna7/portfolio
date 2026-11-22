import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { startJobSearch } from "@/lib/jobs/pipeline";

export async function POST(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  // Same-origin check
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json(
          { error: "Cross-origin requests are forbidden" },
          { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid origin header" },
        { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
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
