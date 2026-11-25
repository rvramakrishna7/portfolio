import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { z } from "zod";

const PatchDraftSchema = z.object({
  subject: z.string().nullable().optional(),
  body: z.string().optional(),
  status: z.enum(["draft", "approved", "discarded"]).optional(),
  recipient: z
    .string()
    .nullable()
    .optional()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Invalid email format",
    }),
  action: z.enum(["mark_sent"]).optional(),
  channel: z.string().optional(),
  sent_channel: z.string().optional(),
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
  let updated;
  if (parsed.data.action === "mark_sent" || parsed.data.sent_channel) {
    const channel =
      parsed.data.channel || parsed.data.sent_channel || "manual";
    updated = await repo.markDraftSent(id, channel);
  } else {
    updated = await repo.updateDraft(id, {
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: parsed.data.status,
      recipient: parsed.data.recipient,
    });
  }
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
