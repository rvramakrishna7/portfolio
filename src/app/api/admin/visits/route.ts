import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getJobsRepository } from "@/lib/jobs/repository";

export async function GET(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const repo = getJobsRepository();
  const visits = repo.listVisitsWithDrafts
    ? await repo.listVisitsWithDrafts()
    : [];

  return NextResponse.json(
    { visits },
    { headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
