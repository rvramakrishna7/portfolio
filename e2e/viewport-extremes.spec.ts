import { expect, test } from "@playwright/test";
import path from "path";

const EXTREME_VIEWPORTS = [
  { width: 320, height: 568, label: "320" },
  { width: 1920, height: 1080, label: "1920" },
  { width: 2560, height: 1440, label: "2560" },
];

test.describe("Wide and narrow screen extremes (S7b)", () => {
  for (const vp of EXTREME_VIEWPORTS) {
    test(`home page (/) at ${vp.width}px: scroll steps, open chapters, section viewport screenshots`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const res = await page.goto("/");
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");

      // Scroll through in steps so all scroll animations trigger and all chapters open
      const scrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight
      );
      for (let y = 0; y < scrollHeight; y += 400) {
        await page.evaluate(
          (top) => window.scrollTo({ top, behavior: "instant" }),
          y
        );
        await page.waitForTimeout(50);
      }
      await page.evaluate(() =>
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant",
        })
      );
      await page.waitForTimeout(100);

      // Verify zero horizontal scroll across the entire document
      const noHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
        );
      });
      expect(
        noHorizontalScroll,
        `Expected no horizontal scroll on / at ${vp.width}px`
      ).toBe(true);

      // Capture viewport screenshots for each required section
      const homeSections = [
        { selector: ".hero", name: "hero" },
        { selector: ".proof", name: "proof" },
        { selector: "#work .chapter:nth-of-type(1)", name: "chapter-1" },
        { selector: "#work .chapter:nth-of-type(2)", name: "chapter-2" },
        { selector: "#work .chapter:nth-of-type(3)", name: "chapter-3" },
        { selector: "#work .chapter:nth-of-type(4)", name: "chapter-4" },
        { selector: "#experience", name: "experience" },
        { selector: "#skills", name: "skills" },
        { selector: "#contact", name: "contact" },
      ];

      for (const sec of homeSections) {
        const loc = page.locator(sec.selector);
        await expect(loc).toBeVisible();
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(50);
        await page.screenshot({
          path: path.join(
            process.cwd(),
            "e2e",
            "screenshots",
            `extreme-home-${vp.width}-${sec.name}.png`
          ),
          fullPage: false,
        });
      }
    });

    test(`story page (/work/vouch) at ${vp.width}px: scroll steps, section viewport screenshots`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const res = await page.goto("/work/vouch");
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");

      const scrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight
      );
      for (let y = 0; y < scrollHeight; y += 400) {
        await page.evaluate(
          (top) => window.scrollTo({ top, behavior: "instant" }),
          y
        );
        await page.waitForTimeout(50);
      }

      // Verify zero horizontal scroll
      const noHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
        );
      });
      expect(
        noHorizontalScroll,
        `Expected no horizontal scroll on /work/vouch at ${vp.width}px`
      ).toBe(true);

      // Section viewport screenshots
      const vouchSections = [
        { selector: ".case-hero", name: "hero" },
        { selector: ".case-body", name: "body" },
      ];

      for (const sec of vouchSections) {
        const loc = page.locator(sec.selector);
        await expect(loc).toBeVisible();
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(50);
        await page.screenshot({
          path: path.join(
            process.cwd(),
            "e2e",
            "screenshots",
            `extreme-vouch-${vp.width}-${sec.name}.png`
          ),
          fullPage: false,
        });
      }
    });

    test(`404 page (/nope) at ${vp.width}px: zero horizontal scroll and viewport screenshot`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const res = await page.goto("/nope");
      expect(res?.status()).toBe(404);
      await page.waitForLoadState("networkidle");

      const noHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
        );
      });
      expect(
        noHorizontalScroll,
        `Expected no horizontal scroll on /nope at ${vp.width}px`
      ).toBe(true);

      await page.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `extreme-nope-${vp.width}.png`
        ),
        fullPage: false,
      });
    });
  }
});
