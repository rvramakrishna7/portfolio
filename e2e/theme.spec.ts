import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS } from "./helpers";

const SCREENSHOTS_DIR = path.resolve(__dirname, "screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe("Theme system and tokens (TEST-014 to TEST-016)", () => {
  test("TEST-014 (a): OS preference applies when no choice is saved (dark and light)", async ({
    page,
  }) => {
    // OS Dark preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const bgDark = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgDark).toBe("rgb(11, 11, 13)"); // #0B0B0D

    // OS Light preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const bgLight = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgLight).toBe("rgb(245, 245, 247)"); // #F5F5F7
  });

  test("TEST-014 (b): toggle click changes theme, saves in localStorage, and survives reload and navigation", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const toggle = page.locator("[data-theme-toggle]");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");

    // Click to switch to dark
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light theme");
    const themeSaved = await page.evaluate(() => localStorage.getItem("theme"));
    expect(themeSaved).toBe("dark");

    await expect
      .poll(async () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      )
      .toBe("rgb(11, 11, 13)");

    // Survives reload
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("[data-theme-toggle]")).toHaveAttribute(
      "aria-label",
      "Switch to light theme"
    );
    const bgAfterReload = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgAfterReload).toBe("rgb(11, 11, 13)");

    // Survives navigation to /work/zync and back
    await page.goto("/work/zync");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bgOnStory = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgOnStory).toBe("rgb(11, 11, 13)");

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bgBackHome = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgBackHome).toBe("rgb(11, 11, 13)");

    // Click again to switch back to light
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("[data-theme-toggle]")).toHaveAttribute(
      "aria-label",
      "Switch to dark theme"
    );
    const themeSavedLight = await page.evaluate(() =>
      localStorage.getItem("theme")
    );
    expect(themeSavedLight).toBe("light");
    await expect
      .poll(async () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      )
      .toBe("rgb(245, 245, 247)");
  });

  test("TEST-014 (c): inline head script runs before first paint without flash", async ({
    page,
  }) => {
    // Set localStorage theme=dark while OS preference is light
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.emulateMedia({ colorScheme: "light" });

    // Navigate and check background immediately at domcontentloaded
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const bgImmediately = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgImmediately).toBe("rgb(11, 11, 13)");

    const datasetTheme = await page.evaluate(
      () => document.documentElement.dataset.theme
    );
    expect(datasetTheme).toBe("dark");
  });

  test("TEST-014 (d): toggle has correct aria-label and works with Enter and Space", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const toggle = page.locator("[data-theme-toggle]");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");

    // Press Space to toggle
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light theme");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    // Press Enter to toggle back
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  });

  test("TEST-014 (e): with JavaScript disabled OS theme applies cleanly", async ({
    browser,
  }) => {
    // Dark OS without JS
    const darkContext = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "dark",
    });
    const darkPage = await darkContext.newPage();
    await darkPage.goto("/");
    const bgDarkNoJS = await darkPage.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgDarkNoJS).toBe("rgb(11, 11, 13)");
    await darkContext.close();

    // Light OS without JS
    const lightContext = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "light",
    });
    const lightPage = await lightContext.newPage();
    await lightPage.goto("/");
    const bgLightNoJS = await lightPage.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgLightNoJS).toBe("rgb(245, 245, 247)");
    await lightContext.close();
  });

  test("TEST-015: axe accessibility scan across all pages in both light and dark themes", async ({
    page,
  }) => {
    const routes = [
      "/",
      "/work/restart-options",
      "/work/zync",
      "/work/vouch",
      "/work/mcp-gateway",
      "/nope",
    ];

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem("theme", t);
      }, theme);

      for (const route of routes) {
        await page.goto(route);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          results.violations,
          `Axe violations on ${route} in ${theme} theme: ${JSON.stringify(results.violations, null, 2)}`
        ).toEqual([]);
      }
    }
  });

  test("TEST-016: no horizontal scroll and screenshots of header, footer and hero in both themes", async ({
    page,
  }) => {
    const targetWidths = [375, 768, 1024, 1280, 1440];

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem("theme", t);
      }, theme);

      for (const width of targetWidths) {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await page.goto("/");

        const hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(
          hasHorizontalScroll,
          `Horizontal scroll detected at width ${width}px in ${theme} theme`
        ).toBe(false);

        // Assert clean text
        const bodyText = await page.locator("body").innerText();
        for (const token of FORBIDDEN_VISIBLE_TOKENS) {
          expect(bodyText).not.toContain(token);
        }

        // Capture required screenshots at 375 and 1280
        if (width === 375 || width === 1280) {
          // Header screenshot
          const header = page.locator("header.site-head");
          await header.screenshot({
            path: path.join(SCREENSHOTS_DIR, `header-${theme}-${width}.png`),
          });

          // Hero screenshot
          await page.evaluate(() => window.scrollTo(0, 0));
          const hero = page.locator("section.hero");
          await hero.screenshot({
            path: path.join(SCREENSHOTS_DIR, `hero-${theme}-${width}.png`),
          });

          // Proof strip screenshot
          const proof = page.locator("section#proof");
          await proof.scrollIntoViewIfNeeded();
          await proof.screenshot({
            path: path.join(SCREENSHOTS_DIR, `proof-${theme}-${width}.png`),
          });

          // One chapter screenshot
          const chapter = page.locator("article#restart-options");
          await chapter.scrollIntoViewIfNeeded();
          await chapter.screenshot({
            path: path.join(SCREENSHOTS_DIR, `chapter-${theme}-${width}.png`),
          });

          // Experience screenshot
          const exp = page.locator("section#experience");
          await exp.scrollIntoViewIfNeeded();
          await exp.screenshot({
            path: path.join(SCREENSHOTS_DIR, `experience-${theme}-${width}.png`),
          });

          // Skills screenshot
          const skills = page.locator("section#skills");
          await skills.scrollIntoViewIfNeeded();
          await skills.screenshot({
            path: path.join(SCREENSHOTS_DIR, `skills-${theme}-${width}.png`),
          });

          // About screenshot
          const about = page.locator("section#about");
          await about.scrollIntoViewIfNeeded();
          await about.screenshot({
            path: path.join(SCREENSHOTS_DIR, `about-${theme}-${width}.png`),
          });

          // Contact screenshot
          const contact = page.locator("section#contact");
          await contact.scrollIntoViewIfNeeded();
          await contact.screenshot({
            path: path.join(SCREENSHOTS_DIR, `contact-${theme}-${width}.png`),
          });

          // Footer screenshot
          const footer = page.locator("footer.site-footer");
          await footer.scrollIntoViewIfNeeded();
          await footer.screenshot({
            path: path.join(SCREENSHOTS_DIR, `footer-${theme}-${width}.png`),
          });
        }
      }
    }
  });

  test("header fits fully without wrapping at 320, 375 and 414 px in both themes", async ({
    page,
  }) => {
    const mobileWidths = [320, 375, 414];

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem("theme", t);
      }, theme);

      for (const width of mobileWidths) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto("/");

        const header = page.locator("header.site-head");
        await expect(header).toBeVisible();

        // Check header bounding box is within viewport
        const headerBox = await header.boundingBox();
        expect(headerBox).not.toBeNull();
        expect(headerBox!.x).toBeGreaterThanOrEqual(0);
        expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(width);

        // Check every visible interactive child inside the header
        const items = [
          page.locator("header.site-head .brand"),
          page.locator("header.site-head [data-theme-toggle]"),
          page.locator("header.site-head .resume-link"),
          page.locator("header.site-head a.btn.primary"),
        ];

        for (const item of items) {
          await expect(item).toBeVisible();
          const box = await item.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);

          // Check no button / link text wraps onto multiple lines
          const hasWrappedText = await item.evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rects = range.getClientRects();
            if (rects.length <= 1) return false;
            const firstTop = rects[0].top;
            for (let i = 1; i < rects.length; i++) {
              if (Math.abs(rects[i].top - firstTop) > 3) return true;
            }
            return false;
          });
          expect(
            hasWrappedText,
            `Text in ${await item.getAttribute("class")} must not wrap at ${width}px in ${theme} theme`
          ).toBe(false);
        }

        // Retake screenshots as required by ITEM 0
        if (width === 375 || width === 320) {
          await header.screenshot({
            path: path.join(SCREENSHOTS_DIR, `header-${theme}-${width}.png`),
          });
        }
      }
    }
  });
});
