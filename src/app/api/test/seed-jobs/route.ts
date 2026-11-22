import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/admin/require-admin";
import { getJobsRepository } from "../../../../lib/jobs/repository";
import { NormalizedJob } from "../../../../lib/jobs/types";
import { TriagedJobResult } from "../../../../lib/llm/triage";

export function isSeedRouteAllowed(envSeed = process.env.E2E_SEED): boolean {
  return envSeed === "1";
}

export async function POST(req: Request) {
  // 1. Guard: Only allowed when E2E_SEED === "1"
  if (!isSeedRouteAllowed()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // 2. Defense-in-depth: require admin session
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  const repo = getJobsRepository();

  const now = new Date();
  const daysAgoIso = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const fixtureJobs: Array<{ job: NormalizedJob; triaged: TriagedJobResult }> = [
    {
      job: {
        source: "remoteok",
        sourceId: "seed-101",
        url: "https://remoteok.com/remote-jobs/seed-101",
        title: "Junior Backend Developer",
        company: "Alpha Cloud",
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "Node.js, TypeScript, PostgreSQL. 0 to 1 years experience.",
        postedAt: daysAgoIso(2),
        tags: ["typescript", "node", "postgresql"],
      },
      triaged: {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "worldwide",
        geoReason: "Open globally",
        summaryLine: "Junior backend developer building cloud microservices with TypeScript",
        skills: ["TypeScript", "Node.js", "PostgreSQL"],
        matchScore: 85,
      },
    },
    {
      job: {
        source: "jobicy",
        sourceId: "seed-102",
        url: "https://jobicy.com/jobs/seed-102",
        title: "Full Stack Engineer (Fresher / New Grad)",
        company: "Beta Systems",
        location: "Remote - India",
        remoteScope: "India",
        description: "Fresh graduates welcome. React, Next.js, FastAPI.",
        postedAt: daysAgoIso(1),
        tags: ["react", "next.js", "python", "fastapi"],
      },
      triaged: {
        expClass: "fresher",
        expMinYears: 0,
        geoEligibility: "india_ok",
        geoReason: "Open to India / IST",
        summaryLine: "New grad full-stack opportunity using Next.js and FastAPI",
        skills: ["React", "Next.js", "Python", "FastAPI"],
        matchScore: 90,
      },
    },
    {
      job: {
        source: "arbeitnow",
        sourceId: "seed-103",
        url: "https://www.arbeitnow.com/view/seed-103",
        title: "Senior Software Architect",
        company: "MegaCorp",
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "8+ years experience required.",
        postedAt: daysAgoIso(3),
        tags: ["architecture", "kubernetes"],
      },
      triaged: {
        expClass: "senior",
        expMinYears: 8,
        geoEligibility: "worldwide",
        geoReason: "Worldwide",
        summaryLine: "Senior architecture role",
        skills: ["Kubernetes", "Docker"],
        filterReason: "Requires 8+ years of experience",
        matchScore: 15,
      },
    },
    {
      job: {
        source: "weworkremotely",
        sourceId: "seed-104",
        url: "https://weworkremotely.com/remote-jobs/seed-104",
        title: "Full Stack Developer",
        company: "US Only Labs",
        location: "US Only",
        remoteScope: "United States",
        description: "Must reside in the US. TypeScript and React.",
        postedAt: daysAgoIso(1),
        tags: ["typescript", "react"],
      },
      triaged: {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "restricted",
        geoReason: "US residents only",
        summaryLine: "US restricted full-stack role",
        skills: ["TypeScript", "React"],
        filterReason: "Geographically restricted to US",
        matchScore: 0,
      },
    },
    {
      job: {
        source: "remoteok",
        sourceId: "seed-105",
        url: "https://remoteok.com/remote-jobs/seed-105",
        title: "Software Engineer (5 Days Old)",
        company: "Fresh Startups",
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "TypeScript and Node.js. Mid-fresh opportunity.",
        postedAt: daysAgoIso(5),
        tags: ["typescript", "node"],
      },
      triaged: {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "worldwide",
        geoReason: "Open globally",
        summaryLine: "Active opening posted 5 days ago",
        skills: ["TypeScript", "Node.js"],
        matchScore: 80,
      },
    },
    {
      job: {
        source: "arbeitnow",
        sourceId: "seed-106",
        url: "https://www.arbeitnow.com/view/seed-106",
        title: "Legacy Backend Developer (15 Days Old)",
        company: "Stale Corp",
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "Node.js, PostgreSQL. Stale role from 15 days ago.",
        postedAt: daysAgoIso(15),
        tags: ["node", "postgresql"],
      },
      triaged: {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "worldwide",
        geoReason: "Open globally",
        summaryLine: "Older posting from two weeks ago",
        skills: ["Node.js", "PostgreSQL"],
        filterReason: "posted 15 days ago",
        matchScore: 75,
      },
    },
  ];

  for (const item of fixtureJobs) {
    await repo.upsertJob(item.job, item.triaged);
  }

  return NextResponse.json({ success: true, seeded: fixtureJobs.length });
}
