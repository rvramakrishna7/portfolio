import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { z } from "zod";

const PatchDraftSchema = z.object({
  subject: z.string().nullable().optional(),
  body: z.string().optional(),
  status: z.enum(["draft", "approved", "discarded"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
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

  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid patch payload" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  const updated = await repo.updateDraft(id, parsed.data);
  if (!updated) {
    return NextResponse.json(
      { error: "Draft not found" },
      { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const counts = await repo.countDrafts();

  return NextResponse.json(
    { draft: updated, counts },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
