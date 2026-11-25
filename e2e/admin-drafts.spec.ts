import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

test.describe("Admin Outreach Drafts Review Queue (Bundle B1)", () => {
  const screenshotsDir = path.resolve(process.cwd(), "e2e/screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test.beforeEach(async ({ request }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    // Seed test jobs
    await request.post("/api/test/seed-jobs", {
      headers: {
        cookie: `admin=${token}; __Host-admin=${token}`,
        origin: "http://localhost:3000",
      },
    }).catch(() => {});
  });

  test("outreach review queue full workflow: draft, edit, live counter, approve, discard, filter", async ({
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

    // Local in-test state for mock drafts
    const mockDrafts = [
      {
        id: "draft-e2e-1",
        job_id: "seed-101",
        kind: "email",
        subject: "Full-Stack AI Engineering - Ramakrishna",
        body: "Hi team, I noticed your opening at Global Tech Corp. As a 2026 BITS Pilani graduate, I build dependable full-stack systems. In Vouch, I reduced AI review time from 18.83 s to 3.35 s with 10 of 10 runs correct. I also built Team MCP Gateway with 1,212 automated tests and 22 ms lookup latency. I would value the opportunity to discuss how I can contribute to your engineering goals. You can view my work at my portfolio link or we can arrange a brief introductory conversation. Best regards, Ramakrishna",
        status: "draft",
        model: "openai/gpt-oss-120b",
        edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_title: "Full Stack Engineer (AI Platform)",
        job_company: "Global Tech Corp",
        job_url: "https://example.com/jobs/seed-101",
      },
      {
        id: "draft-e2e-2",
        job_id: "seed-101",
        kind: "linkedin_note",
        subject: null,
        body: "Hi, I saw your Full-Stack AI Engineer opening. At Vouch, I built an evidence verification engine cutting review latency from 18.83 s to 3.35 s. I would love to connect and share more about how my background fits your team.",
        status: "draft",
        model: "openai/gpt-oss-120b",
        edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_title: "Full Stack Engineer (AI Platform)",
        job_company: "Global Tech Corp",
        job_url: "https://example.com/jobs/seed-101",
      },
      {
        id: "draft-e2e-3",
        job_id: "seed-101",
        kind: "linkedin_dm",
        subject: null,
        body: "Hi, I came across your open Full-Stack role. I recently built Vouch, an AI verification platform with 10 of 10 runs correct, and Team MCP Gateway with 1,212 automated tests. I would appreciate the chance to discuss how I can contribute to your team.",
        status: "draft",
        model: "openai/gpt-oss-120b",
        edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_title: "Full Stack Engineer (AI Platform)",
        job_company: "Global Tech Corp",
        job_url: "https://example.com/jobs/seed-101",
      },
    ];

    const getCounts = () => ({
      all: mockDrafts.length,
      draft: mockDrafts.filter((d) => d.status === "draft").length,
      approved: mockDrafts.filter((d) => d.status === "approved").length,
      discarded: mockDrafts.filter((d) => d.status === "discarded").length,
    });

    // Intercept drafts API
    await page.route("**/api/admin/drafts**", async (route) => {
      const method = route.request().method();
      const url = new URL(route.request().url());

      if (method === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ drafts: mockDrafts, counts: getCounts() }),
        });
      }

      if (method === "GET") {
        const statusParam = url.searchParams.get("status");
        let list = [...mockDrafts];
        if (statusParam && statusParam !== "all") {
          list = list.filter((d) => d.status === statusParam);
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ drafts: list, counts: getCounts() }),
        });
      }

      if (method === "PATCH") {
        const id = url.pathname.split("/").pop();
        const payload = route.request().postDataJSON();
        const draft = mockDrafts.find((d) => d.id === id);
        if (draft) {
          if (payload.subject !== undefined) draft.subject = payload.subject;
          if (payload.body !== undefined) {
            draft.body = payload.body;
            draft.edited = true;
          }
          if (payload.status !== undefined) draft.status = payload.status;
          draft.updated_at = new Date().toISOString();
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ draft, counts: getCounts() }),
        });
      }

      return route.continue();
    });

    // 1. Visit admin page
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    // 2. Click "Draft outreach" on a job card
    const draftOutreachBtn = page.locator(".admin-draft-outreach-btn").first();
    await expect(draftOutreachBtn).toBeVisible();
    await draftOutreachBtn.click();

    // 3. Verifies redirect to Messages tab
    await expect(page.locator(".admin-drafts-section")).toBeVisible();
    const notice = page.locator(".admin-notice-banner");
    await expect(notice).toContainText("Nothing is sent from here. Copy the text and send it yourself.");

    // 4. Verifies 3 drafts appear
    const draftCards = page.locator(".admin-draft-card");
    await expect(draftCards).toHaveCount(3);
    await expect(draftCards.nth(0)).toContainText("Cold email");
    await expect(draftCards.nth(1)).toContainText("LinkedIn note");
    await expect(draftCards.nth(2)).toContainText("LinkedIn DM");

    // 5. Verify live counter on email and edit email body
    const emailBody = draftCards.nth(0).locator("textarea");
    await expect(emailBody).toBeVisible();
    const counter = draftCards.nth(0).locator(".admin-counter").nth(1);
    await expect(counter).toContainText("Word count:");

    // Edit email body
    await emailBody.fill("Short body with only six words.");
    await expect(counter).toHaveClass(/warn/);

    // Fill valid body with ~95 words
    const validBody = [
      "Hi team, I noticed your opening at Global Tech Corp.",
      "As a 2026 BITS Pilani graduate, I build dependable full-stack systems with TypeScript and React.",
      "In my Vouch project, an AI brand content verification platform, I reduced review time from 18.83 s to 3.35 s while achieving 10 of 10 runs with all 50 verdicts correct.",
      "I also built Team MCP Gateway with 1,212 automated tests and a 22 ms lookup cache.",
      "I would appreciate the chance to discuss how my experience fits your team.",
      "You can review my work at my portfolio link or we can arrange a brief introductory conversation.",
      "Best regards, Ramakrishna",
    ].join(" ");
    await emailBody.fill(validBody);
    await expect(counter).not.toHaveClass(/warn/);

    // 6. Click Approve on email draft
    const approveBtn = draftCards.nth(0).locator("button.admin-approve-btn");
    await approveBtn.click();
    await expect(draftCards.nth(0).locator(".badge-status")).toContainText("approved");
    await expect(draftCards.nth(0).locator(".badge-edited")).toBeVisible();

    // 7. Discard the LinkedIn note draft
    const discardBtn = draftCards.nth(1).locator("button.admin-discard-btn");
    await discardBtn.click();
    await expect(draftCards.nth(1).locator(".badge-status")).toContainText("discarded");

    // 8. Filter by Draft
    const draftFilterBtn = page.locator('button.admin-filter-btn:has-text("Draft")');
    await draftFilterBtn.click();
    // Only the DM remains in draft status
    await expect(page.locator(".admin-draft-card")).toHaveCount(1);
    await expect(page.locator(".admin-draft-card")).toContainText("LinkedIn DM");

    // 9. Filter by Discarded
    const discardedFilterBtn = page.locator('button.admin-filter-btn:has-text("Discarded")');
    await discardedFilterBtn.click();
    await expect(page.locator(".admin-draft-card")).toHaveCount(1);
    await expect(page.locator(".admin-draft-card")).toContainText("LinkedIn note");

    // 10. Filter by Approved
    const approvedFilterBtn = page.locator('button.admin-filter-btn:has-text("Approved")');
    await approvedFilterBtn.click();
    await expect(page.locator(".admin-draft-card")).toHaveCount(1);
    await expect(page.locator(".admin-draft-card")).toContainText("Cold email");

    // 11. Assert no forbidden placeholders or raw strings
    const visibleText = await page.locator(".admin-drafts-section").innerText();
    expect(visibleText).not.toContain("undefined");
    expect(visibleText).not.toContain("null");
    expect(visibleText).not.toContain("NaN");
    expect(visibleText).not.toContain("[object Object]");
    expect(visibleText).not.toContain("TODO");
    expect(visibleText).not.toContain("Lorem");

    // 12. Responsive & axe scans across 5 widths
    const viewports = [375, 768, 1024, 1280, 1440];
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);

      const noScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      );
      expect(noScroll).toBe(true);

      const screenshotPath = path.join(
        screenshotsDir,
        `admin-drafts-${width}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const axeResults = await new AxeBuilder({ page })
        .include(".admin-drafts-section")
        .analyze();
      expect(axeResults.violations).toEqual([]);
    }
  });
});
