import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Throwaway test credentials configured in playwright.config.ts webServer block.
 * TEST ONLY: Never use in production.
 */
const TEST_PASSWORD = "TestAdminPassword123!";
const WRONG_PASSWORD = "ThisIsTheWrongPassword999!";

test.describe("Admin Area & Job Desk Foundation (J1)", () => {
  test("unauthenticated /admin redirects to /admin/login", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.locator("h1")).toHaveText("Sign in to Job Desk");
  });

  test("unauthenticated /api/admin/* returns 401 with X-Robots-Tag", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/jobs");
    expect(res.status()).toBe(401);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("cross-origin POST to /api/admin/login returns 403 Forbidden", async ({
    request,
  }) => {
    const res = await request.post("/api/admin/login", {
      headers: {
        origin: "https://malicious-external-origin.com",
      },
      data: {
        password: TEST_PASSWORD,
      },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("wrong password rejected with generic error", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill("#admin-password", WRONG_PASSWORD);
    await page.click('button[type="submit"]');

    const errorEl = page.locator("#admin-login-error");
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText("Wrong password");
  });

  test("repeated failed attempts lock the login endpoint (429)", async ({
    request,
  }) => {
    // We send failures with a dedicated client IP header to test rate locking
    const testIp = "198.51.100.42";
    let lastStatus = 200;

    for (let i = 0; i < 6; i++) {
      const res = await request.post("/api/admin/login", {
        headers: {
          "x-forwarded-for": testIp,
          origin: "http://localhost:3000",
        },
        data: {
          password: "bad-password-attempt",
        },
      });
      lastStatus = res.status();
    }

    expect(lastStatus).toBe(429);
  });

  test("tampered session cookie is rejected and redirects to /admin/login", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "admin",
        value: "eyJzdWIiOiJvd25lciJ9.tamperedsignature",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("correct password logs in, shows dashboard shell, and logout protects /admin again", async ({
    page,
    context,
  }) => {
    // Clear cookies to start fresh
    await context.clearCookies();

    // Use a fresh IP to avoid any rate limits from previous tests
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "198.51.100.99",
    });

    await page.goto("/admin/login");
    await page.fill("#admin-password", TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should land on /admin
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator(".admin-brand h1")).toHaveText("Ramakrishna Job Desk");

    // Stat cards exist and show 0
    const statCards = page.locator(".admin-stat-card");
    await expect(statCards).toHaveCount(5);
    await expect(statCards.nth(0)).toContainText("Jobs found");
    await expect(statCards.nth(0).locator(".admin-stat-num")).toHaveText("0");

    // Tabs work and switch views
    const tabs = page.locator(".admin-tab-btn");
    await expect(tabs).toHaveCount(5);
    await expect(page.locator(".admin-panel-header h2")).toHaveText("Jobs");

    // Click Pipeline tab
    await tabs.nth(1).click();
    await expect(page.locator(".admin-panel-header h2")).toHaveText("Pipeline");
    await expect(page.locator(".admin-empty-card h3")).toHaveText("Pipeline is clear");

    // Logout
    const logoutBtn = page.locator(".admin-logout-btn");
    await logoutBtn.click();

    // Redirected back to login
    await expect(page).toHaveURL(/\/admin\/login$/);

    // Navigating back to /admin must redirect to /admin/login
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("/admin and /admin/login have noindex meta and X-Robots-Tag", async ({
    page,
  }) => {
    const res = await page.goto("/admin/login");
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");

    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute("content", /noindex/);
  });

  test("robots.txt has Disallow: /admin and Disallow: /admin/ and sitemap.xml has no /admin", async ({
    request,
  }) => {
    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsText = await robotsRes.text();
    expect(robotsText).toContain("Disallow: /admin");
    expect(robotsText).toContain("Disallow: /admin/");

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapText = await sitemapRes.text();
    expect(sitemapText).not.toContain("/admin");
  });

  test("public home page has zero links containing 'admin'", async ({
    page,
  }) => {
    await page.goto("/");
    const links = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll("a[href]"));
      return allLinks
        .map((a) => a.getAttribute("href") || "")
        .filter((href) => href.toLowerCase().includes("admin"));
    });
    expect(links).toEqual([]);
  });

  test("axe accessibility scan on /admin/login (light and dark, 375 and 1440)", async ({
    page,
  }) => {
    for (const theme of ["light", "dark"] as const) {
      for (const width of [375, 1440]) {
        await page.addInitScript((t) => {
          document.documentElement.dataset.theme = t;
          localStorage.setItem("portfolio:theme", t);
        }, theme);

        await page.setViewportSize({ width, height: 800 });
        await page.goto("/admin/login");

        const accessibilityScan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(
          accessibilityScan.violations,
          `Axe violations on /admin/login (${theme} theme at ${width}px)`
        ).toEqual([]);
      }
    }
  });

  test("axe accessibility scan on /admin dashboard (light and dark, 375 and 1440)", async ({
    page,
    context,
  }) => {
    // Generate valid session token for test
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    await context.addCookies([
      {
        name: "admin",
        value: token,
        domain: "localhost",
        path: "/",
      },
    ]);

    for (const theme of ["light", "dark"] as const) {
      for (const width of [375, 1440]) {
        await page.addInitScript((t) => {
          document.documentElement.dataset.theme = t;
          localStorage.setItem("portfolio:theme", t);
        }, theme);

        await page.setViewportSize({ width, height: 900 });
        await page.goto("/admin");

        const accessibilityScan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(
          accessibilityScan.violations,
          `Axe violations on /admin (${theme} theme at ${width}px)`
        ).toEqual([]);
      }
    }
  });
});
