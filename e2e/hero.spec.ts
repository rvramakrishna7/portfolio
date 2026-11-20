import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

const HERO_H1_TEXT =
  "Traders lost a minute every time they moved a strike. Now it takes a few seconds.";

const HERO_INTRO_TEXT =
  "I'm Ramakrishna. I make AI-powered products work in the real world, and I keep the numbers to prove it. Below are four of them, told as problems that got solved.";

const TITLE_BLOCK_ROWS = [
  ["DEVELOPER", "Ramakrishna"],
  ["BASE", "Mumbai, India"],
  ["PROJECTS", "04 shipped"],
  ["TESTS PASSING", "1,212"],
] as const;

const PROOF_CARDS_EXPECTED = [
  {
    value: "1,212",
    meaning: "automated tests passing",
    how: "In the MCP gateway project. I ran all of them on 2026-11-19: 497 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers.",
  },
  {
    value: "98–100",
    meaning: "Lighthouse on three live apps",
    how: "Desktop preset. Zync 100, Restart Options 99, Vouch 98. Measured 2026-11-19.",
  },
  {
    value: "18.8 s → 3.35 s",
    meaning: "AI review time in Vouch",
    how: "The first number is one run before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct.",
  },
  {
    value: "45–60 s → 2–3 s",
    meaning: "moving a strike in Restart Options",
    how: "Timed with a stopwatch: by hand before, automatic after.",
  },
] as const;

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test.describe("Hero and proof strip (S2)", () => {
  test("renders single h1 with accent span, intro, CTA buttons, and four-row title block table", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const h1 = page.locator("main#main h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(HERO_H1_TEXT);

    const accentSpan = h1.locator("span.accent");
    await expect(accentSpan).toHaveCount(1);
    await expect(accentSpan).toHaveText("a few seconds");

    await expect(page.locator(".hero .status")).toContainText(
      "Open to full-stack and AI automation roles"
    );
    await expect(page.locator(".hero .lede")).toHaveText(HERO_INTRO_TEXT);

    const primaryCta = page.locator(".hero .cta a.btn.primary");
    await expect(primaryCta).toHaveText("Read the four stories");
    await expect(primaryCta).toHaveAttribute("href", "#work");

    const secondaryCta = page.locator(".hero .cta a.btn").nth(1);
    await expect(secondaryCta).toHaveText("Get in touch");
    await expect(secondaryCta).toHaveAttribute("href", "#contact");

    await expect(page.locator(".hero .scrollcue")).toHaveText("Scroll down");

    const rows = page.locator("table.titleblock tbody tr");
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < TITLE_BLOCK_ROWS.length; i++) {
      const [label, value] = TITLE_BLOCK_ROWS[i];
      await expect(rows.nth(i).locator("th")).toHaveText(label);
      await expect(rows.nth(i).locator("td")).toHaveText(value);
    }
  });

  test("with JavaScript disabled, all hero and proof text and all four numbers (including 1,212) are present", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("main#main h1")).toHaveText(HERO_H1_TEXT);
    await expect(page.locator(".hero .lede")).toHaveText(HERO_INTRO_TEXT);
    await expect(page.locator("#proof h2")).toHaveText(
      "Four numbers, and how I got them."
    );

    const stats = page.locator("#proof .stat");
    await expect(stats).toHaveCount(4);

    for (let i = 0; i < PROOF_CARDS_EXPECTED.length; i++) {
      const expected = PROOF_CARDS_EXPECTED[i];
      const card = stats.nth(i);
      await expect(card.locator(".big")).toHaveText(expected.value);
      await expect(card.locator(".what")).toHaveText(expected.meaning);
      await expect(card.locator(".how")).toHaveText(expected.how);
    }

    await context.close();
  });

  test("every 'How was this measured?' opens with Enter and Space and shows its sentence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const stats = page.locator("#proof .stat");
    await expect(stats).toHaveCount(4);

    for (let i = 0; i < PROOF_CARDS_EXPECTED.length; i++) {
      const card = stats.nth(i);
      const details = card.locator("details");
      const summary = card.locator("summary");
      const how = card.locator(".how");

      await expect(summary).toHaveText("How was this measured?", {
        useInnerText: true,
      });
      await expect(how).toBeHidden();

      await summary.focus();
      await expect(summary).toBeFocused();

      // Open with Enter
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open", "");
      await expect(summary).toHaveText("Hide", { useInnerText: true });
      await expect(how).toBeVisible();
      await expect(how).toHaveText(PROOF_CARDS_EXPECTED[i].how);

      // Close with Enter
      await page.keyboard.press("Enter");
      await expect(details).not.toHaveAttribute("open", "");
      await expect(summary).toHaveText("How was this measured?", {
        useInnerText: true,
      });
      await expect(how).toBeHidden();

      // Open with Space
      await page.keyboard.press("Space");
      await expect(details).toHaveAttribute("open", "");
      await expect(summary).toHaveText("Hide", { useInnerText: true });
      await expect(how).toBeVisible();
      await expect(how).toHaveText(PROOF_CARDS_EXPECTED[i].how);
    }
  });

  test("with reducedMotion: 'reduce', the status dot has no animation and 1,212 is final immediately", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const dotAnimationName = await page
      .locator(".hero .dot")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(dotAnimationName).toBe("none");

    const countSpan = page.locator('#proof [data-count="1212"]');
    await countSpan.scrollIntoViewIfNeeded();
    await expect(countSpan).toHaveText("1,212");
  });

  test("no horizontal scroll at all 5 widths, title block does not overlap h1 or buttons at 375 px, and saves screenshots", async ({
    page,
  }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/");

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

      if (viewport.width === 375) {
        const h1Box = await page.locator("main#main h1").boundingBox();
        const ctaBox = await page.locator(".hero .cta").boundingBox();
        const titleBlockBox = await page
          .locator("table.titleblock")
          .boundingBox();

        expect(h1Box).not.toBeNull();
        expect(ctaBox).not.toBeNull();
        expect(titleBlockBox).not.toBeNull();

        expect(boxesOverlap(titleBlockBox!, h1Box!)).toBe(false);
        expect(boxesOverlap(titleBlockBox!, ctaBox!)).toBe(false);
        expect(titleBlockBox!.y).toBeGreaterThanOrEqual(
          ctaBox!.y + ctaBox!.height
        );
      }

      await page.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `hero-${viewport.width}.png`
        ),
        fullPage: true,
      });
    }
  });

  test("axe scan finds zero violations on / at 375 px and 1440 px", async ({
    page,
  }) => {
    for (const width of [375, 1440] as const) {
      await page.setViewportSize({
        width,
        height: width < 768 ? 812 : 900,
      });
      await page.goto("/");

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        `Axe violations on / at ${width}px`
      ).toEqual([]);
    }
  });
});
