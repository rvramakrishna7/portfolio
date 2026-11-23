import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { stepJobSearch } from "@/lib/jobs/pipeline";
import { z } from "zod";

export const maxDuration = 60;

const StepSchema = z.object({
  runId: z.string().min(1),
  batchSize: z.number().min(1).max(50).default(15),
});

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const parsed = StepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  try {
    const result = await stepJobSearch(parsed.data.runId, parsed.data.batchSize);
    return NextResponse.json(result, {
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to step job search" },
      { status: 500, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }
}
