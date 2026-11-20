import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

const EXPECTED_EXPERIENCE_ITEMS = [
  "Built the part that follows every call through its states, and ignores late messages so a finished call never flips back to active.",
  "Built 8 voice tools for the agent (booking, availability, leads, opt-outs, transfer and more) with replay protection, so a retried call never books twice. Connected Cal.com so the agent books live; 2 staging calls ended in real bookings.",
  "Added checks before any call is placed: number format, consent, the suppression list and the recipient's own 9am to 6pm window. That stops wasted credits and carrier trouble.",
  "Found a gateway that answered 200 with no login token, and added JWT and role checks.",
  "Chose hosting from numbers: FastAPI on Cloudflare Workers took 4 s to start but answered warm requests in 110 to 130 ms. Backed the work with 2,000+ automated tests.",
] as const;

const EXPECTED_SKILLS = [
  {
    category: "Languages",
    skills: "JavaScript, TypeScript, Python, SQL, HTML, CSS",
  },
  {
    category: "Frontend and backend",
    skills:
      "React, Next.js, Vite, Node.js, Express, FastAPI, Tailwind CSS, REST, JWT",
  },
  {
    category: "Real-time and AI",
    skills:
      "WebSocket, Socket.io, WebRTC, Vapi, Telnyx, Cal.com API, Groq, Gemini, Claude API, MCP, LLM tool calling, webhooks",
  },
  {
    category: "Data and DevOps",
    skills:
      "MongoDB, PostgreSQL (Supabase, pgvector), Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Render, Git",
  },
  {
    category: "Testing",
    skills: "pytest, Jest, Vitest, Playwright, Postman, ESLint",
  },
] as const;

test.describe("Experience, Skills, and Contact (S5)", () => {
  test("Experience and Skills sections match docs/content.md verbatim (TEST-003, TEST-013)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    // Experience section
    const exp = page.locator("section#experience");
    await expect(exp.locator(".eyebrow")).toHaveText(
      "Experience · Aug 2026 – Nov 2026, remote"
    );
    await expect(exp.locator("#exp-title")).toHaveText(
      "AI and Automation Engineer Intern"
    );
    await expect(exp.locator(".company-tag")).toHaveText(
      "Luxecurio Pvt Ltd (SonicVocal)"
    );
    await expect(exp.locator(".intro")).toHaveText(
      "I worked on an AI phone-calling product for US businesses. The agent books appointments over the phone, so the product has to be right even when a call is retried, late or dropped."
    );

    // NDA note
    const ndaNote = exp.locator(".nda");
    await expect(ndaNote).toBeVisible();
    await expect(ndaNote).toHaveText(
      "This work is under NDA, so there is no public link. I'm happy to walk through it in an interview."
    );

    // Numbered items
    const expItems = exp.locator("ol li");
    await expect(expItems).toHaveCount(5);
    for (let i = 0; i < EXPECTED_EXPERIENCE_ITEMS.length; i++) {
      await expect(expItems.nth(i)).toHaveText(EXPECTED_EXPERIENCE_ITEMS[i]);
      await expect(expItems.nth(i)).toHaveAttribute(
        "data-n",
        String(i + 1).padStart(2, "0")
      );
    }

    // Verify NDA rule: no links anywhere pointing to SonicVocal product website
    const allLinks = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") || "")
    );
    for (const href of allLinks) {
      expect(
        href.toLowerCase(),
        `Forbidden product site link found: ${href}`
      ).not.toContain("sonicvocal.com");
      expect(
        href.toLowerCase(),
        `Forbidden product site link found: ${href}`
      ).not.toContain("sonicvocal.ai");
    }

    // Skills section
    const skills = page.locator("section#skills");
    await expect(skills.locator(".sec-head .eyebrow")).toHaveText("Skills");
    await expect(skills.locator("#skills-title")).toHaveText("What I work with.");
    await expect(skills.locator(".sec-head p").nth(1)).toHaveText(
      "I use AI coding tools (Claude, Google Antigravity and ChatGPT), and I read, review and test everything they write before it ships."
    );

    const rows = skills.locator("dl .row");
    await expect(rows).toHaveCount(5);
    for (let i = 0; i < EXPECTED_SKILLS.length; i++) {
      await expect(rows.nth(i).locator("dt")).toHaveText(
        EXPECTED_SKILLS[i].category
      );
      await expect(rows.nth(i).locator("dd")).toHaveText(
        EXPECTED_SKILLS[i].skills
      );
    }

    // Education & Certifications
    const edu = skills.locator(".edu > div").nth(0);
    await expect(edu.locator(".eyebrow")).toHaveText("Education");
    await expect(edu.locator("p").nth(1)).toContainText(
      "BSc in Computer Science, BITS Pilani. Graduated 2026."
    );

    const certs = skills.locator(".edu > div").nth(1);
    await expect(certs.locator(".eyebrow")).toHaveText("Certifications");
    await expect(certs.locator("p").nth(1)).toHaveText(
      "NISM Series VIII: Equity Derivatives (SEBI). Meta Backend Developer Professional Certificate. Google IT Automation with Python."
    );
  });

  test("Experience, Skills, and Contact content is present and visible with JavaScript disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(page.locator("section#experience #exp-title")).toBeVisible();
    await expect(page.locator("section#skills #skills-title")).toBeVisible();
    await expect(page.locator("section#contact #contact-title")).toBeVisible();

    // Check contact links
    await expect(
      page.locator('section#contact a[href="https://www.linkedin.com/in/rvramakrishna"]')
    ).toBeVisible();
    await expect(
      page.locator('section#contact a[href="https://github.com/rvramakrishna7"]')
    ).toBeVisible();
    await expect(
      page.locator('section#contact a[href="/resume.pdf"]')
    ).toBeVisible();

    // Form fields are present in HTML
    await expect(page.locator("section#contact input#contact-name")).toBeVisible();
    await expect(page.locator("section#contact input#contact-email")).toBeVisible();
    await expect(page.locator("section#contact textarea#contact-message")).toBeVisible();
    await expect(
      page.locator('section#contact button[type="submit"]')
    ).toBeVisible();
  });

  test("Contact section links, labels, and honeypot accessibility", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const contact = page.locator("section#contact");
    await expect(contact.locator(".eyebrow")).toHaveText("Contact");
    await expect(contact.locator("#contact-title")).toHaveText(
      "Got a role, or a hard problem?"
    );
    await expect(contact.locator(".sub-text")).toHaveText(
      "Send a message and it lands straight in my inbox. I reply fast."
    );

    // Big links
    const linkedIn = contact.locator('a[href="https://www.linkedin.com/in/rvramakrishna"]');
    await expect(linkedIn).toHaveText("LinkedIn →");
    await expect(linkedIn).toHaveAttribute("target", "_blank");
    await expect(linkedIn).toHaveAttribute("rel", "noopener noreferrer");

    const github = contact.locator('a[href="https://github.com/rvramakrishna7"]');
    await expect(github).toHaveText("GitHub →");
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", "noopener noreferrer");

    const resume = contact.locator('a[href="/resume.pdf"]');
    await expect(resume).toHaveText("Resume (PDF) →");

    // Form fields
    await expect(contact.locator('label[for="contact-name"]')).toHaveText(
      "Your name"
    );
    await expect(contact.locator('label[for="contact-email"]')).toHaveText(
      "Your email"
    );
    await expect(contact.locator('label[for="contact-message"]')).toHaveText(
      "Message"
    );

    const submitBtn = contact.locator('button[type="submit"]');
    await expect(submitBtn).toHaveText("Send message");

    // Honeypot is not focusable or visible
    const hpField = contact.locator("#contact-website");
    await expect(hpField).toHaveAttribute("tabindex", "-1");
    await expect(contact.locator(".hp-field")).toHaveAttribute("aria-hidden", "true");

    // Touch targets >= 44 px
    const btnBox = await submitBtn.boundingBox();
    expect(btnBox?.height).toBeGreaterThanOrEqual(44);

    const linkedInBox = await linkedIn.boundingBox();
    expect(linkedInBox?.height).toBeGreaterThanOrEqual(44);
  });

  test("Contact form: valid input sends JSON, disables button, shows success message and clears fields (TEST-010)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    let apiCalled = false;
    let requestPayload: unknown = null;

    await page.route("**/api/contact", async (route) => {
      apiCalled = true;
      requestPayload = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Thanks. Your message is on its way, and I'll reply soon.",
        }),
      });
    });

    const nameInput = page.locator("#contact-name");
    const emailInput = page.locator("#contact-email");
    const messageInput = page.locator("#contact-message");
    const submitBtn = page.locator('section#contact button[type="submit"]');

    await nameInput.fill("Recruiter Jane");
    await emailInput.fill("jane@techfirm.example");
    await messageInput.fill("We saw your work and would love to schedule a technical chat.");

    await submitBtn.click();

    const statusMsg = page.locator("#form-status");
    await expect(statusMsg).toHaveText(
      "Thanks. Your message is on its way, and I'll reply soon."
    );
    await expect(statusMsg).toHaveClass(/ok/);

    expect(apiCalled).toBe(true);
    expect(requestPayload).toEqual({
      name: "Recruiter Jane",
      email: "jane@techfirm.example",
      message: "We saw your work and would love to schedule a technical chat.",
      website: "",
    });

    // Form inputs cleared on success
    await expect(nameInput).toHaveValue("");
    await expect(emailInput).toHaveValue("");
    await expect(messageInput).toHaveValue("");
  });

  test("Contact form: invalid input displays field errors from API (TEST-010)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Validation failed",
          errors: {
            name: "Your name is required",
            email: "Please enter a valid email address",
            message: "Message must be at least 10 characters",
          },
        }),
      });
    });

    const submitBtn = page.locator('section#contact button[type="submit"]');
    await submitBtn.click();

    await expect(page.locator("#name-error")).toHaveText(
      "Your name is required"
    );
    await expect(page.locator("#email-error")).toHaveText(
      "Please enter a valid email address"
    );
    await expect(page.locator("#message-error")).toHaveText(
      "Message must be at least 10 characters"
    );
  });

  test("Contact form: API 502 shows error text from content.md (TEST-010)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "That did not send. Please try again, or message me on LinkedIn.",
        }),
      });
    });

    await page.locator("#contact-name").fill("Jane Doe");
    await page.locator("#contact-email").fill("jane@example.com");
    await page.locator("#contact-message").fill("Hello Ramakrishna, wanted to reach out!");

    const submitBtn = page.locator('section#contact button[type="submit"]');
    await submitBtn.click();

    const statusMsg = page.locator("#form-status");
    await expect(statusMsg).toHaveText(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    await expect(statusMsg).toHaveClass(/err/);
  });

  test("axe scan finds zero violations on / across all sections at 375 px and 1440 px (TEST-008)", async ({
    page,
  }) => {
    for (const width of [375, 1440] as const) {
      await page.setViewportSize({
        width,
        height: width < 768 ? 812 : 900,
      });
      await page.goto("/");

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        `Axe violations on / with all sections at ${width}px`
      ).toEqual([]);
    }
  });

  test("no horizontal scroll at all 5 widths and saves screenshots of Experience, Skills, Contact", async ({
    page,
  }) => {
    test.setTimeout(60000);

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

      // Take section screenshots
      const expSection = page.locator("section#experience");
      await expSection.scrollIntoViewIfNeeded();
      await expSection.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `experience-${viewport.width}.png`
        ),
      });

      const skillsSection = page.locator("section#skills");
      await skillsSection.scrollIntoViewIfNeeded();
      await skillsSection.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `skills-${viewport.width}.png`
        ),
      });

      const contactSection = page.locator("section#contact");
      await contactSection.scrollIntoViewIfNeeded();
      await contactSection.screenshot({
        path: path.join(
          process.cwd(),
          "e2e",
          "screenshots",
          `contact-${viewport.width}.png`
        ),
      });
    }
  });
});
