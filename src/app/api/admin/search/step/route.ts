import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { stepJobSearch } from "@/lib/jobs/pipeline";
import { z } from "zod";

const StepSchema = z.object({
  runId: z.string().min(1),
  batchSize: z.number().min(1).max(50).default(15),
});

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
