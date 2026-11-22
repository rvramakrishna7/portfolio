import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["new", "shortlisted", "skipped", "applied"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  // Same-origin check for state mutations
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

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid status value" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  const ok = await repo.updateJobStatus(id, parsed.data.status);
  if (!ok) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  return NextResponse.json(
    { success: true, id, status: parsed.data.status },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
