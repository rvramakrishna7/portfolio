import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";

interface PageItem {
  path: string;
  expectedTitle: string;
  titleMaxLen: number;
  expectedH1: string;
  isStory: boolean;
  story?: (typeof STORIES)[number];
}

const PAGES: PageItem[] = [
  {
    path: "/",
    expectedTitle: "Ramakrishna | Software Engineer (Full-Stack, Backend, AI)",
    titleMaxLen: 60,
    expectedH1:
      "I build software that makes complex work faster, simpler and more reliable.",
    isStory: false,
  },
  ...STORIES.map((story) => ({
    path: `/work/${story.slug}`,
    expectedTitle: story.seoTitle,
    titleMaxLen: 75,
    expectedH1: story.title,
    isStory: true,
    story,
  })),
];

test.describe("SEO, Metadata, JSON-LD, Robots, and Sitemap (S6)", () => {
  test("TEST-009: Unique titles, descriptions, canonicals, OG, Twitter, and JSON-LD on all pages", async ({
    page,
    request,
  }) => {
    const titlesSeen = new Set<string>();

    for (const p of PAGES) {
      const response = await page.goto(p.path);
      expect(response?.status()).toBe(200);

      // Title check
      const title = await page.title();
      expect(title).toBe(p.expectedTitle);
      expect(title.length).toBeLessThan(p.titleMaxLen);
      expect(titlesSeen.has(title)).toBe(false);
      titlesSeen.add(title);

      if (p.isStory && p.story) {
        expect(title.startsWith(p.story.title)).toBe(true);
      }

      // Exactly one title element
      const titleElements = page.locator("head > title");
      await expect(titleElements).toHaveCount(1);

      // Description check: every page must have description under 160 chars
      const descLocator = page.locator('head > meta[name="description"]');
      await expect(descLocator).toHaveCount(1);
      const descContent = await descLocator.getAttribute("content");
      expect(descContent).toBeTruthy();
      expect(descContent!.length).toBeLessThan(160);

      if (p.isStory && p.story) {
        expect(descContent).toBe(p.story.seoDescription);
      } else {
        expect(descContent).toBe(
          "Software engineer in India (BITS Pilani, 2026). Four projects told as problems solved: options automation, AI claim checks, an MCP gateway, video meetings."
        );
      }

      // Exactly one H1
      const h1Count = await page.locator("h1").count();
      expect(h1Count).toBe(1);

      // Canonical check
      const canonicalLocator = page.locator('head > link[rel="canonical"]');
      await expect(canonicalLocator).toHaveCount(1);
      const canonicalHref = await canonicalLocator.getAttribute("href");
      expect(canonicalHref).toBeTruthy();
      expect(canonicalHref).toMatch(/^https?:\/\//);
      const canonicalPath = new URL(canonicalHref!).pathname;
      const expectedNormalizedPath = p.path === "/" ? "/" : p.path;
      expect(canonicalPath).toBe(expectedNormalizedPath);

      // Open Graph checks
      const ogTitleLocator = page.locator('head > meta[property="og:title"]');
      await expect(ogTitleLocator).toHaveCount(1);
      await expect(ogTitleLocator).toHaveAttribute("content", p.expectedTitle);

      const ogDesc = page.locator('head > meta[property="og:description"]');
      await expect(ogDesc).toHaveCount(1);
      await expect(ogDesc).toHaveAttribute("content", descContent!);

      const ogType = page.locator('head > meta[property="og:type"]');
      await expect(ogType).toHaveAttribute(
        "content",
        p.isStory ? "article" : "website"
      );

      const ogSiteName = page.locator('head > meta[property="og:site_name"]');
      await expect(ogSiteName).toHaveAttribute("content", "Ramakrishna");

      const ogImage = page.locator('head > meta[property="og:image"]');
      const ogImageUrl = await ogImage.getAttribute("content");
      expect(ogImageUrl).toBeTruthy();
      expect(ogImageUrl).toMatch(/^https?:\/\//);

      // Verify og:image returns HTTP 200 with image content type
      const imgRes = await request.get(ogImageUrl!);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"]).toContain("image");

      // Twitter checks
      const twitterCard = page.locator('head > meta[name="twitter:card"]');
      await expect(twitterCard).toHaveAttribute(
        "content",
        "summary_large_image"
      );

      const twitterTitle = page.locator('head > meta[name="twitter:title"]');
      await expect(twitterTitle).toHaveAttribute("content", p.expectedTitle);

      const twitterDesc = page.locator(
        'head > meta[name="twitter:description"]'
      );
      await expect(twitterDesc).toHaveAttribute("content", descContent!);

      // JSON-LD checks
      const jsonLdScripts = page.locator(
        'script[type="application/ld+json"]'
      );
      const scriptCount = await jsonLdScripts.count();
      expect(scriptCount).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < scriptCount; i++) {
        const text = await jsonLdScripts.nth(i).textContent();
        expect(text).toBeTruthy();
        const parsed = JSON.parse(text!);
        expect(parsed["@context"]).toBe("https://schema.org");

        // Validate JSON-LD absolute URLs only
        const validateUrlsAreAbsolute = (obj: unknown) => {
          if (!obj || typeof obj !== "object") return;
          for (const [k, v] of Object.entries(obj)) {
            if (
              (k === "@id" || k === "url" || k === "item") &&
              typeof v === "string"
            ) {
              expect(v).toMatch(/^https?:\/\//);
            } else if (k === "sameAs" && Array.isArray(v)) {
              for (const url of v) {
                expect(typeof url).toBe("string");
                expect(url).toMatch(/^https?:\/\//);
              }
            } else if (typeof v === "object") {
              validateUrlsAreAbsolute(v);
            }
          }
        };
        validateUrlsAreAbsolute(parsed);

        if (!p.isStory) {
          // Home page WebSite and Person check
          const graph = parsed["@graph"] as Array<Record<string, unknown>>;
          expect(graph).toBeDefined();
          const person = graph.find((node) => node["@type"] === "Person");
          expect(person).toBeDefined();
          expect(person?.name).toBe("Ramakrishna");
          expect(person?.jobTitle).toBe("Software Engineer");
          expect(person?.sameAs).toEqual([
            "https://www.linkedin.com/in/rvramakrishna",
            "https://github.com/rvramakrishna7",
          ]);
          expect(person?.address).toEqual({
            "@type": "PostalAddress",
            addressCountry: "India",
          });

          const website = graph.find((node) => node["@type"] === "WebSite");
          expect(website).toBeDefined();
          expect(website?.name).toBe("Ramakrishna");
        } else {
          // Story page BreadcrumbList
          expect(parsed["@type"]).toBe("BreadcrumbList");
          expect(Array.isArray(parsed.itemListElement)).toBe(true);
        }
      }
    }
  });

  test("C1 / C2: 404 /nope has noindex and is not in sitemap", async ({
    page,
    request,
  }) => {
    const response = await page.goto("/nope");
    expect(response?.status()).toBe(404);

    const robotsMeta = page.locator('head > meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute("content", "noindex");

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapText = await sitemapRes.text();
    expect(sitemapText).not.toContain("/nope");
    expect(sitemapText).not.toContain("/api");
  });

  test("C2: /robots.txt and /sitemap.xml return 200 and parse", async ({
    request,
  }) => {
    // 1. Robots.txt
    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    expect(robotsRes.headers()["content-type"]).toContain("text/plain");
    const robotsText = await robotsRes.text();
    expect(robotsText.toLowerCase()).toContain("user-agent: *");
    expect(robotsText).toContain("Disallow: /api/");
    expect(robotsText).toMatch(/Sitemap: https?:\/\/.*\/sitemap\.xml/);

    // 2. Sitemap.xml
    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    expect(sitemapRes.headers()["content-type"]).toContain("xml");
    const sitemapText = await sitemapRes.text();

    // Check all 5 URLs are in sitemap
    expect(sitemapText).toContain("<loc>");
    const locMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g) || [];
    expect(locMatches.length).toBe(5);

    for (const p of PAGES) {
      const expectedUrlPattern = new RegExp(
        `<loc>https?://[^<]+${p.path === "/" ? "" : p.path}</loc>`
      );
      expect(sitemapText).toMatch(expectedUrlPattern);
    }
  });

  test("C3: Zero NDA leaks, emails, or phone numbers in metadata and JSON-LD", async ({
    page,
  }) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /\+?[0-9]{1,4}?[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/;

    const urlsToCheck = ["/", ...STORIES.map((s) => `/work/${s.slug}`), "/nope"];

    for (const url of urlsToCheck) {
      await page.goto(url);

      // Check head meta content
      const metaTags = page.locator("head > meta");
      const metaCount = await metaTags.count();
      for (let i = 0; i < metaCount; i++) {
        const content = await metaTags.nth(i).getAttribute("content");
        if (content) {
          expect(content.toLowerCase()).not.toContain("sonicvocal.com");
          expect(content).not.toMatch(emailRegex);
          // Allow normal viewport/content numbers, but no phone number
          const name = (await metaTags.nth(i).getAttribute("name")) || "";
          if (name !== "viewport") {
            expect(content).not.toMatch(phoneRegex);
          }
        }
      }

      // Check JSON-LD
      const jsonLdScripts = page.locator('script[type="application/ld+json"]');
      const count = await jsonLdScripts.count();
      for (let i = 0; i < count; i++) {
        const text = (await jsonLdScripts.nth(i).textContent()) || "";
        expect(text.toLowerCase()).not.toContain("sonicvocal.com");
        expect(text).not.toMatch(emailRegex);
        expect(text).not.toMatch(phoneRegex);
      }
    }
  });
});
