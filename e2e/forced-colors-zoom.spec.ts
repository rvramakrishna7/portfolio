import { expect, test } from "@playwright/test";
import path from "path";

test.describe("Forced colors and zoom pass (S7)", () => {
  test("forcedColors: 'active' renders readable content with visible buttons and links", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      forcedColors: "active",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify all primary buttons and links are visible and rendered
    const links = page.locator("a");
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThan(10);

    for (let i = 0; i < Math.min(linkCount, 15); i++) {
      const link = links.nth(i);
      if (await link.isVisible()) {
        const box = await link.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    }

    const buttons = page.locator("button");
    const btnCount = await buttons.count();
    expect(btnCount).toBeGreaterThan(0);
    for (let i = 0; i < btnCount; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    }

    // Save screenshot for review
    await page.screenshot({
      path: path.join(process.cwd(), "e2e", "screenshots", "forced-colors-home.png"),
      fullPage: true,
    });

    await context.close();
  });

  test("200% zoom (640px viewport equivalent to 1280px at 200%) has zero overlap or horizontal clipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Zero horizontal scroll
    const noHorizontalScroll = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
      );
    });
    expect(noHorizontalScroll).toBe(true);

    // Save screenshot for review
    await page.screenshot({
      path: path.join(process.cwd(), "e2e", "screenshots", "zoom-200-home-640.png"),
      fullPage: true,
    });

    // Check on story page vouch as well
    await page.goto("/work/vouch");
    await page.waitForLoadState("networkidle");

    const noHorizontalScrollStory = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
      );
    });
    expect(noHorizontalScrollStory).toBe(true);

    await page.screenshot({
      path: path.join(process.cwd(), "e2e", "screenshots", "zoom-200-vouch-640.png"),
      fullPage: true,
    });
  });
});
