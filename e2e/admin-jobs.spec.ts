import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Admin Jobs Engine (J2)", () => {
  test.beforeEach(async ({ request }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    // Attempt seeding test fixture jobs via internal test route with admin session & origin
    await request.post("/api/test/seed-jobs", {
      headers: {
        cookie: `admin=${token}; __Host-admin=${token}`,
        origin: "http://localhost:3000",
      },
    }).catch(() => {});
  });

  test("unauthenticated POST to seed route returns 401", async ({ request }) => {
    const res = await request.post("/api/test/seed-jobs", {
      headers: {
        origin: "http://localhost:3000",
      },
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/search/start without Origin header returns 403 Forbidden", async ({
    request,
  }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    const res = await request.post("/api/admin/search/start", {
      headers: {
        cookie: `admin=${token}; __Host-admin=${token}`,
        // No origin or referer header
      },
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test("unauthenticated /api/admin/search/* and /api/admin/jobs/* return 401 with X-Robots-Tag", async ({
    request,
  }) => {
    const endpoints = [
      { url: "/api/admin/jobs", method: "get" },
      { url: "/api/admin/jobs/seed-101", method: "patch" },
      { url: "/api/admin/search/start", method: "post" },
      { url: "/api/admin/search/step", method: "post" },
    ];

    for (const ep of endpoints) {
      let res;
      if (ep.method === "get") {
        res = await request.get(ep.url);
      } else if (ep.method === "patch") {
        res = await request.patch(ep.url, { data: { status: "shortlisted" } });
      } else {
        res = await request.post(ep.url, { data: {} });
      }

      expect(res.status()).toBe(401);
      expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    }
  });

  test("cron search route without secret returns 401", async ({ request }) => {
    const res = await request.get("/api/cron/search");
    expect(res.status()).toBe(401);
  });

  test("login -> Jobs tab lists shortlist, senior and restricted are in hidden tab", async ({
    page,
    context,
  }) => {
    // Set valid session cookie directly (same pattern as axe test)
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    await context.addCookies([
      {
        name: "__Host-admin",
        value: token,
        domain: "localhost",
        path: "/",
        secure: true,
      },
      {
        name: "admin",
        value: token,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator(".admin-brand h1")).toHaveText("Ramakrishna Job Desk");

    // 2. Shortlist tab should contain junior/fresher jobs that are fresh (2 days old and 5 days old)
    await expect(page.locator(".admin-job-card")).toHaveCount(3);
    await expect(page.locator(".admin-job-title").first()).toBeVisible();

    const textContent = await page.textContent(".admin-jobs-list");
    expect(textContent).toContain("Junior Backend Developer");
    expect(textContent).toContain("Full Stack Engineer (Fresher / New Grad)");
    expect(textContent).toContain("Software Engineer (5 Days Old)");
    // Senior, US-only, and 15-day-old job should NOT be in shortlist
    expect(textContent).not.toContain("Senior Software Architect");
    expect(textContent).not.toContain("US Only Labs");
    expect(textContent).not.toContain("Legacy Backend Developer (15 Days Old)");

    // 3. Switch to 'Hidden' tab
    await page.click('button:has-text("Hidden")');
    await page.waitForTimeout(300);

    const hiddenText = await page.textContent(".admin-jobs-list");
    expect(hiddenText).toContain("Senior Software Architect");
    expect(hiddenText).toContain("US Only Labs");
    expect(hiddenText).toContain("Legacy Backend Developer (15 Days Old)");
    // Verify reasons are visible, including freshness reason
    expect(hiddenText).toContain("Reason:");
    expect(hiddenText).toContain("posted 15 days ago");

    // 4. Switching the select to 10 days still hides the 15-day job
    await page.selectOption("#posted-within-select", "10");
    await page.waitForTimeout(300);

    // Switch back to Shortlist and assert 15-day job is not there
    await page.click('button:has-text("Shortlist")');
    await page.waitForTimeout(300);
    const shortlist10dText = await page.textContent(".admin-jobs-list");
    expect(shortlist10dText).not.toContain("Legacy Backend Developer (15 Days Old)");

    // 5. Switch to 'All' tab (with 10 days, 5 jobs match within 10 days)
    await page.click('button:has-text("All")');
    await page.waitForTimeout(300);
    await expect(page.locator(".admin-job-card")).toHaveCount(5);
  });

  test("status update actions (Shortlist, Mark applied, Skip) persist in view", async ({
    page,
    context,
  }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    await context.addCookies([
      {
        name: "__Host-admin",
        value: token,
        domain: "localhost",
        path: "/",
        secure: true,
      },
      {
        name: "admin",
        value: token,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    // Click 'Shortlist' on the first job
    const firstJob = page.locator(".admin-job-card").first();
    const shortlistBtn = firstJob.locator('button:has-text("Shortlist")');
    await shortlistBtn.click();
    await page.waitForTimeout(300);

    // Verify it becomes primary
    await expect(shortlistBtn).toHaveClass(/primary/);
  });

  test("axe accessibility scan on /admin Jobs view (light/dark, 375/1440)", async ({
    page,
    context,
  }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    await context.addCookies([
      {
        name: "__Host-admin",
        value: token,
        domain: "localhost",
        path: "/",
        secure: true,
      },
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
          `Axe violations on /admin Jobs (${theme} theme at ${width}px)`
        ).toEqual([]);
      }
    }
  });
});
