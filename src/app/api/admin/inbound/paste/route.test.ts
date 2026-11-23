import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createSessionToken } from "../../../../../lib/admin/session";
import { getSessionCookieName } from "../../../../../lib/admin/cookie";

vi.mock("../../../../../lib/jobs/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/jobs/repository")>();
  const testRepo = new actual.InMemoryJobsRepository();
  return {
    ...actual,
    getJobsRepository: () => testRepo,
  };
});

describe("POST /api/admin/inbound/paste", () => {
  const originalEnv = process.env;
  const SECRET = "secret_must_be_at_least_32_characters_long_123456";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function getValidCookie(): string {
    const token = createSessionToken(SECRET);
    return `${getSessionCookieName()}=${token}`;
  }

  function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/admin/inbound/paste", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: getValidCookie(),
        Origin: "http://localhost:3000",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/inbound/paste", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "Hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("returns 403 when origin is invalid", async () => {
    const req = makeRequest({ text: "Hiring: Dev" }, { Origin: "https://attacker.com" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when neither text nor url is provided", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("blocks SSRF attempts on internal/loopback URLs", async () => {
    const req = makeRequest({ url: "http://127.0.0.1:8080/admin" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("SSRF Blocked");
  });

  it("parses and ingests pasted job text successfully", async () => {
    const text = `
Role: Junior Frontend Developer
Company: Notion
Location: Remote (India or Worldwide)
Apply: https://notion.so/careers/frontend-jr
Tech stack: React, TypeScript, Next.js. Freshers welcome!
`;
    const req = makeRequest({ text });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.added).toBe(1);
    expect(data.duplicates).toBe(0);
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].company).toBe("Notion");
    expect(data.jobs[0].title).toBe("Junior Frontend Developer");
  });

  it("handles duplicate submissions gracefully", async () => {
    const text = `
Role: Python Backend Developer
Company: Datadog
Location: Remote
Apply: https://datadog.com/jobs/python-backend
Python and FastAPI role.
`;
    const res1 = await POST(makeRequest({ text }));
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.added).toBe(1);

    // Submit identical text again
    const res2 = await POST(makeRequest({ text }));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.added).toBe(0);
    expect(data2.duplicates).toBe(1);
  });
});
