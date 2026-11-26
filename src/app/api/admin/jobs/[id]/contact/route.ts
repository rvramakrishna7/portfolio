import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../../lib/admin/origin";
import { getJobsRepository } from "../../../../../../lib/jobs/repository";

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

const BodySchema = z.object({
  email: z.string().max(200).regex(/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/, "Invalid email format"),
  name: z.string().max(120).nullable().optional(),
  linkedinUrl: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .refine((v) => !v || /^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\//i.test(v), { message: "Not a LinkedIn profile link" }),
});

// Remembers the person chosen for this job (email, name, LinkedIn link) so drafts greet them and fill the recipient.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: HEADERS });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact details" }, { status: 400, headers: HEADERS });
  }

  const { id } = await params;
  const repo = getJobsRepository();
  const name = parsed.data.name?.replace(/\s+/g, " ").trim() || null;
  const ok = await repo.setJobContact(id, {
    email: parsed.data.email.toLowerCase(),
    name,
    linkedinUrl: parsed.data.linkedinUrl || null,
  });
  if (!ok) return NextResponse.json({ error: "Job not found" }, { status: 404, headers: HEADERS });
  return NextResponse.json({ ok: true, contact: { email: parsed.data.email.toLowerCase(), name } }, { headers: HEADERS });
}
