import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

test.describe("Work section — four chapters (S3)", () => {
  test("section heading, intro, four chapters, and Book My Nest footer note match docs/content.md", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const workSection = page.locator("section#work");
    await expect(workSection.locator(".sec-head .eyebrow")).toHaveText("Work");
    await expect(workSection.locator("#work-title")).toHaveText(
      "Four problems, and what happened next."
    );
    await expect(workSection.locator(".sec-head p").nth(1)).toHaveText(
      "Each one starts with a person who had a real problem. Scroll, and each story opens."
    );

    const chapters = workSection.locator("article.chapter");
    await expect(chapters).toHaveCount(4);

    for (let i = 0; i < STORIES.length; i++) {
      const story = STORIES[i];
      const chapter = chapters.nth(i);

      await expect(chapter).toHaveAttribute("id", story.slug);
      await expect(chapter.locator(".meta .num")).toHaveText(story.number);
      await expect(chapter.locator(".meta h3")).toHaveText(story.title);
      await expect(chapter.locator(".meta .tag")).toHaveText(story.tag);

      const chipItems = chapter.locator(".meta ul.chips li");
      await expect(chipItems).toHaveCount(story.chips.length);
      for (let c = 0; c < story.chips.length; c++) {
        await expect(chipItems.nth(c)).toHaveText(story.chips[c]);
      }

      await expect(chapter.locator(".panel .hook")).toHaveText(story.hook);
      await expect(
        chapter.locator(".panel div").filter({ hasText: "The problem" }).first()
      ).toContainText(story.problem);

      const whatIDidItems = chapter.locator(".panel ul li");
      await expect(whatIDidItems).toHaveCount(story.whatIDid.length);
      for (let w = 0; w < story.whatIDid.length; w++) {
        await expect(whatIDidItems.nth(w)).toHaveText(story.whatIDid[w]);
      }

      const resultCells = chapter.locator(".panel .results > div");
      await expect(resultCells).toHaveCount(story.results.length);
      for (let r = 0; r < story.results.length; r++) {
        await expect(resultCells.nth(r).locator("strong")).toHaveText(
          story.results[r].value
        );
        await expect(resultCells.nth(r).locator("span")).toHaveText(
          story.results[r].label
        );
      }

      const links = chapter.locator(".panel .links a");
      await expect(links).toHaveCount(story.links.length);
      for (let l = 0; l < story.links.length; l++) {
        await expect(links.nth(l)).toHaveText(story.links[l].label);
        await expect(links.nth(l)).toHaveAttribute("href", story.links[l].href);
        if (story.links[l].external) {
          await expect(links.nth(l)).toHaveAttribute(
            "rel",
            "noopener noreferrer"
          );
          await expect(links.nth(l)).toHaveAttribute("target", "_blank");
        }
      }
    }

    const workNote = workSection.locator(".work-note");
    await expect(workNote).toContainText(
      "Earlier work: Book My Nest, a property listing site built with Node.js, Express, MongoDB, Passport.js, Cloudinary and Mapbox."
    );
    const bookMyNestLink = workNote.locator("a");
    await expect(bookMyNestLink).toHaveAttribute(
      "href",
      "https://bookmynest.onrender.com"
    );
    await expect(bookMyNestLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("with JavaScript disabled, every chapter's text, numbers, and links are present and visible (not clipped)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const chapters = page.locator("section#work article.chapter");
    await expect(chapters).toHaveCount(4);

    for (let i = 0; i < STORIES.length; i++) {
      const story = STORIES[i];
      const chapter = chapters.nth(i);
      const panel = chapter.locator(".panel");
      const meta = chapter.locator(".meta");

      await expect(chapter).toContainText(story.title);
      await expect(chapter).toContainText(story.hook);
      await expect(chapter).toContainText(story.problem);

      const panelBox = await panel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.width).toBeGreaterThan(300);
      expect(panelBox!.height).toBeGreaterThan(200);

      const clipPath = await panel.evaluate(
        (el) => getComputedStyle(el).clipPath
      );
      expect(clipPath).toBe("none");

      const metaOpacity = await meta.evaluate(
        (el) => getComputedStyle(el).opacity
      );
      expect(metaOpacity).toBe("1");
    }

    await context.close();
  });

  test("with reducedMotion: 'reduce', nothing is hidden or animating in the chapters", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const chapters = page.locator("section#work article.chapter");
    await expect(chapters).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      const panel = chapters.nth(i).locator(".panel");
      const meta = chapters.nth(i).locator(".meta");

      const styles = await panel.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          clipPath: cs.clipPath,
          animationName: cs.animationName,
          transitionDuration: cs.transitionDuration,
        };
      });
      expect(styles.clipPath).toBe("none");
      expect(styles.animationName).toBe("none");
      expect(styles.transitionDuration).toBe("0s");

      const metaOpacity = await meta.evaluate(
        (el) => getComputedStyle(el).opacity
      );
      expect(metaOpacity).toBe("1");
    }
  });

  test("header 'Work' link and hero 'Read the four stories' button land on #work", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.locator(".hero .cta a.btn.primary").click();
    await expect(page).toHaveURL(/#work$/);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(400);

    await page.goto("/");
    await page
      .locator("header.site-head nav a", { hasText: "Work" })
      .click();
    await expect(page).toHaveURL(/#work$/);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(400);
  });

  test("left column is sticky on 1280 px screen and not sticky on 768 px screen", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    // 1280 px: sticky
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const firstChapter = page.locator("article#restart-options");
    const firstMeta = firstChapter.locator(".meta");
    const firstPanel = firstChapter.locator(".panel");

    const pos1280 = await firstMeta.evaluate(
      (el) => getComputedStyle(el).position
    );
    expect(pos1280).toBe("sticky");

    const chapterTop1280 = await firstChapter.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY
    );
    await page.evaluate((y) => window.scrollTo(0, y - 96), chapterTop1280);
    const metaTopBefore = await firstMeta.evaluate(
      (el) => el.getBoundingClientRect().top
    );
    const panelTopBefore = await firstPanel.evaluate(
      (el) => el.getBoundingClientRect().top
    );

    await page.evaluate((y) => window.scrollTo(0, y + 60), chapterTop1280);
    const metaTopAfter = await firstMeta.evaluate(
      (el) => el.getBoundingClientRect().top
    );
    const panelTopAfter = await firstPanel.evaluate(
      (el) => el.getBoundingClientRect().top
    );

    const metaDelta1280 = Math.abs(metaTopAfter - metaTopBefore);
    const panelDelta1280 = Math.abs(panelTopAfter - panelTopBefore);
    expect(metaDelta1280).toBeLessThan(panelDelta1280);

    // 768 px: not sticky
    await page.setViewportSize({ width: 768, height: 900 });
    const pos768 = await firstMeta.evaluate(
      (el) => getComputedStyle(el).position
    );
    expect(pos768).toBe("static");
  });

  test("axe scan finds zero violations on / with Work section at 375 px and 1440 px", async ({
    page,
  }) => {
    for (const width of [375, 1440] as const) {
      await page.setViewportSize({
        width,
        height: width < 768 ? 812 : 900,
      });
      await page.goto("/");

      for (const story of STORIES) {
        const chapter = page.locator(`article#${story.slug}`);
        await chapter.scrollIntoViewIfNeeded();
        await expect(chapter).toHaveClass(/opened/, { timeout: 5000 });
      }

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        `Axe violations on / at ${width}px`
      ).toEqual([]);
    }
  });

  test("no horizontal scroll at all 5 widths, opens chapters on scroll, and saves screenshots of each chapter at all 5 widths", async ({
    page,
  }) => {
    test.setTimeout(90000);

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

      for (const story of STORIES) {
        const chapter = page.locator(`article#${story.slug}`);
        await chapter.scrollIntoViewIfNeeded();
        await page.evaluate((id) => {
          const el = document.getElementById(id);
          if (el) {
            window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96);
          }
        }, story.slug);
        await expect(chapter).toHaveClass(/opened/, { timeout: 5000 });

        await chapter.screenshot({
          path: path.join(
            process.cwd(),
            "e2e",
            "screenshots",
            `work-${story.slug}-${viewport.width}.png`
          ),
        });
      }

      await page.locator("#proof").scrollIntoViewIfNeeded();
      await expect(page.locator('#proof [data-count="1212"]')).toHaveText(
        "1,212"
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `home-${viewport.width}.png`
        ),
        fullPage: true,
      });
    }
  });
});
