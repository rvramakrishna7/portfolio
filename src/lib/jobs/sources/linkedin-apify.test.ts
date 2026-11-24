import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseApifyLinkedInItems,
  startApifyLinkedInRun,
  checkApifyRunStatus,
  fetchApifyDatasetItems,
  canStartNewApifyRun,
  sanitizeErrorMessage,
  buildApifyLinkedInInput,
} from "./linkedin-apify";

describe("LinkedIn Apify Adapter (src/lib/jobs/sources/linkedin-apify.ts)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_LINKEDIN_ACTOR_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("buildApifyLinkedInInput matches the required automly schema exactly with no extra keys", () => {
    const input = buildApifyLinkedInInput();
    const keys = Object.keys(input).sort();
    const expectedKeys = [
      "experienceLevel",
      "fetchDetails",
      "keywords",
      "location",
      "maxResults",
      "proxyConfiguration",
      "scrapeCompany",
      "sortBy",
      "timePosted",
      "workplaceType",
    ].sort();
    expect(keys).toEqual(expectedKeys);
    expect(input).toEqual({
      keywords: "software engineer",
      location: "India",
      workplaceType: "remote",
      experienceLevel: "entry",
      timePosted: "past-week",
      sortBy: "date",
      maxResults: 100,
      fetchDetails: false,
      scrapeCompany: false,
      proxyConfiguration: { useApifyProxy: true },
    });
  });

  it("parses real item from automly/linkedin-jobs-scraper actor output correctly", () => {
    const realFixture = [
      {
        jobId: "4493288054",
        jobUrl: "https://in.linkedin.com/jobs/view/software-engineer-iii-java-springboot-aws-at-jpmorganchase-4493288054",
        title: "Software Engineer III Java Springboot AWS",
        company: "JPMorganChase",
        companyUrl: "https://www.linkedin.com/company/jpmorganchase",
        location: "Bengaluru, Karnataka, India",
        postedDate: "2026-11-21",
        postedTimeAgo: "2 days ago",
        benefits: "Actively Hiring",
      },
    ];

    const jobs = parseApifyLinkedInItems(realFixture);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe("linkedin");
    expect(jobs[0].sourceId).toBe("4493288054");
    expect(jobs[0].title).toBe("Software Engineer III Java Springboot AWS");
    expect(jobs[0].company).toBe("JPMorganChase");
    expect(jobs[0].location).toBe("Bengaluru, Karnataka, India");
    expect(jobs[0].url).toBe(
      "https://in.linkedin.com/jobs/view/software-engineer-iii-java-springboot-aws-at-jpmorganchase-4493288054"
    );
    expect(jobs[0].postedAt).toBe(new Date("2026-11-21").toISOString());
    expect(jobs[0].isRemote).toBe(true);
  });

  it("fails open when APIFY_API_TOKEN is missing", async () => {
    const res = await startApifyLinkedInRun();
    expect(res.started).toBe(false);
    expect(res.error).toBe("apify not configured");
  });

  it("parses structured LinkedIn job items into NormalizedJob", () => {
    const rawData = [
      {
        id: "1001",
        title: "Junior Frontend Engineer",
        company: "Stripe",
        location: "Bengaluru, India (Remote)",
        url: "https://www.linkedin.com/jobs/view/1001",
        description: "<p>Looking for a Junior Frontend Engineer skilled in React & TypeScript.</p>",
        postedAt: "2026-11-20T10:00:00.000Z",
        isRemote: true,
      },
    ];

    const jobs = parseApifyLinkedInItems(rawData);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe("linkedin");
    expect(jobs[0].sourceId).toBe("1001");
    expect(jobs[0].title).toBe("Junior Frontend Engineer");
    expect(jobs[0].company).toBe("Stripe");
    expect(jobs[0].location).toContain("Bengaluru");
    expect(jobs[0].url).toBe("https://www.linkedin.com/jobs/view/1001");
    expect(jobs[0].description).toBe(
      "Looking for a Junior Frontend Engineer skilled in React & TypeScript."
    );
    expect(jobs[0].isRemote).toBe(true);
  });

  it("extracts title and company from unstructured post scraper items", () => {
    const rawData = [
      {
        urn: "urn:li:activity:7123456789",
        text: "Hiring Alert: Full Stack Developer at Razorpay! Apply via link: https://jobs.lever.co/razorpay/123",
        date: "2026-11-22T08:00:00.000Z",
      },
    ];

    const jobs = parseApifyLinkedInItems(rawData);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Full Stack Developer");
    expect(jobs[0].company).toBe("Razorpay");
    expect(jobs[0].source).toBe("linkedin");
  });

  it("starts asynchronous Apify run with Authorization Bearer, input schema and maxTotalChargeUsd guard", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";
    process.env.APIFY_LINKEDIN_ACTOR_ID = "custom-actor/linkedin";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: "run-xyz-123",
          defaultDatasetId: "dataset-abc-789",
          status: "RUNNING",
        },
      }),
    });

    const res = await startApifyLinkedInRun({ fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("https://api.apify.com/v2/acts/custom-actor~linkedin/runs");
    expect(callUrl).toContain("maxTotalChargeUsd=0.25");
    expect(callUrl).not.toContain("token=");

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.method).toBe("POST");
    expect(callOpts.headers.Authorization).toBe("Bearer test_token_123");

    const body = JSON.parse(callOpts.body);
    expect(body.keywords).toBe("software engineer");
    expect(body.location).toBe("India");
    expect(body.workplaceType).toBe("remote");
    expect(body.experienceLevel).toBe("entry");
    expect(body.maxResults).toBe(100);

    expect(res.started).toBe(true);
    expect(res.apifyRunId).toBe("run-xyz-123");
    expect(res.apifyDatasetId).toBe("dataset-abc-789");
    expect(res.status).toBe("RUNNING");
  });

  it("surfaces and sanitizes HTTP 400 error with body message", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            type: "INVALID_INPUT",
            message: "Input is not valid: field 'keywords' must be string with token=secret_xyz12345678",
          },
        }),
    });

    const res = await startApifyLinkedInRun({ fetchFn: mockFetch });
    expect(res.started).toBe(false);
    expect(res.error).toContain("Apify start returned HTTP 400");
    expect(res.error).toContain("INVALID_INPUT: Input is not valid");
    expect(res.error).not.toContain("secret_xyz");
  });

  it("failed start does not count towards the 20-hour guard (does not block a retry)", () => {
    const now = 1700000000000;
    const clock = () => now;

    // Past run had a failed start (no apifyRunId, apifyStatus 'FAILED')
    const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    const failedRun = [
      {
        stats: {
          apifyStartedAt: oneHourAgo,
          apifyStatus: "FAILED",
          apifyError: "Apify start returned HTTP 400",
        },
      },
    ];
    // Guard allows starting because it didn't succeed with a run ID
    expect(canStartNewApifyRun(failedRun, clock).allowed).toBe(true);

    // If it has an apifyRunId, it counts as started
    const successfulRun = [
      {
        stats: {
          apifyRunId: "run-success-123",
          apifyStartedAt: oneHourAgo,
          apifyStatus: "RUNNING",
        },
      },
    ];
    expect(canStartNewApifyRun(successfulRun, clock).allowed).toBe(false);
  });

  it("checks Apify actor run status (pending, succeeded, failed)", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";

    // 1. Pending run
    const mockRunningFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "run-1", status: "RUNNING" },
      }),
    });
    const runRes = await checkApifyRunStatus("run-1", { fetchFn: mockRunningFetch });
    expect(runRes.status).toBe("RUNNING");

    // 2. Succeeded run
    const mockSuccessFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" },
      }),
    });
    const successRes = await checkApifyRunStatus("run-1", { fetchFn: mockSuccessFetch });
    expect(successRes.status).toBe("SUCCEEDED");
    expect(successRes.defaultDatasetId).toBe("ds-1");

    // 3. Failed run
    const mockFailedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "run-1", status: "TIMED-OUT" },
      }),
    });
    const failedRes = await checkApifyRunStatus("run-1", { fetchFn: mockFailedFetch });
    expect(failedRes.status).toBe("TIMED-OUT");
  });

  it("fetches dataset items from Apify dataset (limit 200)", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "li-1",
          title: "Junior Backend Developer",
          company: "Acme Corp",
          url: "https://linkedin.com/jobs/view/1",
          description: "Junior role",
        },
      ],
    });

    const res = await fetchApifyDatasetItems("ds-1", { limit: 200, fetchFn: mockFetch });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/datasets/ds-1/items?limit=200");
    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0].title).toBe("Junior Backend Developer");
  });

  it("enforces the 20-hour rate limit and cost guard (canStartNewApifyRun)", () => {
    const now = 1700000000000;
    const clock = () => now;

    // No past runs -> allowed
    expect(canStartNewApifyRun([], clock).allowed).toBe(true);

    // Run was 22 hours ago -> allowed
    const twentyTwoHoursAgo = new Date(now - 22 * 60 * 60 * 1000).toISOString();
    const oldRun = [{ stats: { apifyRunId: "run-old", apifyStartedAt: twentyTwoHoursAgo } }];
    expect(canStartNewApifyRun(oldRun, clock).allowed).toBe(true);

    // Run was 5 hours ago -> refused
    const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    const recentRun = [{ stats: { apifyRunId: "run-recent", apifyStartedAt: fiveHoursAgo } }];
    const recentGuard = canStartNewApifyRun(recentRun, clock);
    expect(recentGuard.allowed).toBe(false);
    expect(recentGuard.reason).toContain("minimum interval is 20h");

    // Multiple runs in 20 hours -> refused
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const multiRuns = [
      { stats: { apifyRunId: "run-1", apifyStartedAt: twoHoursAgo } },
      { stats: { apifyRunId: "run-2", apifyStartedAt: fiveHoursAgo } },
    ];
    expect(canStartNewApifyRun(multiRuns, clock).allowed).toBe(false);
  });

  it("sanitizes error messages by stripping URLs with query tokens", () => {
    const rawError = "Request failed to https://api.apify.com/v2/acts/foo/runs?token=secret_token_123456789";
    const sanitized = sanitizeErrorMessage(rawError);
    expect(sanitized).not.toContain("secret_token");
    expect(sanitized).toBe("Request failed to https://api.apify.com/v2/acts/foo/runs");
  });
});
