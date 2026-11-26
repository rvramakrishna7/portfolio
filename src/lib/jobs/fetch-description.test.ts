import { describe, expect, it } from "vitest";
import { fetchDescriptionFromUrl } from "./fetch-description";
import { isThinDescription, needsLogin } from "./description-text";

describe("thin descriptions and link reading", () => {
  it("treats a title with a link and a mail line as thin, a real posting as not thin", () => {
    expect(isThinDescription("IntelleWings is Hiring SDE/SDE Interns\nMail here : anik@intellewings.com\nhttps://www.linkedin.com/posts/x")).toBe(true);
    expect(isThinDescription("We are hiring a backend engineer to build and run Java services for our payments platform. ".repeat(3))).toBe(false);
  });

  it("does not try to read LinkedIn", async () => {
    expect(needsLogin("https://www.linkedin.com/posts/abc")).toBe(true);
    const res = await fetchDescriptionFromUrl("https://www.linkedin.com/posts/abc");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/paste/i);
  });

  it("reads a public page into text", async () => {
    const html = "<html><body><h1>Backend Engineer</h1><p>" + "You will build services and APIs. ".repeat(12) + "</p></body></html>";
    const res = await fetchDescriptionFromUrl("https://jobs.example.com/1", {
      dnsLookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchFn: (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch,
    });
    expect(res.ok).toBe(true);
    expect(res.text).toContain("Backend Engineer");
  });
});
