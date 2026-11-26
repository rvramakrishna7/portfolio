import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FORBIDDEN_VISIBLE_TOKENS, VIEWPORTS } from "./helpers";

const EXPECTED_EXPERIENCE_ITEMS = [
  "Stopped finished calls from flipping back to active. I built the call-state handling for Vapi webhooks, so a late or out-of-order event cannot reopen a call that has ended.",
  "Made the agent's tools safe to retry. I worked on eight tools (booking, availability, leads, contacts, opt-outs, callbacks, transfers and more) and added idempotency checks so a retried request cannot book or record the same thing twice.",
  "Connected Cal.com v2 for live availability and booking. Two staging calls ended in confirmed bookings.",
  "Added checks before every outbound call: phone number format, consent, suppression list, the recipient's local calling window, and capacity limits.",
  "Worked on campaign pause, resume and cancel, and added protection against duplicate campaign jobs.",
  "Closed an authorization gap in the Cloudflare Worker gateway, which answered requests that carried no login token, by adding JWT and role checks.",
  "Measured FastAPI on Cloudflare Workers before choosing it: about 4 seconds for a cold start and 110 to 130 ms for warm requests in the benchmark I ran.",
] as const;

const EXPECTED_SKILLS = [
  {
    category: "Languages",
    skills: "JavaScript, TypeScript, Python, SQL, HTML, CSS",
  },
  {
    category: "Frontend",
    skills: "React, Next.js, Vite, Tailwind CSS",
  },
  {
    category: "Backend",
    skills: "Node.js, Express, FastAPI, REST APIs, JWT",
  },
  {
    category: "Real-time systems",
    skills: "WebSocket, Socket.io, WebRTC, webhooks",
  },
  {
    category: "AI and integrations",
    skills:
      "Claude API, Groq, Gemini, Vapi, Telnyx, Cal.com API, MCP, pgvector, LLM tool calling",
  },
  {
    category: "Databases",
    skills: "MongoDB, PostgreSQL, Supabase",
  },
  {
    category: "Infrastructure",
    skills:
      "Docker, Kubernetes, Helm, Cloudflare Workers, Render, Vercel, Git",
  },
  {
    category: "Testing",
    skills: "pytest, Jest, Vitest, Playwright, Postman, ESLint",
  },
] as const;

test.describe("Experience, Skills, and Contact (S5)", () => {
  test("Experience, Skills, and About sections match docs/content-v2.md verbatim (TEST-003, TEST-013)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    // Experience section
    const exp = page.locator("section#experience");
    await expect(exp.locator(".eyebrow")).toHaveText("Experience");
    await expect(exp.locator("#exp-title")).toHaveText(
      "A business shouldn't lose a customer just because nobody can answer the phone."
    );
    await expect(exp.locator(".exp-role")).toHaveText("AI and Automation Engineer Intern");
    await expect(exp.locator(".exp-company")).toHaveText("Luxecurio Pvt Ltd (SonicVocal)");
    await expect(exp.locator(".exp-chip").nth(0)).toHaveText("Remote");
    await expect(exp.locator(".exp-chip").nth(1)).toHaveText("August 2026 to November 2026");
    await expect(exp.locator(".intro")).toHaveText(
      "Businesses lose opportunities when calls go unanswered because the owner or staff are busy. Someone has to pick up, understand the request, check the calendar and book the appointment manually."
    );
    await expect(exp.locator(".product-desc")).toHaveText(
      "SonicVocal is an AI voice platform for businesses. Its agent answers real phone calls, understands what the caller needs, answers common questions from a knowledge base, checks availability and books appointments through Cal.com, records leads and contacts, takes callback and opt-out requests, and transfers to a human when needed. It also runs outbound calling campaigns."
    );

    // NDA note
    const ndaNote = exp.locator(".nda");
    await expect(ndaNote).toBeVisible();
    await expect(ndaNote).toHaveText(
      "Some implementation details are confidential. I'm happy to walk through my engineering contributions and the architecture in an interview."
    );

    // Numbered items
    const expItems = exp.locator("ol li");
    await expect(expItems).toHaveCount(7);
    for (let i = 0; i < EXPECTED_EXPERIENCE_ITEMS.length; i++) {
      await expect(expItems.nth(i)).toHaveText(EXPECTED_EXPERIENCE_ITEMS[i]);
      await expect(expItems.nth(i)).toHaveAttribute(
        "data-n",
        String(i + 1).padStart(2, "0")
      );
    }

    // Testing line
    await expect(exp.locator(".exp-testing")).toHaveText(
      "2,026 automated tests in the modules I owned, out of 2,239 in the full repository suite as reported."
    );

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
    await expect(skills.locator(".sec-head .eyebrow")).toHaveText(
      "Engineering capabilities"
    );
    await expect(skills.locator("#skills-title")).toHaveText("What I work with");

    const rows = skills.locator("dl .row");
    await expect(rows).toHaveCount(8);
    for (let i = 0; i < EXPECTED_SKILLS.length; i++) {
      await expect(rows.nth(i).locator("dt")).toHaveText(
        EXPECTED_SKILLS[i].category
      );
      await expect(rows.nth(i).locator("dd")).toHaveText(
        EXPECTED_SKILLS[i].skills
      );
    }

    // About section (Education & Certifications)
    const about = page.locator("section#about");
    await expect(about.locator(".eyebrow")).toHaveText("About");
    await expect(about.locator("#about-title")).toHaveText("How I work");
    await expect(about.locator(".about-degree")).toContainText(
      "BS Computer Science, BITS Pilani, 2026."
    );

    const certItems = about.locator(".about-certs li");
    await expect(certItems).toHaveCount(3);
    await expect(certItems.nth(0)).toHaveText(
      "NISM Series VIII Equity Derivatives (SEBI)"
    );
    await expect(certItems.nth(1)).toHaveText(
      "Meta Backend Developer Professional Certificate"
    );
    await expect(certItems.nth(2)).toHaveText(
      "Google IT Automation with Python"
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
      "Have a problem worth solving?"
    );
    await expect(contact.locator(".sub-text")).toHaveText(
      "I'm open to software engineering opportunities. Tell me about your team, the role or the problem you're working on."
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
    await expect(resume).toHaveText("Download resume →");

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

  test("Contact form: API 502, 500, or 429 with server error strings shows content.md error text and never server string (TEST-010)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    // 1. Mocked 429 with server string
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Too many requests. Please try again later.",
        }),
      });
    });

    await page.locator("#contact-name").fill("Jane Doe");
    await page.locator("#contact-email").fill("jane@example.com");
    await page.locator("#contact-message").fill("Hello Ramakrishna, testing rate limit error handling!");

    const submitBtn = page.locator('section#contact button[type="submit"]');
    await submitBtn.click();

    const statusMsg = page.locator("#form-status");
    await expect(statusMsg).toHaveText(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    await expect(statusMsg).not.toContainText("Too many requests");
    await expect(statusMsg).toHaveClass(/err/);

    // 2. Mocked 500 with an internal server error string
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Internal database crashed or secret key missing on host",
        }),
      });
    });

    await submitBtn.click();

    await expect(statusMsg).toHaveText(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    await expect(statusMsg).not.toContainText("Internal database crashed");
    await expect(statusMsg).not.toContainText("secret key missing");
    await expect(statusMsg).toHaveClass(/err/);

    // 3. Mocked 502 (Web3Forms network/service failure)
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Upstream gateway bad response 502",
        }),
      });
    });

    await submitBtn.click();

    await expect(statusMsg).toHaveText(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    await expect(statusMsg).not.toContainText("Upstream gateway");
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
