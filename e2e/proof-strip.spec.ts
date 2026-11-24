import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS } from "./helpers";

test.describe("Proof Strip Alignment and Behavior (UI Definition of Done)", () => {
  const VIEWPORTS = [375, 768, 1024, 1280, 1440] as const;

  for (const width of VIEWPORTS) {
    test(`proof strip responsive layout at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#proof", { waitUntil: "networkidle" });

      const proofSection = page.locator("#proof");
      await expect(proofSection).toBeVisible();

      // No horizontal scroll
      const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      );
      expect(noHorizontalScroll).toBe(true);

      // No placeholder tokens
      const text = (await proofSection.innerText()) || "";
      for (const token of FORBIDDEN_VISIBLE_TOKENS) {
        expect(text).not.toContain(token);
      }
    });
  }

  test("desktop (1440px): value, label and summary baselines line up across all 4 cards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#proof", { waitUntil: "networkidle" });

    const cards = await page.locator(".proof-grid .stat").all();
    expect(cards.length).toBe(4);

    const bigBoxes = await Promise.all(cards.map((c) => c.locator(".big").boundingBox()));
    const whatBoxes = await Promise.all(cards.map((c) => c.locator(".what").boundingBox()));
    const sumBoxes = await Promise.all(cards.map((c) => c.locator("summary").boundingBox()));

    // All 4 .big top y positions match within 1px
    for (let i = 1; i < 4; i++) {
      expect(Math.abs(bigBoxes[i]!.y - bigBoxes[0]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(whatBoxes[i]!.y - whatBoxes[0]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(sumBoxes[i]!.y - sumBoxes[0]!.y)).toBeLessThanOrEqual(1);
    }

    // Opening Card 1 expands Card 1 without shifting Card 2, 3, or 4 rows
    await cards[0].locator("summary").click();
    await page.waitForTimeout(100);

    const newBigBoxes = await Promise.all(cards.map((c) => c.locator(".big").boundingBox()));
    const newWhatBoxes = await Promise.all(cards.map((c) => c.locator(".what").boundingBox()));
    const newSumBoxes = await Promise.all(cards.map((c) => c.locator("summary").boundingBox()));

    for (let i = 0; i < 4; i++) {
      expect(Math.abs(newBigBoxes[i]!.y - bigBoxes[i]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(newWhatBoxes[i]!.y - whatBoxes[i]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(newSumBoxes[i]!.y - sumBoxes[i]!.y)).toBeLessThanOrEqual(1);
    }
  });

  test("tablet (768px): cards in each 2-card row line up with each other", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/#proof", { waitUntil: "networkidle" });

    const cards = await page.locator(".proof-grid .stat").all();
    expect(cards.length).toBe(4);

    const bigBoxes = await Promise.all(cards.map((c) => c.locator(".big").boundingBox()));
    const whatBoxes = await Promise.all(cards.map((c) => c.locator(".what").boundingBox()));
    const sumBoxes = await Promise.all(cards.map((c) => c.locator("summary").boundingBox()));

    // Row 1 (cards 0 and 1) match each other
    expect(Math.abs(bigBoxes[1]!.y - bigBoxes[0]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(whatBoxes[1]!.y - whatBoxes[0]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(sumBoxes[1]!.y - sumBoxes[0]!.y)).toBeLessThanOrEqual(1);

    // Row 2 (cards 2 and 3) match each other
    expect(Math.abs(bigBoxes[3]!.y - bigBoxes[2]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(whatBoxes[3]!.y - whatBoxes[2]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(sumBoxes[3]!.y - sumBoxes[2]!.y)).toBeLessThanOrEqual(1);
  });

  test("axe accessibility scan on #proof (light & dark)", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/#proof", { waitUntil: "networkidle" });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem("theme", t);
      }, theme);

      const results = await new AxeBuilder({ page })
        .include("#proof")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    }
  });
});
