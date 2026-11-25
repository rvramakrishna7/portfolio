import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { createSessionToken } from "../../../../../lib/admin/session";

describe("POST /api/admin/llm/test", () => {
  const originalEnv = process.env;
  const SECRET = "test-secret-at-least-32-characters-long-12345";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns 403 Forbidden without valid admin origin", async () => {
    const token = createSessionToken(SECRET);
    const req = new Request("http://localhost:3000/api/admin/llm/test", {
      method: "POST",
      headers: {
        cookie: `admin=${token}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("returns 401 Unauthorized without admin cookie", async () => {
    const req = new Request("http://localhost:3000/api/admin/llm/test", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("returns 200 with model test status and X-Robots-Tag", async () => {
    const token = createSessionToken(SECRET);
    process.env.GROQ_API_KEY = "mock-key";

    // Mock global fetch to return ok json for LLM tests
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      }),
    } as unknown as Response);

    try {
      const req = new Request("http://localhost:3000/api/admin/llm/test", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: `admin=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");

      const data = await res.json();
      expect(data.triage).toBeDefined();
      expect(data.triage.status).toBe("ok");
      expect(data.outreach).toBeDefined();
      expect(data.outreach.status).toBe("ok");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
