import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";

test.describe("Keyboard and screen-reader accessibility pass (S7)", () => {
  test("(a) & (b): Tab through home page has visible focus on every stop and follows visual order", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const focusStops: { tag: string; id: string; text: string; hasFocusStyle: boolean }[] = [];

    // Tab through all focusable elements on the page
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");

      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;

        const style = window.getComputedStyle(el);
        const hasOutline =
          style.outlineStyle !== "none" &&
          parseFloat(style.outlineWidth) > 0;
        const hasBoxShadow = style.boxShadow !== "none" && style.boxShadow !== "";
        const isSkipLink = el.classList.contains("skip");

        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || el.getAttribute("name") || "",
          text: (el.textContent || "").trim().slice(0, 30),
          hasFocusStyle: hasOutline || hasBoxShadow || isSkipLink,
        };
      });

      if (!info) break;
      // Stop if wrapped back to top
      if (focusStops.length > 0 && info.text === focusStops[0].text && info.tag === focusStops[0].tag) {
        break;
      }
      focusStops.push(info);
    }

    expect(focusStops.length).toBeGreaterThan(15);

    // Verify (a): every focus stop has a visible focus indicator
    for (const stop of focusStops) {
      expect(
        stop.hasFocusStyle,
        `Element <${stop.tag} id="${stop.id}"> "${stop.text}" must have a visible focus indicator`
      ).toBe(true);
    }

    // Verify (b): tab order follows visual section order
    const texts = focusStops.map((s) => s.text);
    const skipIndex = texts.findIndex((t) => t.includes("Skip to content"));
    const brandIndex = texts.findIndex((t) => t.includes("Ramakrishna"));
    const workLinkIndex = texts.findIndex((t) => t === "Work");
    const jumpBtnIndex = texts.findIndex((t) => t.includes("Jump to"));
    const heroBtnIndex = texts.findIndex((t) => t.includes("View my work"));
    const contactNameIndex = focusStops.findIndex((s) => s.id === "contact-name");
    const submitIndex = texts.findIndex((t) => t === "Send message");

    expect(skipIndex).toBe(0);
    expect(brandIndex).toBeGreaterThan(skipIndex);
    expect(workLinkIndex).toBeGreaterThan(brandIndex);
    expect(jumpBtnIndex).toBeGreaterThan(workLinkIndex);
    expect(heroBtnIndex).toBeGreaterThan(jumpBtnIndex);
    expect(contactNameIndex).toBeGreaterThan(heroBtnIndex);
    expect(submitIndex).toBeGreaterThan(contactNameIndex);
  });

  test("(c): Command palette traps focus while open and returns it on close", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const jumpBtn = page.locator('[data-open-palette]');
    await jumpBtn.focus();
    await page.keyboard.press("Enter");

    const dialog = page.locator("dialog#palette");
    await expect(dialog).toBeVisible();

    // Verify focus is inside the dialog
    const activeInDialog = await page.evaluate(() => {
      const active = document.activeElement;
      const dlg = document.querySelector("dialog#palette");
      return dlg ? dlg.contains(active) : false;
    });
    expect(activeInDialog).toBe(true);

    // Tab multiple times to verify focus remains trapped inside dialog
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const isTrapped = await page.evaluate(() => {
        const active = document.activeElement;
        const dlg = document.querySelector("dialog#palette");
        return dlg ? dlg.contains(active) : false;
      });
      expect(isTrapped, `Tab stop ${i} must remain inside dialog`).toBe(true);
    }

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Verify focus returned to the opener button
    const isFocusOnOpener = await page.evaluate(() => {
      const active = document.activeElement;
      const btn = document.querySelector('[data-open-palette]');
      return active === btn;
    });
    expect(isFocusOnOpener).toBe(true);
  });

  test("(d): No positive tabindex values anywhere on /, stories, or 404", async ({
    page,
  }) => {
    const urls = ["/", ...STORIES.map((s) => `/work/${s.slug}`), "/nope"];

    for (const url of urls) {
      await page.goto(url);
      const positiveTabindices = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("[tabindex]"));
        return all
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            tabindex: el.getAttribute("tabindex"),
            num: parseInt(el.getAttribute("tabindex") || "0", 10),
          }))
          .filter((item) => item.num > 0);
      });
      expect(
        positiveTabindices,
        `Positive tabindices found on ${url}`
      ).toEqual([]);
    }
  });

  test("(e): Every meaningful image/svg has text alternative, decorative ones are aria-hidden", async ({
    page,
  }) => {
    const urls = ["/", ...STORIES.map((s) => `/work/${s.slug}`), "/nope"];

    for (const url of urls) {
      await page.goto(url);

      const svgs = await page.evaluate(() => {
        const allSvgs = Array.from(document.querySelectorAll("svg"));
        return allSvgs.map((s) => ({
          ariaHidden: s.getAttribute("aria-hidden"),
          hasTitle: Boolean(s.querySelector("title")),
          role: s.getAttribute("role"),
          className: s.getAttribute("class"),
        }));
      });

      for (const svg of svgs) {
        const isDecorative = svg.ariaHidden === "true";
        const hasTextAlt = svg.hasTitle || svg.role === "img";
        expect(
          isDecorative || hasTextAlt,
          `SVG (${svg.className}) on ${url} must be either aria-hidden or carry text alternative`
        ).toBe(true);
      }
    }
  });

  test("(f): Heading hierarchy never skips levels on each page", async ({
    page,
  }) => {
    const urls = ["/", ...STORIES.map((s) => `/work/${s.slug}`), "/nope"];

    for (const url of urls) {
      await page.goto(url);

      const headings = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        return list.map((h) => ({
          tag: h.tagName.toLowerCase(),
          level: parseInt(h.tagName[1], 10),
          text: (h.textContent || "").trim(),
        }));
      });

      expect(headings.length).toBeGreaterThan(0);
      expect(headings[0].level).toBe(1); // starts with H1

      let prevLevel = 1;
      for (let i = 1; i < headings.length; i++) {
        const currentLevel = headings[i].level;
        // Heading level cannot increase by more than 1 (e.g. h1 -> h3 is invalid; h3 -> h2 is valid)
        expect(
          currentLevel <= prevLevel + 1,
          `Heading on ${url} skipped from H${prevLevel} to H${currentLevel}: "${headings[i].text}"`
        ).toBe(true);
        prevLevel = currentLevel;
      }
    }
  });
});
