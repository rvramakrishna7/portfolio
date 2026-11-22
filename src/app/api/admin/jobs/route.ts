import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";

export async function GET(req: Request) {
  // Defense in depth: Verify session directly in the route handler
  const { session, errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  return NextResponse.json(
    {
      jobs: [],
      user: session.sub,
    },
    {
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}
