import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";
import { createSessionToken } from "../../../../../lib/admin/session";

describe("POST /api/admin/contacts/find", () => {
  const originalEnv = process.env;
  const SECRET = "test-secret-at-least-32-characters-long-12345";
  const URL_ = "http://localhost:3000/api/admin/contacts/find";

  function req(body: unknown, opts: { auth?: boolean; origin?: boolean } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.auth !== false) headers.cookie = `admin=${createSessionToken(SECRET)}`;
    if (opts.origin !== false) headers.origin = "http://localhost:3000";
    return new Request(URL_, { method: "POST", headers, body: JSON.stringify(body) });
  }

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SESSION_SECRET: SECRET, HUNTER_API_KEY: "secret-hunter-key" };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("rejects missing login and bad origin", async () => {
    expect((await POST(req({ action: "company", domain: "acme.com" }, { auth: false }))).status).toBe(401);
    expect((await POST(req({ action: "company", domain: "acme.com" }, { origin: false }))).status).toBe(403);
  });

  it("says Hunter is not set up when the key is missing", async () => {
    delete process.env.HUNTER_API_KEY;
    const res = await POST(req({ action: "company", domain: "acme.com" }));
    expect(res.status).toBe(503);
  });

  it("rejects an invalid payload", async () => {
    const res = await POST(req({ action: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns ranked contacts and never leaks the key", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { emails: [{ value: "sam@acme.com", position: "Recruiter", confidence: 80 }] } }), {
        status: 200,
        headers: { "x-credits-left": "40" },
      })
    );
    const res = await POST(req({ action: "company", domain: "acme.com" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret-hunter-key");
    const json = JSON.parse(text);
    expect(json.contacts[0].email).toBe("sam@acme.com");
    expect(json.creditsLeft).toBe(40);
    expect(String(spy.mock.calls[0][0])).not.toContain("secret-hunter-key");
  });

  it("refuses a person lookup with a non LinkedIn link", async () => {
    const res = await POST(req({ action: "person", domain: "acme.com", linkedinUrl: "https://example.com/x" }));
    expect(res.status).toBe(400);
  });

  it("GET reports configuration without the key", async () => {
    const g = await GET(
      new Request(`${URL_}?company=Acme`, { headers: { cookie: `admin=${createSessionToken(SECRET)}` } })
    );
    const json = await g.json();
    expect(json.hunterConfigured).toBe(true);
    expect(JSON.stringify(json)).not.toContain("secret-hunter-key");
    expect(json.linkedinSearchUrl).toContain("keywords=recruiter%20Acme");
  });
});
