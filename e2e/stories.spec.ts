import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";
import { absoluteUrl } from "../src/lib/site";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

test.describe("Story pages — /work/[slug] (S4)", () => {
  for (let i = 0; i < STORIES.length; i++) {
    const story = STORIES[i];
    const prevStory =
      STORIES[(i - 1 + STORIES.length) % STORIES.length];
    const nextStory = STORIES[(i + 1) % STORIES.length];

    test(`story ${story.number} (${story.slug}): 200, metadata, breadcrumbs, content, results, proof, pager`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const response = await page.goto(`/work/${story.slug}`);
      expect(response?.status()).toBe(200);

      // Metadata
      await expect(page).toHaveTitle(`${story.title}: ${story.tag} | Ramakrishna`);
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute("content", story.seoDescription);

      // Canonical link
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", new RegExp(`/work/${story.slug}$`));

      // Open Graph & Twitter
      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveAttribute(
        "content",
        `${story.title}: ${story.tag} | Ramakrishna`
      );
      const twitterCard = page.locator('meta[name="twitter:card"]');
      await expect(twitterCard).toHaveAttribute("content", "summary_large_image");

      // JSON-LD BreadcrumbList
      const jsonLdScript = page.locator('script[type="application/ld+json"]');
      await expect(jsonLdScript).toHaveCount(1);
      const jsonLdContent = JSON.parse(await jsonLdScript.innerText());
      expect(jsonLdContent["@type"]).toBe("BreadcrumbList");
      expect(jsonLdContent.itemListElement).toEqual([
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Work", item: absoluteUrl("/#work") },
        {
          "@type": "ListItem",
          position: 3,
          name: story.title,
          item: absoluteUrl(`/work/${story.slug}`),
        },
      ]);

      // Exactly one H1
      const h1s = page.locator("h1");
      await expect(h1s).toHaveCount(1);
      await expect(h1s).toHaveText(story.title);

      // Breadcrumbs visual
      const crumbs = page.locator(".crumbs");
      await expect(crumbs.locator("a").nth(0)).toHaveText("Home");
      await expect(crumbs.locator("a").nth(0)).toHaveAttribute("href", "/");
      await expect(crumbs.locator("a").nth(1)).toHaveText("Work");
      await expect(crumbs.locator("a").nth(1)).toHaveAttribute("href", "/#work");
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText(story.title);

      // Eyebrow and hook
      await expect(page.locator(".case-hero .eyebrow")).toHaveText(story.tag);
      await expect(page.locator(".case-hero .hook")).toHaveText(story.hook);

      // Chips
      const chips = page.locator(".case-hero ul.chips li");
      await expect(chips).toHaveCount(story.chips.length);
      for (let c = 0; c < story.chips.length; c++) {
        await expect(chips.nth(c)).toHaveText(story.chips[c]);
      }

      // Sections in case-body
      const sections = page.locator(".case-body section");
      await expect(sections).toHaveCount(5);

      // The problem
      await expect(sections.nth(0).locator("h2")).toHaveText("The problem");
      await expect(sections.nth(0).locator("p")).toHaveText(story.problem);

      // The constraint
      await expect(sections.nth(1).locator("h2")).toHaveText("The constraint");
      await expect(sections.nth(1).locator("p")).toHaveText(story.constraint);

      // What I did
      await expect(sections.nth(2).locator("h2")).toHaveText("What I did");
      const whatIDidList = sections.nth(2).locator("ul li");
      await expect(whatIDidList).toHaveCount(story.whatIDid.length);
      for (let w = 0; w < story.whatIDid.length; w++) {
        await expect(whatIDidList.nth(w)).toHaveText(story.whatIDid[w]);
      }

      // The result
      await expect(sections.nth(3).locator("h2")).toHaveText("The result");
      const resultCells = sections.nth(3).locator(".results > div");
      await expect(resultCells).toHaveCount(story.results.length);
      for (let r = 0; r < story.results.length; r++) {
        await expect(resultCells.nth(r).locator("strong")).toHaveText(
          story.results[r].value
        );
        await expect(resultCells.nth(r).locator("span")).toHaveText(
          story.results[r].label
        );
      }

      // Proof
      await expect(sections.nth(4).locator("h2")).toHaveText("Proof");
      const proofLinks = sections.nth(4).locator(".links a");
      if (story.liveUrl) {
        await expect(proofLinks).toHaveCount(2);
        await expect(proofLinks.nth(0)).toHaveText("Open the live site");
        await expect(proofLinks.nth(0)).toHaveAttribute("href", story.liveUrl);
        await expect(proofLinks.nth(0)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(proofLinks.nth(0)).toHaveAttribute("target", "_blank");

        await expect(proofLinks.nth(1)).toHaveText("See the code");
        await expect(proofLinks.nth(1)).toHaveAttribute("href", story.codeUrl);
        await expect(proofLinks.nth(1)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(proofLinks.nth(1)).toHaveAttribute("target", "_blank");
      } else {
        // No live site (e.g. MCP Gateway)
        await expect(proofLinks).toHaveCount(1);
        await expect(proofLinks.nth(0)).toHaveText("See the code");
        await expect(proofLinks.nth(0)).toHaveAttribute("href", story.codeUrl);
        await expect(proofLinks.nth(0)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(proofLinks.nth(0)).toHaveAttribute("target", "_blank");
      }

      // Pager
      const pager = page.locator("nav.pager");
      await expect(pager).toHaveAttribute("aria-label", "More stories");
      const prevLink = pager.locator("a").nth(0);
      const nextLink = pager.locator("a").nth(1);

      await expect(prevLink).toHaveAttribute("href", `/work/${prevStory.slug}`);
      await expect(prevLink.locator("small")).toContainText("Previous");
      await expect(prevLink.locator("span")).toHaveText(prevStory.title);

      await expect(nextLink).toHaveAttribute("href", `/work/${nextStory.slug}`);
      await expect(nextLink.locator("small")).toContainText("Next");
      await expect(nextLink.locator("span")).toHaveText(nextStory.title);
    });

    test(`story ${story.number} (${story.slug}): works with JavaScript disabled`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      const response = await page.goto(`/work/${story.slug}`);
      expect(response?.status()).toBe(200);

      await expect(page.locator("h1")).toHaveText(story.title);
      await expect(page.locator(".case-hero .hook")).toHaveText(story.hook);
      await expect(page.locator(".case-body")).toBeVisible();
    });

    test(`story ${story.number} (${story.slug}): axe scan finds zero violations at 375 px and 1440 px`, async ({
      page,
    }) => {
      for (const width of [375, 1440] as const) {
        await page.setViewportSize({
          width,
          height: width < 768 ? 812 : 900,
        });
        await page.goto(`/work/${story.slug}`);

        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations,
          `Axe violations on /work/${story.slug} at ${width}px`
        ).toEqual([]);
      }
    });

    test(`story ${story.number} (${story.slug}): responsive at all 5 widths, single line results, screenshots`, async ({
      page,
    }) => {
      test.setTimeout(60000);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`/work/${story.slug}`);

        const visibleText = await page.locator("body").innerText();
        for (const token of FORBIDDEN_VISIBLE_TOKENS) {
          expect(visibleText).not.toContain(token);
        }

        const hasNoHorizontalScroll = await page.evaluate(() => {
          return (
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
          );
        });
        expect(
          hasNoHorizontalScroll,
          `Expected no horizontal scroll on /work/${story.slug} at ${viewport.width}px`
        ).toBe(true);

        // At 375 px, ensure result values are single line
        if (viewport.width === 375) {
          const strongs = page.locator(".results strong");
          const count = await strongs.count();
          for (let s = 0; s < count; s++) {
            const metrics = await strongs.nth(s).evaluate((el) => {
              const cs = window.getComputedStyle(el);
              const lh =
                parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
              return {
                text: el.textContent,
                height: el.getBoundingClientRect().height,
                lineHeight: lh,
              };
            });
            expect(
              metrics.height,
              `Result value "${metrics.text}" at 375 px wrapped (height: ${metrics.height}px, line-height: ${metrics.lineHeight}px)`
            ).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
          }
        }

        await page.screenshot({
          path: path.join(
            process.cwd(),
            "e2e",
            "screenshots",
            `story-${story.slug}-${viewport.width}.png`
          ),
          fullPage: true,
        });
      }
    });
  }

  test("unknown slug /work/nope returns 404 with noindex and not-found template", async ({
    page,
  }) => {
    const response = await page.goto("/work/nope");
    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText(
      "That page is not on this sheet."
    );
    const robots = page.locator('meta[name="robots"]').first();
    await expect(robots).toHaveAttribute("content", "noindex");
  });

  test("command palette navigates to each of the 4 story pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.locator("dialog#palette")).toHaveAttribute(
      "data-ready",
      "true"
    );

    for (const story of STORIES) {
      await expect(page.locator("dialog#palette")).toHaveAttribute(
        "data-ready",
        "true"
      );
      await page.keyboard.press("Control+k");
      const dialog = page.locator("dialog#palette");
      await expect(dialog).toBeVisible();

      const input = dialog.locator("#pal-input");
      await input.fill(story.title);

      const targetLink = dialog.locator(
        `#pal-list a[href="/work/${story.slug}"]`
      );
      await expect(targetLink).toBeVisible();
      await targetLink.click();

      await expect(page).toHaveURL(new RegExp(`/work/${story.slug}$`));
      await expect(page.locator("h1")).toHaveText(story.title);

      // Return to home for next iteration
      await page.goto("/");
    }
  });

  test("TEST-012: every internal link on /, story pages, and /nope returns 200 (or 404 for /nope)", async ({
    page,
  }) => {
    const pagesToCrawl = [
      "/",
      ...STORIES.map((s) => `/work/${s.slug}`),
      "/nope",
    ];

    const internalLinks = new Set<string>();

    for (const pagePath of pagesToCrawl) {
      await page.goto(pagePath);
      const links = await page.locator("a[href]").evaluateAll((els) =>
        els
          .map((el) => el.getAttribute("href") || "")
          .filter(
            (href) =>
              href.startsWith("/") &&
              !href.startsWith("//")
          )
      );

      for (const href of links) {
        // Strip fragment (#work, etc.) for HTTP fetch verification
        const [cleanPath] = href.split("#");
        if (cleanPath) {
          internalLinks.add(cleanPath);
        } else {
          internalLinks.add("/");
        }
      }
    }

    expect(internalLinks.size).toBeGreaterThan(0);

    for (const href of internalLinks) {
      const res = await page.request.get(href);
      if (href === "/nope" || href.includes("nope")) {
        expect(res.status(), `Expected 404 for ${href}`).toBe(404);
      } else {
        expect(res.status(), `Expected 200 for internal link ${href}`).toBe(200);
      }
    }
  });
});
