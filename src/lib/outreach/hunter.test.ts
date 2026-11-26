import { describe, it, expect } from "vitest";
import {
  domainSearch,
  findEmail,
  verifyEmail,
  normalizeDomain,
  linkedinHandleFromUrl,
  linkedinSearchUrl,
  hasHunterKey,
} from "./hunter";

const ENV = { HUNTER_API_KEY: "test-key" } as unknown as NodeJS.ProcessEnv;

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { impl, calls };
}

describe("Hunter client (src/lib/outreach/hunter.ts)", () => {
  it("normalizes a pasted website into a bare domain and rejects junk", () => {
    expect(normalizeDomain("https://www.Saraswati.ai/careers?x=1")).toBe("saraswati.ai");
    expect(normalizeDomain("acme.com")).toBe("acme.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("reports whether a key is configured", () => {
    expect(hasHunterKey({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasHunterKey({ HUNTER_API_KEY: "  " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(hasHunterKey(ENV)).toBe(true);
  });

  it("never calls Hunter without a key", async () => {
    const f = fakeFetch(200, {});
    const r = await domainSearch("acme.com", { fetchImpl: f.impl, env: {} as NodeJS.ProcessEnv });
    expect(r.ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });

  it("sends the key in a header, not in the URL", async () => {
    const f = fakeFetch(200, { data: { emails: [] } });
    await domainSearch("acme.com", { fetchImpl: f.impl, env: ENV });
    expect(f.calls[0].url).not.toContain("test-key");
    expect((f.calls[0].init?.headers as Record<string, string>)["X-API-KEY"]).toBe("test-key");
    expect(f.calls[0].url).toContain("domain=acme.com");
    expect(f.calls[0].url).toContain("limit=5");
  });

  it("ranks recruiters first in domain search and limits the list", async () => {
    const f = fakeFetch(
      200,
      {
        data: {
          emails: [
            { value: "Dev@acme.com", first_name: "Dev", position: "Software Engineer", confidence: 99 },
            { value: "sam@acme.com", first_name: "Sam", position: "Talent Acquisition Lead", confidence: 70 },
            { value: "ceo@acme.com", first_name: "Cee", position: "CEO", confidence: 90 },
          ],
        },
      },
      { "x-credits-left": "41" }
    );
    const r = await domainSearch("acme.com", { fetchImpl: f.impl, env: ENV, limit: 2 });
    expect(r.ok).toBe(true);
    expect(r.creditsLeft).toBe(41);
    expect(r.data?.map((c) => c.email)).toEqual(["sam@acme.com", "ceo@acme.com"]);
  });

  it("gives clear errors for bad key and exhausted credits", async () => {
    const bad = await domainSearch("acme.com", { fetchImpl: fakeFetch(401, {}).impl, env: ENV });
    expect(bad.error).toMatch(/API key/);
    const limited = await domainSearch("acme.com", { fetchImpl: fakeFetch(429, {}).impl, env: ENV });
    expect(limited.error).toMatch(/credits/);
  });

  it("treats 404 as no results and network failure as an error", async () => {
    const none = await findEmail({ domain: "acme.com", fullName: "Jane Doe" }, { fetchImpl: fakeFetch(404, {}).impl, env: ENV });
    expect(none.ok).toBe(true);
    expect(none.data).toBeNull();
    const down = await domainSearch("acme.com", {
      fetchImpl: async () => {
        throw new Error("boom");
      },
      env: ENV,
    });
    expect(down.ok).toBe(false);
    expect(down.error).toMatch(/reach Hunter/);
  });

  it("finds one person by full name or LinkedIn handle, and requires one of them", async () => {
    const f = fakeFetch(200, { data: { email: "jane.doe@acme.com", first_name: "Jane", last_name: "Doe", position: "Recruiter", score: 91 } });
    const byName = await findEmail({ domain: "acme.com", fullName: "Jane  Doe" }, { fetchImpl: f.impl, env: ENV });
    expect(byName.data?.email).toBe("jane.doe@acme.com");
    expect(f.calls[0].url).toContain("full_name=Jane+Doe");
    await findEmail({ domain: "acme.com", linkedinHandle: "jane-doe-1" }, { fetchImpl: f.impl, env: ENV });
    expect(f.calls[1].url).toContain("linkedin_handle=jane-doe-1");
    const missing = await findEmail({ domain: "acme.com", fullName: "Jane" }, { fetchImpl: f.impl, env: ENV });
    expect(missing.ok).toBe(false);
    expect(f.calls).toHaveLength(2);
  });

  it("verifies an email and maps unknown statuses safely", async () => {
    const ok = await verifyEmail("a@acme.com", { fetchImpl: fakeFetch(200, { data: { status: "valid", score: 95 } }).impl, env: ENV });
    expect(ok.data).toEqual({ status: "valid", score: 95 });
    const odd = await verifyEmail("a@acme.com", { fetchImpl: fakeFetch(200, { data: { status: "weird" } }).impl, env: ENV });
    expect(odd.data?.status).toBe("unknown");
    const bad = await verifyEmail("nope", { fetchImpl: fakeFetch(200, {}).impl, env: ENV });
    expect(bad.ok).toBe(false);
  });

  it("builds a LinkedIn search link and extracts a handle without fetching anything", () => {
    expect(linkedinSearchUrl("Saraswati AI")).toBe(
      "https://www.linkedin.com/search/results/people/?keywords=recruiter%20Saraswati%20AI&origin=GLOBAL_SEARCH_HEADER"
    );
    expect(linkedinHandleFromUrl("https://www.linkedin.com/in/jane-doe-123/?utm=1")).toBe("jane-doe-123");
    expect(linkedinHandleFromUrl("https://example.com/jane")).toBeNull();
  });
});
