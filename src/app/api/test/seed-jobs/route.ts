import { NextResponse } from "next/server";
import { getJobsRepository } from "@/lib/jobs/repository";
import { NormalizedJob } from "@/lib/jobs/types";
import { TriagedJobResult } from "@/lib/llm/triage";

export async function POST() {
  const repo = getJobsRepository();

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
        postedAt: "2026-11-20T10:00:00Z",
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
        postedAt: "2026-11-21T08:00:00Z",
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
        postedAt: "2026-11-19T12:00:00Z",
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
        postedAt: "2026-11-21T09:00:00Z",
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
  ];

  for (const item of fixtureJobs) {
    await repo.upsertJob(item.job, item.triaged);
  }

  return NextResponse.json({ success: true, seeded: fixtureJobs.length });
}
