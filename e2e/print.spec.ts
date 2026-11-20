import { expect, test } from "@playwright/test";
import path from "path";

test.describe("Print media emulation pass (S7)", () => {
  test("home page renders cleanly in print media", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.emulateMedia({ media: "print" });

    // Chrome elements must be hidden
    await expect(page.locator(".site-head")).toBeHidden();
    await expect(page.locator(".progress")).toBeHidden();
    await expect(page.locator(".totop")).toBeHidden();
    await expect(page.locator(".skip")).toBeHidden();
    await expect(page.locator("dialog")).toBeHidden();

    // Main content must be visible
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Links have readable text
    const links = page.locator("main a");
    const count = await links.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      if (await link.isVisible()) {
        const text = (await link.textContent())?.trim();
        expect(text?.length).toBeGreaterThan(0);
      }
    }

    // Save screenshot
    await page.screenshot({
      path: path.join(process.cwd(), "e2e", "screenshots", "print-home.png"),
      fullPage: true,
    });
  });

  test("story page (/work/vouch) renders cleanly in print media", async ({ page }) => {
    await page.goto("/work/vouch");
    await page.waitForLoadState("networkidle");

    await page.emulateMedia({ media: "print" });

    // Chrome elements must be hidden
    await expect(page.locator(".site-head")).toBeHidden();
    await expect(page.locator(".progress")).toBeHidden();
    await expect(page.locator(".totop")).toBeHidden();
    await expect(page.locator(".skip")).toBeHidden();
    await expect(page.locator("dialog")).toBeHidden();

    // Main content must be visible
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Story sections visible
    await expect(page.locator(".case-hero")).toBeVisible();
    await expect(page.locator(".case-body")).toBeVisible();

    // Links have readable text
    const links = page.locator("main a");
    const count = await links.count();
    expect(count).toBeGreaterThan(2);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      if (await link.isVisible()) {
        const text = (await link.textContent())?.trim();
        expect(text?.length).toBeGreaterThan(0);
      }
    }

    // Save screenshot
    await page.screenshot({
      path: path.join(process.cwd(), "e2e", "screenshots", "print-vouch.png"),
      fullPage: true,
    });
  });
});
