import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { POST } from "./route";
import { createSessionToken } from "../../../../../lib/admin/session";

describe("POST /api/admin/answers/quick", () => {
  const originalEnv = process.env;
  const SECRET = "test-secret-at-least-32-characters-long-12345";

  function req(body: unknown, opts: { auth?: boolean; origin?: boolean } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.auth !== false) headers.cookie = `admin=${createSessionToken(SECRET)}`;
    if (opts.origin !== false) headers.origin = "http://localhost:3000";
    return new Request("http://localhost:3000/api/admin/answers/quick", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SESSION_SECRET: SECRET };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("needs login and a matching origin", async () => {
    const ok = { description: "x".repeat(40), questions: ["Why us?"] };
    expect((await POST(req(ok, { auth: false }))).status).toBe(401);
    expect((await POST(req(ok, { origin: false }))).status).toBe(403);
  });

  it("rejects a short description, no questions, and more than 5 questions", async () => {
    expect((await POST(req({ description: "short", questions: ["Why us?"] }))).status).toBe(400);
    expect((await POST(req({ description: "x".repeat(40), questions: [] }))).status).toBe(400);
    expect(
      (await POST(req({ description: "x".repeat(40), questions: ["a1a", "b2b", "c3c", "d4d", "e5e", "f6f"] }))).status
    ).toBe(400);
  });
});
