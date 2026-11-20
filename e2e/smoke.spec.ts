import path from "node:path";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

test.describe("Home smoke test (S0)", () => {
  test("renders single h1 'Ramakrishna', has no forbidden tokens, and has no horizontal scroll at all 5 widths", async ({
    page,
  }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/");

      const h1 = page.locator("main#main h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(
        "Traders lost a minute every time they moved a strike. Now it takes a few seconds."
      );

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
        `Expected no horizontal scroll at ${viewport.width}px`
      ).toBe(true);

      const screenshotPath = path.join(
        process.cwd(),
        "e2e",
        "screenshots",
        `home-${viewport.width}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
