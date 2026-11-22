import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getJobsRepository } from "@/lib/jobs/repository";
import { z } from "zod";

const QuerySchema = z.object({
  view: z.enum(["shortlist", "all", "hidden"]).optional(),
  source: z.string().optional(),
  q: z.string().optional(),
  status: z.enum(["new", "shortlisted", "skipped", "applied"]).optional(),
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
  const [jobsData, statsData, lastRun] = await Promise.all([
    repo.getJobs(parsed.data),
    repo.getStats(),
    repo.getLastSearchRun(),
  ]);

  return NextResponse.json(
    {
      jobs: jobsData.jobs,
      total: jobsData.total,
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
