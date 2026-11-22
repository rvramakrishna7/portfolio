import { test, expect } from "@playwright/test";

const ROUTES = [
  "/",
  "/work/restart-options",
  "/work/mcp-gateway",
  "/work/vouch",
  "/work/zync",
];

const THEMES: Array<"light" | "dark"> = ["light", "dark"];

test.describe("Typography - No italics anywhere (R6)", () => {
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`verifies zero elements have italic or oblique font-style on ${route} (${theme})`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          localStorage.setItem("portfolio:theme", t);
        }, theme);

        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");

        const invalidStyles = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll("body *"));
          const offenders: Array<{ tag: string; text: string; style: string }> = [];

          for (const el of elements) {
            const tag = el.tagName.toLowerCase();
            if (
              [
                "script",
                "style",
                "noscript",
                "svg",
                "path",
                "rect",
                "line",
                "circle",
                "title",
                "desc",
              ].includes(tag)
            ) {
              continue;
            }
            const comp = window.getComputedStyle(el);
            if (comp.fontStyle !== "normal") {
              offenders.push({
                tag,
                text: (el.textContent || "").slice(0, 30).trim(),
                style: comp.fontStyle,
              });
            }
          }
          return offenders;
        });

        expect(invalidStyles).toEqual([]);
      });
    }
  }
});
