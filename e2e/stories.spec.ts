import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";
import { absoluteUrl } from "../src/lib/site";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

test.describe("Story pages — /work/[slug] (S4 / R3)", () => {
  for (let i = 0; i < STORIES.length; i++) {
    const story = STORIES[i];
    const prevStory =
      STORIES[(i - 1 + STORIES.length) % STORIES.length];
    const nextStory = STORIES[(i + 1) % STORIES.length];

    test(`story ${story.number} (${story.slug}): TEST-009 & TEST-018 - metadata, nine-part structure, diagram, results table, pager`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const response = await page.goto(`/work/${story.slug}`);
      expect(response?.status()).toBe(200);

      // Metadata (TEST-009)
      await expect(page).toHaveTitle(story.seoTitle);
      expect(story.seoTitle.length).toBeLessThanOrEqual(75);
      expect(story.seoTitle.startsWith(story.title)).toBe(true);

      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute(
        "content",
        story.seoDescription
      );
      expect(story.seoDescription.length).toBeLessThanOrEqual(160);

      // Canonical link
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute(
        "href",
        new RegExp(`/work/${story.slug}$`)
      );

      // Open Graph & Twitter
      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveAttribute("content", story.seoTitle);
      const twitterCard = page.locator('meta[name="twitter:card"]');
      await expect(twitterCard).toHaveAttribute(
        "content",
        "summary_large_image"
      );

      // JSON-LD BreadcrumbList
      const jsonLdScript = page.locator('script[type="application/ld+json"]');
      await expect(jsonLdScript).toHaveCount(1);
      const jsonLdContent = JSON.parse(await jsonLdScript.innerText());
      expect(jsonLdContent["@type"]).toBe("BreadcrumbList");
      expect(jsonLdContent.itemListElement).toEqual([
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Work",
          item: absoluteUrl("/#work"),
        },
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

      // Part 1: Breadcrumbs, eyebrow, hook, chips
      const crumbs = page.locator(".crumbs");
      await expect(crumbs.locator("a").nth(0)).toHaveText("Home");
      await expect(crumbs.locator("a").nth(0)).toHaveAttribute("href", "/");
      await expect(crumbs.locator("a").nth(1)).toHaveText("Work");
      await expect(crumbs.locator("a").nth(1)).toHaveAttribute("href", "/#work");
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText(
        story.title
      );

      await expect(page.locator(".case-hero .eyebrow")).toHaveText(
        story.category
      );
      await expect(page.locator(".case-hero .hook")).toHaveText(story.headline);

      const chips = page.locator(".case-hero ul.chips li");
      await expect(chips).toHaveCount(story.tags.length);
      for (let c = 0; c < story.tags.length; c++) {
        await expect(chips.nth(c)).toHaveText(story.tags[c]);
      }

      // Part 2: The problem
      const probSec = page.locator(".case-body section", {
        has: page.locator('h2:text-is("The problem")'),
      });
      await expect(probSec).toBeVisible();
      await expect(probSec.locator("p")).toHaveText(story.problem);

      // Part 3: Why the usual way fell short (if present)
      if (story.whyItFellShort) {
        const fellShortSec = page.locator(".case-body section", {
          has: page.locator('h2:text-is("Why the usual way fell short")'),
        });
        await expect(fellShortSec).toBeVisible();
        await expect(fellShortSec.locator("p")).toHaveText(
          story.whyItFellShort
        );
      }

      // Part 4: What I built + inline SVG diagram
      const builtSec = page.locator(".case-body section", {
        has: page.locator('h2:text-is("What I built")'),
      });
      await expect(builtSec).toBeVisible();
      await expect(builtSec.locator("p").first()).toHaveText(story.built);

      const diagramFigure = builtSec.locator("figure.case-diagram");
      await expect(diagramFigure).toBeVisible();
      const desktopSvg = diagramFigure.locator("svg.diag-desktop");
      const mobileSvg = diagramFigure.locator("svg.diag-mobile");
      await expect(desktopSvg).toBeVisible();
      await expect(desktopSvg).toHaveAttribute("role", "img");
      await expect(desktopSvg.locator("title")).toHaveCount(1);
      await expect(mobileSvg).toHaveAttribute("role", "img");
      await expect(mobileSvg.locator("title")).toHaveCount(1);

      // Part 5: Engineering decisions
      const decisionsSec = page.locator(".case-body section", {
        has: page.locator('h2:text-is("Engineering decisions")'),
      });
      await expect(decisionsSec).toBeVisible();
      const decisionsList = decisionsSec.locator("ul li");
      await expect(decisionsList).toHaveCount(story.decisions.length);
      for (let d = 0; d < story.decisions.length; d++) {
        await expect(decisionsList.nth(d)).toHaveText(story.decisions[d]);
      }

      // Part 6: Reliability (if present)
      if (story.reliability) {
        const relSec = page.locator(".case-body section", {
          has: page.locator(
            'h2:text-is("Reliability, security and failure handling")'
          ),
        });
        await expect(relSec).toBeVisible();
        await expect(relSec.locator("p")).toHaveText(story.reliability);
      }

      // Part 7: Results (table: measure | value | how it was measured)
      const resultsSec = page.locator(".case-body section", {
        has: page.locator('h2:text-is("Results")'),
      });
      await expect(resultsSec).toBeVisible();

      const tableRows = resultsSec.locator("table.case-results-table tbody tr");
      await expect(tableRows).toHaveCount(story.resultsTable.length);
      for (let r = 0; r < story.resultsTable.length; r++) {
        const row = tableRows.nth(r);
        await expect(row.locator("th")).toHaveText(
          story.resultsTable[r].measure
        );
        await expect(row.locator("td strong")).toHaveText(
          story.resultsTable[r].value
        );
        await expect(row.locator("td").nth(1)).toHaveText(
          story.resultsTable[r].howMeasured
        );
      }

      // Honest notes
      if (story.honestNote) {
        await expect(
          resultsSec.locator(".case-note", { hasText: story.honestNote })
        ).toBeVisible();
      }
      if (story.hackathonNote) {
        await expect(
          resultsSec.locator(".case-note", { hasText: story.hackathonNote })
        ).toBeVisible();
      }
      if (story.hardenNext) {
        const hardenBox = resultsSec.locator(".case-note", {
          hasText: "What I would harden next:",
        });
        await expect(hardenBox).toBeVisible();
        const hardenItems = hardenBox.locator("ul li");
        await expect(hardenItems).toHaveCount(story.hardenNext.length);
        for (let h = 0; h < story.hardenNext.length; h++) {
          await expect(hardenItems.nth(h)).toHaveText(story.hardenNext[h]);
        }
      }

      // Part 8: Built with & links
      const builtWithSec = page.locator(".case-body section", {
        has: page.locator('h2:text-is("Built with")'),
      });
      await expect(builtWithSec).toBeVisible();
      const techChips = builtWithSec.locator("ul.chips li");
      await expect(techChips).toHaveCount(story.tags.length);

      const links = builtWithSec.locator(".case-links a");
      if (story.live) {
        await expect(links).toHaveCount(2);
        await expect(links.nth(0)).toHaveText("Open the live site");
        await expect(links.nth(0)).toHaveAttribute("href", story.live);
        await expect(links.nth(0)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(links.nth(0)).toHaveAttribute("target", "_blank");

        await expect(links.nth(1)).toHaveText("See the code");
        await expect(links.nth(1)).toHaveAttribute("href", story.code);
        await expect(links.nth(1)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(links.nth(1)).toHaveAttribute("target", "_blank");
      } else {
        await expect(links).toHaveCount(1);
        await expect(links.nth(0)).toHaveText("See the code");
        await expect(links.nth(0)).toHaveAttribute("href", story.code);
        await expect(links.nth(0)).toHaveAttribute(
          "rel",
          "noopener noreferrer"
        );
        await expect(links.nth(0)).toHaveAttribute("target", "_blank");
      }

      // Part 9: Pager
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

    test(`story ${story.number} (${story.slug}): content safety check (no email, no mailto, no Top 50)`, async ({
      page,
    }) => {
      await page.goto(`/work/${story.slug}`);
      const html = await page.content();

      // Assert no email address or mailto
      expect(html).not.toContain("mailto:");
      expect(html).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

      // Assert no unconfirmed hackathon claim
      expect(html).not.toContain("Top 50");
      expect(html).not.toContain("Top 50 finalist");
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
      await expect(page.locator(".case-hero .hook")).toHaveText(story.headline);
      await expect(page.locator(".case-body")).toBeVisible();
      await expect(
        page.locator("figure.case-diagram svg.diag-desktop")
      ).toBeVisible();
      await context.close();
    });

    test(`story ${story.number} (${story.slug}): TEST-015 - axe scan in light and dark themes at 375 px and 1440 px`, async ({
      page,
    }) => {
      for (const theme of ["light", "dark"] as const) {
        for (const width of [375, 1440] as const) {
          await page.setViewportSize({
            width,
            height: width < 768 ? 812 : 900,
          });
          await page.emulateMedia({ colorScheme: theme });
          await page.addInitScript((t) => {
            localStorage.setItem("theme", t);
            document.documentElement.dataset.theme = t;
          }, theme);
          await page.goto(`/work/${story.slug}`);

          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();
          expect(
            results.violations,
            `Axe violations on /work/${story.slug} (${theme} theme at ${width}px)`
          ).toEqual([]);
        }
      }
    });

    test(`story ${story.number} (${story.slug}): TEST-016 - responsive at all 5 widths in both themes, no horizontal scroll, captures diagram screenshots`, async ({
      page,
    }) => {
      test.setTimeout(90000);

      for (const theme of ["light", "dark"] as const) {
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await page.emulateMedia({ colorScheme: theme });
          await page.addInitScript((t) => {
            localStorage.setItem("theme", t);
            document.documentElement.dataset.theme = t;
          }, theme);
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
            `Expected no horizontal scroll on /work/${story.slug} at ${viewport.width}px (${theme} theme)`
          ).toBe(true);

          // Capture diagram screenshots at 375 and 1280 in both themes
          if (viewport.width === 375 || viewport.width === 1280) {
            const diagram = page.locator("figure.case-diagram");
            if (await diagram.isVisible()) {
              await diagram.screenshot({
                path: path.join(
                  process.cwd(),
                  "e2e",
                  "screenshots",
                  `diagram-${story.slug}-${viewport.width}-${theme}.png`
                ),
              });
            }
          }
        }
      }
    });

    test(`story ${story.number} (${story.slug}): TEST-018 - at 375 px diagram labels are at least 12 px effective size`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/work/${story.slug}`);

      const metrics = await page.evaluate(() => {
        const svgs = Array.from(
          document.querySelectorAll("figure.case-diagram svg")
        );
        const visibleSvg = svgs.find((s) => {
          const style = window.getComputedStyle(s);
          return style.display !== "none" && s.getBoundingClientRect().height > 0;
        });
        if (!visibleSvg) return { count: 0, minHeight: 0, items: [] };

        const texts = Array.from(visibleSvg.querySelectorAll("text"));
        const items = texts.map((t) => ({
          text: t.textContent?.trim() || "",
          height: Math.round(t.getBoundingClientRect().height * 10) / 10,
        }));
        const minHeight = Math.min(...items.map((i) => i.height));
        return { count: items.length, minHeight, items };
      });

      expect(metrics.count).toBeGreaterThan(0);
      expect(
        metrics.minHeight,
        `Expected all diagram labels at 375 px to be >= 12 px height, but min was ${metrics.minHeight} px`
      ).toBeGreaterThanOrEqual(12);
    });
  }

  test("TEST-018: pager order traverses restart-options > mcp-gateway > vouch > zync > restart-options", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/work/restart-options");

    const expectedOrder = [
      "restart-options",
      "mcp-gateway",
      "vouch",
      "zync",
      "restart-options",
    ];

    // Traverse forward via Next link
    for (let i = 0; i < expectedOrder.length - 1; i++) {
      const current = expectedOrder[i];
      const nextExpected = expectedOrder[i + 1];

      await expect(page).toHaveURL(new RegExp(`/work/${current}$`));
      const nextLink = page.locator("nav.pager a.next");
      await expect(nextLink).toHaveAttribute("href", `/work/${nextExpected}`);
      await nextLink.click();
    }
    await expect(page).toHaveURL(/\/work\/restart-options$/);

    // Traverse backward via Previous link
    const expectedReverse = [
      "restart-options",
      "zync",
      "vouch",
      "mcp-gateway",
      "restart-options",
    ];
    for (let i = 0; i < expectedReverse.length - 1; i++) {
      const current = expectedReverse[i];
      const prevExpected = expectedReverse[i + 1];

      await expect(page).toHaveURL(new RegExp(`/work/${current}$`));
      const prevLink = page.locator("nav.pager a").first();
      await expect(prevLink).toHaveAttribute("href", `/work/${prevExpected}`);
      await prevLink.click();
    }
    await expect(page).toHaveURL(/\/work\/restart-options$/);
  });

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
        const [cleanPath] = href.split("#");
        if (cleanPath) {
          internalLinks.add(cleanPath);
        } else {
          internalLinks.add("/");
        }
      }
    }

    expect(internalLinks.size).toBeGreaterThan(0);

    const resumeRes = await page.request.get("/resume.pdf");
    expect(resumeRes.status()).toBe(200);
    expect(resumeRes.headers()["content-type"]).toContain("application/pdf");

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
