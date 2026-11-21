import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

test.describe("Shell and design system (S1)", () => {
  test("skip link is first focusable element, visible on focus, and jumps to #main", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.locator("a.skip");
    await expect(skipLink).toBeFocused();

    const box = await skipLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    const mainFocused = await page.evaluate(
      () => document.activeElement?.id === "main"
    );
    expect(mainFocused).toBe(true);
  });

  test("Ctrl+K opens the command palette, ArrowDown/ArrowUp navigate, and Escape closes it with focus returned", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const opener = page.locator("[data-open-palette]");
    await opener.focus();
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Control+k");

    const dialog = page.locator("dialog#palette");
    await expect(dialog).toBeVisible();
    await expect(opener).toHaveAttribute("aria-expanded", "true");

    const input = page.locator("#pal-input");
    await expect(input).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const firstItem = page.locator("#pal-list a").first();
    await expect(firstItem).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const secondItem = page.locator("#pal-list a").nth(1);
    await expect(secondItem).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(firstItem).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    await expect(opener).toBeFocused();
  });

  test("typing 'vouch' in command palette and pressing Enter navigates to /work/vouch", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.locator("dialog#palette")).toHaveAttribute(
      "data-ready",
      "true"
    );

    await page.keyboard.press("Control+k");
    const input = page.locator("#pal-input");
    await expect(input).toBeFocused();

    await input.fill("vouch");
    const items = page.locator("#pal-list a");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Vouch");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/work\/vouch$/);
  });

  test("header hides the Skills link at 375 px and shows it at 1280 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const skillsLink = page.locator("header.site-head nav a", {
      hasText: "Skills",
    });
    await expect(skillsLink).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(skillsLink).toBeVisible();
  });

  test("back-to-top and header scrolled state appear after scrolling and back-to-top scrolls to top", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const header = page.locator("header.site-head");
    const backToTop = page.locator("button.totop");

    await expect(header).not.toHaveClass(/scrolled/);
    await expect(backToTop).not.toHaveClass(/show/);

    await page.evaluate(() => window.scrollTo(0, 800));
    await expect(header).toHaveClass(/scrolled/);
    await expect(backToTop).toHaveClass(/show/);

    await backToTop.click();
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBe(0);
  });

  test("404 page renders for /nope with title 'Page not found | Ramakrishna', no horizontal scroll at 5 widths, and palette screenshots at 5 widths", async ({
    page,
  }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto("/");
      const opener = page.locator("[data-open-palette]");
      if (await opener.isVisible()) {
        await opener.click();
      } else {
        await page.keyboard.press("Control+k");
      }
      await expect(page.locator("dialog#palette")).toBeVisible();
      await page.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `palette-${viewport.width}.png`
        ),
        fullPage: true,
      });
      await page.keyboard.press("Escape");

      const response = await page.goto("/nope");
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle("Page not found | Ramakrishna");

      const h1 = page.locator("main#main h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText("That page is not on this sheet.");

      const visibleText = await page.locator("body").innerText();
      expect(visibleText).toContain(
        "The link may be old. Start from the top, or jump straight to the work."
      );
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
        `Expected no horizontal scroll on /nope at ${viewport.width}px`
      ).toBe(true);

      await page.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `404-${viewport.width}.png`
        ),
        fullPage: true,
      });
    }
  });

  test("axe scan finds zero violations on / and /nope at 375 px and 1440 px", async ({
    page,
  }) => {
    for (const width of [375, 1440] as const) {
      await page.setViewportSize({
        width,
        height: width < 768 ? 812 : 900,
      });

      for (const route of ["/", "/nope"] as const) {
        await page.goto(route);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations,
          `Axe violations on ${route} at ${width}px`
        ).toEqual([]);
      }
    }
  });

  test("works with JavaScript disabled (nav links, footer, and 404 content present)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");
    await expect(page.locator("header.site-head .brand")).toHaveText(
      "Ramakrishna"
    );
    await expect(
      page.locator("footer.site-footer")
    ).toContainText("Ramakrishna. Built with Next.js and plain CSS.");
    await expect(page.locator(".progress")).toBeHidden();

    await page.goto("/nope");
    await expect(page.locator("main#main h1")).toHaveText(
      "That page is not on this sheet."
    );

    await context.close();
  });
});
