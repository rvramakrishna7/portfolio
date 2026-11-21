import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absoluteUrl, getSiteUrl } from "./site";

describe("site URL resolution (NEXT_PUBLIC_SITE_URL)", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is not set", () => {
    expect(getSiteUrl()).toBe("http://localhost:3000");
    expect(absoluteUrl("/work/restart-options")).toBe(
      "http://localhost:3000/work/restart-options"
    );
    expect(absoluteUrl("/sitemap.xml")).toBe(
      "http://localhost:3000/sitemap.xml"
    );
  });

  it("uses NEXT_PUBLIC_SITE_URL when set to production domain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://rramakrishna.vercel.app";
    expect(getSiteUrl()).toBe("https://rramakrishna.vercel.app");
    expect(absoluteUrl("/")).toBe("https://rramakrishna.vercel.app/");
    expect(absoluteUrl("/work/mcp-gateway")).toBe(
      "https://rramakrishna.vercel.app/work/mcp-gateway"
    );
    expect(absoluteUrl("/work/vouch")).toBe(
      "https://rramakrishna.vercel.app/work/vouch"
    );
    expect(absoluteUrl("/work/zync")).toBe(
      "https://rramakrishna.vercel.app/work/zync"
    );
    expect(absoluteUrl("/sitemap.xml")).toBe(
      "https://rramakrishna.vercel.app/sitemap.xml"
    );
    expect(absoluteUrl("/robots.txt")).toBe(
      "https://rramakrishna.vercel.app/robots.txt"
    );
  });

  it("trims trailing slashes from NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://rramakrishna.vercel.app///";
    expect(getSiteUrl()).toBe("https://rramakrishna.vercel.app");
    expect(absoluteUrl("/")).toBe("https://rramakrishna.vercel.app/");
    expect(absoluteUrl("/work/restart-options")).toBe(
      "https://rramakrishna.vercel.app/work/restart-options"
    );
  });
});
