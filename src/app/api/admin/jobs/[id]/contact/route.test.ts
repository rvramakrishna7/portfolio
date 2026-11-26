import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./route";
import { createSessionToken } from "../../../../../../lib/admin/session";
import { InMemoryJobsRepository } from "../../../../../../lib/jobs/repository";

const repo = new InMemoryJobsRepository();
vi.mock("../../../../../../lib/jobs/repository", async (orig) => {
  const actual = await orig<typeof import("../../../../../../lib/jobs/repository")>();
  return { ...actual, getJobsRepository: () => repo };
});

describe("POST /api/admin/jobs/[id]/contact", () => {
  const originalEnv = process.env;
  const SECRET = "test-secret-at-least-32-characters-long-12345";

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SESSION_SECRET: SECRET };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  function req(body: unknown, auth = true) {
    const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:3000" };
    if (auth) headers.cookie = `admin=${createSessionToken(SECRET)}`;
    return new Request("http://localhost:3000/api/admin/jobs/x/contact", { method: "POST", headers, body: JSON.stringify(body) });
  }

  it("needs login", async () => {
    const res = await POST(req({ email: "a@b.co" }, false), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(401);
  });

  it("rejects a bad email and a non LinkedIn link", async () => {
    expect((await POST(req({ email: "nope" }), { params: Promise.resolve({ id: "x" }) })).status).toBe(400);
    expect(
      (await POST(req({ email: "a@b.co", linkedinUrl: "https://evil.example/in/x" }), { params: Promise.resolve({ id: "x" }) })).status
    ).toBe(400);
  });

  it("returns 404 for an unknown job and saves name, email and link for a real one", async () => {
    expect((await POST(req({ email: "a@b.co" }), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);

    await repo.upsertJob(
      {
        source: "test",
        sourceId: "contact-1",
        url: "https://example.test/job",
        title: "Engineer",
        company: "Acme",
        location: "Remote",
        remoteScope: "Worldwide",
        description: "x",
        postedAt: new Date().toISOString(),
        tags: [],
      },
      {} as never
    );
    const res = await POST(
      req({ email: "Jane@Acme.com", name: "  Jane   Doe ", linkedinUrl: "https://www.linkedin.com/in/jane-doe" }),
      { params: Promise.resolve({ id: "contact-1" }) }
    );
    expect(res.status).toBe(200);
    const job = await repo.getJob("test", "contact-1");
    expect(job?.contact_email).toBe("jane@acme.com");
    expect(job?.contact_url).toBe("https://www.linkedin.com/in/jane-doe");
    expect((job?.raw as { contactName?: string }).contactName).toBe("Jane Doe");
  });
});
