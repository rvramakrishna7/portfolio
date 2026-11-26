import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getJobsRepository } from "@/lib/jobs/repository";

export async function GET(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const repo = getJobsRepository();
  const base = await repo.getPipelineJobs();

  // Add who the mail went to: the person's name, the address and the subject of the latest sent email.
  const pipeline = await Promise.all(
    base.map(async (item) => {
      try {
        const [job, drafts] = await Promise.all([
          repo.getJobById(item.id),
          repo.listDrafts({ jobId: item.id, kind: "email", limit: 20 }),
        ]);
        const sent = drafts
          .filter((d) => d.sent_at)
          .sort((a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime())[0];
        const raw = (typeof job?.raw === "object" && job.raw !== null ? job.raw : {}) as Record<string, unknown>;
        const contactName = typeof raw.contactName === "string" && raw.contactName.trim() ? raw.contactName.trim() : null;
        return {
          ...item,
          contactName,
          recipient: sent?.recipient || job?.contact_email || null,
          subject: sent?.subject || null,
          bouncedAt: sent?.bounced_at ? String(sent.bounced_at) : null,
        };
      } catch {
        return item;
      }
    })
  );

  return NextResponse.json(
    { pipeline },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
