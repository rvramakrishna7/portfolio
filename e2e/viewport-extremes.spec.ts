import { expect, test } from "@playwright/test";
import path from "path";

const EXTREME_VIEWPORTS = [
  { width: 320, height: 568, label: "320" },
  { width: 1920, height: 1080, label: "1920" },
  { width: 2560, height: 1440, label: "2560" },
];

const PAGES_TO_TEST = [
  { path: "/", name: "home" },
  { path: "/work/vouch", name: "vouch" },
  { path: "/nope", name: "nope" },
];

test.describe("Wide and narrow screen extremes (S7)", () => {
  for (const vp of EXTREME_VIEWPORTS) {
    for (const p of PAGES_TO_TEST) {
      test(`${p.name} at ${vp.width}px: no horizontal scroll and screenshot`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const res = await page.goto(p.path);
        if (p.name === "nope") {
          expect(res?.status()).toBe(404);
        } else {
          expect(res?.status()).toBe(200);
        }

        // Wait for page to settle
        await page.waitForLoadState("networkidle");

        // Verify zero horizontal scroll
        const noHorizontalScroll = await page.evaluate(() => {
          return (
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
          );
        });
        expect(
          noHorizontalScroll,
          `Expected no horizontal scroll on ${p.name} at ${vp.width}px`
        ).toBe(true);

        // Take full-page screenshot
        const screenshotPath = path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `extreme-${p.name}-${vp.width}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
      });
    }
  }
});
