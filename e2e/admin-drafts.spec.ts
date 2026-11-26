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
    await expect(notice).toContainText("Approve a draft, then use Send email to send it from Gmail.");

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

      const overflowing = await page.evaluate(() => {
        const root = document.documentElement;
        if (root.scrollWidth <= root.clientWidth) return [];
        // Name the elements that stick out, so a failure says what to fix
        return Array.from(document.body.querySelectorAll("*"))
          .map((el) => ({ el, right: Math.round(el.getBoundingClientRect().right) }))
          .filter((x) => x.right > root.clientWidth + 1)
          .slice(0, 6)
          .map((x) => `${x.el.tagName.toLowerCase()}.${String(x.el.className).split(" ").join(".")} right=${x.right} viewport=${root.clientWidth}`);
      });
      expect(overflowing, `horizontal overflow at ${width}px`).toEqual([]);

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

  test("application answers, sent tracking, and pipeline stages (Bundle B2-lite)", async ({
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

    const mockDrafts: Array<{
      id: string;
      job_id: string;
      kind: "email" | "linkedin_note" | "linkedin_dm" | "application_answer";
      subject: string | null;
      body: string;
      status: "draft" | "approved" | "discarded";
      model: string | null;
      edited: boolean;
      question?: string | null;
      recipient?: string | null;
      sent_at?: string | null;
      sent_channel?: string | null;
      created_at: string;
      updated_at: string;
      job_title: string;
      job_company: string;
      job_url: string;
    }> = [
      {
        id: "draft-b2-email",
        job_id: "seed-101",
        kind: "email",
        subject: "Full Stack Engineer (AI Platform) - Ramakrishna, BITS Pilani CS 2026",
        body: "Hi Alex, I noticed your Full Stack Engineer opening at Global Tech Corp. As a BS Computer Science graduate from BITS Pilani (2026), I build robust full-stack software. At Vouch, I built an evidence verification engine that reduced AI review latency from 18.83 s to 3.35 s with all 50 verdicts correct across 10 of 10 runs. I also built Team MCP Gateway with 1,212 automated tests and 22 ms lookup caching. You can review my work at https://ramakrishna.dev. Best regards, Ramakrishna",
        status: "draft",
        model: "openai/gpt-oss-120b",
        edited: false,
        recipient: "recruiter@globaltech.com",
        sent_at: null,
        sent_channel: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_title: "Full Stack Engineer (AI Platform)",
        job_company: "Global Tech Corp",
        job_url: "https://example.com/jobs/seed-101",
      },
      {
        id: "draft-b2-ans",
        job_id: "seed-101",
        kind: "application_answer",
        subject: null,
        question: "What interests you about working for this company?",
        body: "I am drawn to Global Tech Corp because you build high-reliability developer infrastructure where latency and correctness directly impact end users. In my Vouch project, I designed a multi-model verification engine with 10 of 10 runs correct, reducing review time from 18.83 s to 3.35 s. At Team MCP Gateway, I designed Redis-cached routing serving 1,212 test assertions with 22 ms lookup speed. I want to bring this rigorous focus on performance, verification, and automated testing to your engineering team.",
        status: "draft",
        model: "openai/gpt-oss-120b",
        edited: false,
        sent_at: null,
        sent_channel: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_title: "Full Stack Engineer (AI Platform)",
        job_company: "Global Tech Corp",
        job_url: "https://example.com/jobs/seed-101",
      },
    ];

    const mockPipeline = [
      {
        id: "seed-101",
        title: "Full Stack Engineer (AI Platform)",
        company: "Global Tech Corp",
        url: "https://example.com/jobs/seed-101",
        status: "applied",
        channels: ["email", "application_answer"],
        sentAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago -> Follow up!
        daysSinceSent: 6,
      },
    ];

    // Mock API routes
    await page.route("**/api/admin/drafts**", async (route) => {
      const method = route.request().method();
      const url = new URL(route.request().url());

      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            drafts: mockDrafts,
            counts: {
              all: mockDrafts.length,
              draft: mockDrafts.filter((d) => d.status === "draft").length,
              approved: mockDrafts.filter((d) => d.status === "approved").length,
              discarded: mockDrafts.filter((d) => d.status === "discarded").length,
            },
            answersToday: 2,
          }),
        });
      }

      if (method === "PATCH") {
        const id = url.pathname.split("/").pop();
        const payload = route.request().postDataJSON();
        const draft = mockDrafts.find((d) => d.id === id);
        if (draft) {
          if (payload.action === "mark_sent") {
            draft.sent_at = new Date().toISOString();
            draft.sent_channel = payload.channel || draft.kind;
            draft.status = "approved";
          }
          if (payload.recipient !== undefined) draft.recipient = payload.recipient;
          if (payload.status !== undefined) draft.status = payload.status;
          draft.updated_at = new Date().toISOString();
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft,
            counts: {
              all: mockDrafts.length,
              draft: mockDrafts.filter((d) => d.status === "draft").length,
              approved: mockDrafts.filter((d) => d.status === "approved").length,
              discarded: mockDrafts.filter((d) => d.status === "discarded").length,
            },
            answersToday: 2,
          }),
        });
      }

      return route.continue();
    });

    await page.route("**/api/admin/answers", async (route) => {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON();
        const newAnswer = {
          id: `draft-ans-${Date.now()}`,
          job_id: payload.jobId,
          kind: "application_answer" as const,
          subject: null,
          question: payload.question,
          body: "Generated application answer discussing Vouch and Team MCP Gateway with concrete latency results.",
          status: "draft" as const,
          model: "openai/gpt-oss-120b",
          edited: false,
          sent_at: null,
          sent_channel: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          job_title: "Full Stack Engineer (AI Platform)",
          job_company: "Global Tech Corp",
          job_url: "https://example.com/jobs/seed-101",
        };
        mockDrafts.push(newAnswer);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: newAnswer,
            counts: {
              all: mockDrafts.length,
              draft: mockDrafts.filter((d) => d.status === "draft").length,
              approved: mockDrafts.filter((d) => d.status === "approved").length,
              discarded: mockDrafts.filter((d) => d.status === "discarded").length,
            },
            answersToday: 3,
          }),
        });
      }
      return route.continue();
    });

    await page.route("**/api/admin/pipeline", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pipeline: mockPipeline }),
      });
    });

    await page.route("**/api/admin/jobs/*", async (route) => {
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON();
        if (mockPipeline[0]) {
          mockPipeline[0].status = payload.status;
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, status: payload.status }),
        });
      }
      return route.continue();
    });

    // 1. Visit admin
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    // 2. Click "Answer a question" on job card
    const answerBtn = page.locator(".admin-answer-question-btn").first();
    await expect(answerBtn).toBeVisible();
    await answerBtn.click();

    // Verify inline panel opened
    const answerPanel = page.locator(".admin-answer-panel");
    await expect(answerPanel).toBeVisible();

    // Click preset chip
    const presetChip = answerPanel.locator(".preset-chip").first();
    await presetChip.click();
    const textarea = answerPanel.locator("textarea").first();
    await expect(textarea).toHaveValue("What interests you about working for this company?");

    // Toggle full job description paste
    const toggleDescBtn = answerPanel.locator('button:has-text("Paste the full job description")');
    await toggleDescBtn.click();
    const descTextarea = answerPanel.locator('textarea[placeholder*="Paste full job posting"]');
    await expect(descTextarea).toBeVisible();
    await descTextarea.fill("Full description of the role with requirements.");

    // Submit answer generation
    const generateBtn = answerPanel.locator("button.admin-generate-answer-btn");
    await generateBtn.click();

    // 3. Verifies redirect to Messages tab
    await expect(page.locator(".admin-drafts-section")).toBeVisible();
    await expect(page.locator(".admin-budget-pill")).toContainText("Answers today:");

    // 4. Verify Application answer card rendering
    const cards = page.locator(".admin-draft-card");
    await expect(cards).toHaveCount(3);
    const ansCard = cards.filter({ hasText: "Application answer" }).first();
    await expect(ansCard).toBeVisible();
    await expect(ansCard.locator(".admin-draft-question")).toContainText("What interests you about working for this company?");

    // 5. Email draft: recipient input and mailto link
    const emailCard = cards.filter({ hasText: "Cold email" }).first();
    const recipientInput = emailCard.locator('input[type="email"]');
    await expect(recipientInput).toBeVisible();
    await expect(recipientInput).toHaveValue("recruiter@globaltech.com");

    const mailtoBtn = emailCard.locator("a.admin-mailto-btn");
    await expect(mailtoBtn).toBeVisible();
    const href = await mailtoBtn.getAttribute("href");
    expect(href).toContain("mailto:recruiter%40globaltech.com");
    expect(href).toContain("subject=");

    // 6. Mark sent button
    const markSentBtn = emailCard.locator("button.admin-mark-sent-btn");
    await expect(markSentBtn).toBeVisible();
    await markSentBtn.click();
    await expect(emailCard.locator(".badge-sent")).toBeVisible();
    await expect(emailCard.locator("button.admin-mark-sent-btn")).not.toBeVisible();

    // 7. Pipeline tab
    const pipelineTabBtn = page.locator('button.admin-tab-btn:has-text("Pipeline")');
    await pipelineTabBtn.click();
    await expect(page.locator(".admin-pipeline-section")).toBeVisible();

    const pipelineNotice = page.locator(".admin-pipeline-section .admin-notice-banner");
    await expect(pipelineNotice).toContainText("Nothing is sent from here. Track your applications and outreach manually.");

    const pipelineCard = page.locator(".admin-pipeline-card").first();
    await expect(pipelineCard).toBeVisible();
    await expect(pipelineCard).toContainText("Global Tech Corp");
    await expect(pipelineCard).toContainText("Email + Application answer");
    await expect(pipelineCard).toContainText("6d since sent");
    // Verify Follow up badge for >= 5 days
    await expect(pipelineCard.locator(".badge-followup")).toBeVisible();

    // Update status to replied
    const repliedBtn = pipelineCard.locator('button:has-text("Mark replied")');
    await repliedBtn.click();
    await expect(pipelineCard.locator(".badge-status")).toContainText("replied");
    // Follow up badge should disappear once replied
    await expect(pipelineCard.locator(".badge-followup")).not.toBeVisible();

    // 8. Responsive & axe scans across 5 widths
    const viewports = [375, 768, 1024, 1280, 1440];
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);

      const overflowing = await page.evaluate(() => {
        const root = document.documentElement;
        if (root.scrollWidth <= root.clientWidth) return [];
        // Name the elements that stick out, so a failure says what to fix
        return Array.from(document.body.querySelectorAll("*"))
          .map((el) => ({ el, right: Math.round(el.getBoundingClientRect().right) }))
          .filter((x) => x.right > root.clientWidth + 1)
          .slice(0, 6)
          .map((x) => `${x.el.tagName.toLowerCase()}.${String(x.el.className).split(" ").join(".")} right=${x.right} viewport=${root.clientWidth}`);
      });
      expect(overflowing, `horizontal overflow at ${width}px`).toEqual([]);

      const screenshotPath = path.join(
        screenshotsDir,
        `admin-pipeline-${width}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const axeResults = await new AxeBuilder({ page })
        .include(".admin-pipeline-section")
        .analyze();
      expect(axeResults.violations).toEqual([]);
    }
  });

  test("draft outreach partial failure: email and note saved, DM fails validation, inline banner shows without alert", async ({
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

    // Ensure no browser alert is fired
    page.on("dialog", (dialog) => {
      throw new Error(`Unexpected browser dialog: ${dialog.message()}`);
    });

    const savedDrafts = [
      {
        id: "draft-resilient-1",
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
        id: "draft-resilient-2",
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
    ];

    // Intercept drafts API returning partial failure (DM failed)
    await page.route("**/api/admin/drafts**", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            drafts: savedDrafts,
            failures: [
              {
                kind: "linkedin_dm",
                reason: "LinkedIn DM exceeds 500 characters (540 chars)",
              },
            ],
            counts: { all: 2, draft: 2, approved: 0, discarded: 0 },
          }),
        });
      }

      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            drafts: savedDrafts,
            counts: { all: 2, draft: 2, approved: 0, discarded: 0 },
          }),
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

    // 4. Verifies 2 drafts appear (email and note)
    const draftCards = page.locator(".admin-draft-card");
    await expect(draftCards).toHaveCount(2);
    await expect(draftCards.nth(0)).toContainText("Cold email");
    await expect(draftCards.nth(1)).toContainText("LinkedIn note");

    // 5. Verifies inline outreach error banner is visible with specific message
    const errorBanner = page.locator(".admin-drafts-section .admin-error-box");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("Saved 2 of 3 (LinkedIn DM failed: LinkedIn DM exceeds 500 characters (540 chars))");
  });

  test("tracked links, bot vs human visits, and reply check workflow (Bundle B3 & C)", async ({
    page,
    context,
    request,
  }) => {
    // 1. Generate a tracked code on /r/[code]
    const testCode = "abc23456";

    // 2. Visit with human UA
    const humanRes = await request.get(`/r/${testCode}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "x-vercel-ip-country": "IN",
      },
      maxRedirects: 0,
    });
    expect(humanRes.status()).toBe(302);
    expect(humanRes.headers()["location"]).toMatch(/\/(?:$|\?)/);
    expect(humanRes.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(humanRes.headers()["set-cookie"]).toBeUndefined();

    // 3. Visit with bot UA
    const botRes = await request.get(`/r/${testCode}`, {
      headers: {
        "user-agent": "facebookexternalhit/1.1",
      },
      maxRedirects: 0,
    });
    expect(botRes.status()).toBe(302);
    expect(botRes.headers()["location"]).toMatch(/\/(?:$|\?)/);

    // 4. Set up admin session and route mocks for Pipeline and Replies
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

    let replyCheckCalled = false;
    await page.route("**/api/admin/replies/check", async (route) => {
      replyCheckCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-Robots-Tag": "noindex, nofollow" },
        body: JSON.stringify({
          success: true,
          checked: 3,
          exactMatches: 1,
          possibleMatches: 1,
          alertsSent: 1,
        }),
      });
    });

    await page.route("**/api/admin/pipeline", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pipeline: [
            {
              id: "seed-101",
              title: "Junior Backend Developer",
              company: "Alpha Cloud",
              url: "https://remoteok.com/remote-jobs/seed-101",
              status: "applied",
              channels: ["email"],
              sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              daysSinceSent: 2,
              visitCount: 1, // 1 human visit recorded, bot excluded
              lastVisitAt: new Date().toISOString(),
              possibleReply: {
                id: "reply-1",
                snippet: "Thanks for applying to Alpha Cloud",
                receivedAt: new Date().toISOString(),
              },
            },
          ],
        }),
      });
    });

    // 5. Open admin dashboard and navigate to Pipeline tab
    await page.goto("/admin");
    const pipelineTabBtn = page.locator('.admin-tab-btn:has-text("Pipeline")');
    await expect(pipelineTabBtn).toBeVisible();
    await pipelineTabBtn.click();

    // 6. Verify pipeline card displays exactly 1 visit
    const pipelineCard = page.locator('.admin-pipeline-card[data-pipeline-id="seed-101"]');
    await expect(pipelineCard).toBeVisible();
    await expect(pipelineCard).toContainText("Visited 1 time");

    // 7. Verify Possible reply badge and confirm/dismiss buttons
    const possibleReplyBadge = pipelineCard.locator(".badge-possible-reply");
    await expect(possibleReplyBadge).toBeVisible();
    await expect(possibleReplyBadge).toContainText("Possible reply, confirm");

    // 8. Test Check replies button
    const checkRepliesBtn = page.locator(".admin-check-replies-btn");
    await expect(checkRepliesBtn).toBeVisible();
    await checkRepliesBtn.click();
    expect(replyCheckCalled).toBe(true);

    // 9. Axe accessibility test on pipeline view
    const axeResults = await new AxeBuilder({ page })
      .include(".admin-pipeline-section")
      .analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("send approved email: two-step confirm, daily limit message, send all (Bundle B4)", async ({ page, context }) => {
    const { createSessionToken } = await import("../src/lib/admin/session");
    const secret = "test-admin-session-secret-at-least-32-chars-long-e2e-only";
    const token = createSessionToken(secret);

    await context.addCookies([
      { name: "__Host-admin", value: token, domain: "localhost", path: "/", secure: true },
      { name: "admin", value: token, domain: "localhost", path: "/" },
    ]);

    page.on("dialog", (dialog) => {
      throw new Error(`Unexpected browser dialog: ${dialog.message()}`);
    });

    const baseDraft = {
      id: "draft-send-1",
      job_id: "seed-101",
      kind: "email",
      subject: "Full-Stack AI Engineering - Ramakrishna",
      body: "Hi team, I noticed your opening at Global Tech Corp and would like to talk about it.",
      status: "approved",
      model: "openai/gpt-oss-120b",
      edited: false,
      recipient: "hr@example.com",
      sent_at: null as string | null,
      sent_channel: null as string | null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      job_title: "Full Stack Engineer (AI Platform)",
      job_company: "Global Tech Corp",
      job_url: "https://example.com/jobs/seed-101",
    };

    let draft = { ...baseDraft };
    let sendCalls = 0;
    let sendAllCalls = 0;
    let sendMode: "ok" | "cap" = "cap";

    const counts = () => ({ all: 1, draft: 0, approved: 1, discarded: 0 });

    await page.route("**/api/admin/drafts**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();

      if (method === "POST" && url.pathname.endsWith("/send-all")) {
        sendAllCalls++;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sent: 2,
            failed: 0,
            skipped: [],
            stoppedBecause: null,
            remainingToday: 18,
            eligibleLeft: 0,
            counts: counts(),
          }),
        });
      }

      if (method === "POST" && url.pathname.endsWith("/send")) {
        sendCalls++;
        if (sendMode === "cap") {
          return route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ error: "Daily limit reached (20 of 20 sent today). Try again tomorrow.", code: "daily_cap" }),
          });
        }
        draft = { ...draft, sent_at: new Date().toISOString(), sent_channel: "email" };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ draft, counts: counts() }),
        });
      }

      if (method === "GET" && url.pathname === "/api/admin/drafts") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ drafts: [draft], counts: counts(), answersToday: 0 }),
        });
      }

      return route.continue();
    });

    await page.goto("/admin");
    await page.locator('.admin-tab-btn:has-text("Messages")').click();
    await expect(page.locator(".admin-drafts-section")).toBeVisible();
    await page.locator(".admin-filter-btn", { hasText: "Approved" }).click();

    const card = page.locator(".admin-draft-card").first();
    const sendBtn = card.locator(".admin-send-btn");
    await expect(sendBtn).toBeVisible();

    // Step 1: the first click only asks for confirmation. Nothing is sent. Cancel goes back.
    await sendBtn.click();
    await expect(card.locator(".admin-send-confirm-btn")).toContainText("hr@example.com");
    expect(sendCalls).toBe(0);
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(sendBtn).toBeVisible();
    expect(sendCalls).toBe(0);

    // Step 2: daily limit error is shown and the draft stays sendable
    await sendBtn.click();
    await card.locator(".admin-send-confirm-btn").click();
    await expect(page.locator(".admin-toast")).toContainText("Daily limit reached");
    expect(sendCalls).toBe(1);
    await expect(card.locator(".admin-send-btn")).toBeVisible();

    // Step 3: success marks it sent and removes the send button
    sendMode = "ok";
    await card.locator(".admin-send-btn").click();
    await card.locator(".admin-send-confirm-btn").click();
    await expect(page.locator(".admin-toast")).toContainText("Sent to hr@example.com");
    expect(sendCalls).toBe(2);
    await expect(card.locator(".admin-send-btn")).toHaveCount(0);

    // Send all: asks for confirmation first, then reports the result
    await page.locator(".admin-send-all-btn").click();
    expect(sendAllCalls).toBe(0);
    await page.locator(".admin-send-all-confirm-btn").click();
    await expect(page.locator(".admin-toast")).toContainText("Sent 2");
    expect(sendAllCalls).toBe(1);
  });
});
