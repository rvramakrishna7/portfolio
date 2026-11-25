import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { InMemoryJobsRepository, setTestJobsRepository } from "../../../lib/jobs/repository";

describe("GET /r/[code]", () => {
  let repo: InMemoryJobsRepository;

  beforeEach(() => {
    repo = new InMemoryJobsRepository();
    setTestJobsRepository(repo);
  });

  it("redirects with 302 to / and adds X-Robots-Tag noindex", async () => {
    const req = new NextRequest("http://localhost:3000/r/invalid");
    const res = await GET(req, { params: Promise.resolve({ code: "invalid" }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("records nothing for unknown code but still redirects", async () => {
    const req = new NextRequest("http://localhost:3000/r/abcdef23", {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const res = await GET(req, { params: Promise.resolve({ code: "abcdef23" }) });
    expect(res.status).toBe(302);
    const visits = await repo.listVisitsWithDrafts!();
    expect(visits).toHaveLength(0);
  });

  it("records human visit with country from x-vercel-ip-country", async () => {
    const drafts = await repo.createDrafts("job-1", [
      { kind: "email", body: "Hello", track_code: "abcdef23" },
    ]);
    const trackCode = drafts[0].track_code!;

    const req = new NextRequest(`http://localhost:3000/r/${trackCode}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "x-vercel-ip-country": "US",
      },
    });
    const res = await GET(req, { params: Promise.resolve({ code: trackCode }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toBeNull();

    const visits = await repo.visitsForJob("job-1");
    expect(visits.count).toBe(1);
    expect(visits.lastVisitAt).toBeTruthy();

    const allVisits = await repo.listVisitsWithDrafts!();
    expect(allVisits).toHaveLength(1);
    expect(allVisits[0].is_bot).toBe(false);
    expect(allVisits[0].country).toBe("US");
  });

  it("records bot visit when user-agent is a crawler or empty, excluding it from job visit count", async () => {
    const drafts = await repo.createDrafts("job-1", [
      { kind: "email", body: "Hello", track_code: "abcdef23" },
    ]);
    const trackCode = drafts[0].track_code!;

    // 1. Crawler UA
    const reqBot = new NextRequest(`http://localhost:3000/r/${trackCode}`, {
      headers: {
        "user-agent": "facebookexternalhit/1.1",
      },
    });
    await GET(reqBot, { params: Promise.resolve({ code: trackCode }) });

    // 2. Empty UA
    const reqEmpty = new NextRequest(`http://localhost:3000/r/${trackCode}`);
    await GET(reqEmpty, { params: Promise.resolve({ code: trackCode }) });

    const visits = await repo.visitsForJob("job-1");
    expect(visits.count).toBe(0); // Bots excluded

    const allVisits = await repo.listVisitsWithDrafts!();
    expect(allVisits).toHaveLength(2);
    expect(allVisits.every((v) => v.is_bot)).toBe(true);
  });
});
