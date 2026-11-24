import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { MAX_AGE_DAYS_DEFAULT } from "@/config/job-profile";
import { z } from "zod";

const QuerySchema = z.object({
  view: z.enum(["shortlist", "maybe", "inbox", "all", "hidden"]).optional(),
  source: z.string().optional(),
  q: z.string().optional(),
  reason: z.string().optional(),
  status: z.enum(["new", "shortlisted", "skipped", "applied"]).optional(),
  maxAgeDays: z.coerce.number().pipe(z.union([z.literal(3), z.literal(7), z.literal(10)])).default(MAX_AGE_DAYS_DEFAULT),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: Request) {
  const { session, errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    view: searchParams.get("view") || undefined,
    source: searchParams.get("source") || undefined,
    q: searchParams.get("q") || undefined,
    reason: searchParams.get("reason") || undefined,
    status: searchParams.get("status") || undefined,
    limit: searchParams.get("limit") || undefined,
    offset: searchParams.get("offset") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const repo = getJobsRepository();
  const [jobsData, statsData, lastRun, viewCounts] = await Promise.all([
    repo.getJobs(parsed.data),
    repo.getStats(),
    repo.getLastSearchRun(),
    repo.getViewCounts(parsed.data.maxAgeDays),
  ]);

  return NextResponse.json(
    {
      jobs: jobsData.jobs,
      total: jobsData.total,
      viewCounts,
      stats: statsData,
      lastRun,
      user: session.sub,
    },
    {
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}
