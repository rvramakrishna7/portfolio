import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLinkedInApify,
  parseApifyLinkedInItems,
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

  it("fails open when APIFY_API_TOKEN is missing", async () => {
    const res = await fetchLinkedInApify();
    expect(res.jobs).toEqual([]);
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

  it("fetches dataset items from Apify endpoint with proper parameters", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";
    process.env.APIFY_LINKEDIN_ACTOR_ID = "custom-actor/linkedin";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "2001",
          title: "Python Developer",
          company: "FastAPI Co",
          url: "https://linkedin.com/jobs/view/2001",
          description: "Python and backend role",
        },
      ],
    });

    const res = await fetchLinkedInApify({ fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("https://api.apify.com/v2/acts/custom-actor%2Flinkedin/run-sync-get-dataset-items");
    expect(callUrl).toContain("token=test_token_123");

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.method).toBe("POST");
    const body = JSON.parse(callOpts.body);
    expect(body.limit).toBe(25);
    expect(body.postedWithin).toBe("3d");

    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0].title).toBe("Python Developer");
    expect(res.error).toBeUndefined();
  });

  it("handles Apify API HTTP errors gracefully", async () => {
    process.env.APIFY_API_TOKEN = "test_token_123";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
    });

    const res = await fetchLinkedInApify({ fetchFn: mockFetch });
    expect(res.jobs).toEqual([]);
    expect(res.error).toBe("Apify returned HTTP 402");
  });
});
