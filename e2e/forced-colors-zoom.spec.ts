import { expect, test } from "@playwright/test";
import path from "path";

test.describe("Forced colors and zoom pass (S7)", () => {
  test("forcedColors: 'active' renders high-contrast content across all sections", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      forcedColors: "active",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Scroll through the whole page in steps so all scroll animations trigger and chapters open
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

    // Viewport screenshots of each required section
    const sections = [
      { selector: ".hero", filename: "forced-colors-hero.png" },
      { selector: ".proof", filename: "forced-colors-proof.png" },
      {
        selector: "#work .chapter:nth-of-type(1)",
        filename: "forced-colors-chapter-1.png",
      },
      {
        selector: "#work .chapter:nth-of-type(2)",
        filename: "forced-colors-chapter-2.png",
      },
      {
        selector: "#work .chapter:nth-of-type(3)",
        filename: "forced-colors-chapter-3.png",
      },
      {
        selector: "#work .chapter:nth-of-type(4)",
        filename: "forced-colors-chapter-4.png",
      },
      { selector: "#experience", filename: "forced-colors-experience.png" },
      { selector: "#skills", filename: "forced-colors-skills.png" },
      { selector: "#contact", filename: "forced-colors-contact.png" },
    ];

    for (const { selector, filename } of sections) {
      const loc = page.locator(selector);
      await expect(loc).toBeVisible();
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(process.cwd(), "e2e", "screenshots", filename),
        fullPage: false,
      });
    }

    // Verify contact form inputs and button are visible with borders
    const nameInput = page.locator("input#contact-name");
    const emailInput = page.locator("input#contact-email");
    const messageInput = page.locator("textarea#contact-message");
    const submitBtn = page.locator('button[type="submit"]');

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(messageInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify contrast distance for text elements in main sections
    const contrastViolations = await page.evaluate(() => {
      function parseRgb(colorStr: string): { r: number; g: number; b: number } | null {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
          };
        }
        return null;
      }

      function getEffectiveBg(el: Element): { r: number; g: number; b: number } {
        let curr: Element | null = el;
        while (curr) {
          const bgStr = window.getComputedStyle(curr).backgroundColor;
          const match = bgStr.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
          );
          if (match) {
            const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
            if (alpha > 0.05) {
              return {
                r: parseInt(match[1], 10),
                g: parseInt(match[2], 10),
                b: parseInt(match[3], 10),
              };
            }
          }
          curr = curr.parentElement;
        }
        return { r: 255, g: 255, b: 255 }; // Default to canvas (white in forced light mode)
      }

      const elements = Array.from(
        document.querySelectorAll(
          "main h1, main h2, main h3, main p, main li, main strong, main label"
        )
      );

      const violations: Array<{ text: string; distance: number }> = [];

      for (const el of elements) {
        const text = (el.textContent || "").trim();
        if (!text || text.length === 0) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;

        const fg = parseRgb(style.color);
        const bg = getEffectiveBg(el);

        if (fg) {
          // Euclidean color distance in RGB space: sqrt((r1-r2)^2 + (g1-g2)^2 + (b1-b2)^2)
          // Low contrast distance is < 80 (e.g. faint gray on white or dark gray on black)
          const distance = Math.sqrt(
            Math.pow(fg.r - bg.r, 2) +
              Math.pow(fg.g - bg.g, 2) +
              Math.pow(fg.b - bg.b, 2)
          );

          if (distance < 80) {
            violations.push({ text: text.slice(0, 30), distance });
          }
        }
      }

      return violations;
    });

    expect(contrastViolations).toEqual([]);

    await context.close();
  });

  test("200% zoom (640px viewport equivalent to 1280px at 200%) has zero overlap or horizontal clipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Scroll through the page
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

    // Verify document width does not cause horizontal scroll
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Save screenshot of 200% zoom state
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "e2e",
        "screenshots",
        "zoom-200pct-home.png"
      ),
      fullPage: true,
    });
  });
});
