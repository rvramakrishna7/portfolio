import { describe, it, expect, beforeEach } from "vitest";
import {
  parseInboundCandidates,
  processAndIngestInboundCandidates,
  normalizeUrl,
} from "./parse";
import { InMemoryJobsRepository } from "../jobs/repository";

describe("Inbound Parser (src/lib/inbound/parse.ts)", () => {
  let repo: InMemoryJobsRepository;

  beforeEach(() => {
    repo = new InMemoryJobsRepository();
  });

  describe("normalizeUrl", () => {
    it("strips tracking parameters and lowercases host", () => {
      const url =
        "https://WWW.Example.com/jobs/dev-1/?utm_source=linkedin&utm_medium=email&trk=job_alert&ref=123#heading";
      expect(normalizeUrl(url)).toBe("https://www.example.com/jobs/dev-1");
    });
  });

  describe("parseInboundCandidates - >= 12 labelled test cases", () => {
    // 1. WhatsApp forward with explicit Role and Company
    it("Case 1 (WhatsApp forward with explicit Role and Company)", () => {
      const text = `
*Job Opportunity!*
Role: Frontend Developer
Company: Acme Systems
Location: Remote (India)
Experience: 0-1 years / Freshers
Tech Stack: React, Next.js, TypeScript
Apply here: https://acme.com/jobs/frontend?utm_source=wa
Contact: hr@acme.com
`;
      const candidates = parseInboundCandidates(text, { source: "whatsapp" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].title).toBe("Frontend Developer");
      expect(candidates[0].company).toBe("Acme Systems");
      expect(candidates[0].location).toContain("Remote (India)");
      expect(candidates[0].url).toContain("https://acme.com/jobs/frontend");
      expect(candidates[0].contact_email).toBe("hr@acme.com");
      expect(candidates[0].source).toBe("whatsapp");
    });

    // 2. Short text forward ("Junior Backend Engineer at Stripe")
    it("Case 2 (Short text snippet with 'at Company')", () => {
      const text = `
Junior Backend Engineer at Stripe
Apply: https://stripe.com/careers/junior-backend
Remote, India ok. Python, FastAPI, Postgres.
`;
      const candidates = parseInboundCandidates(text, { source: "paste" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].title).toBe("Junior Backend Engineer");
      expect(candidates[0].company).toBe("Stripe");
      expect(candidates[0].url).toBe("https://stripe.com/careers/junior-backend");
      expect(candidates[0].isRemote).toBe(true);
    });

    // 3. "Hiring Alert: Title at Company" pattern
    it("Case 3 (Hiring Alert pattern)", () => {
      const text = `
Hiring Alert: Full Stack Engineer at Razorpay
Location: Bengaluru / Remote
Send applications to: https://jobs.lever.co/razorpay/98765
`;
      const candidates = parseInboundCandidates(text, { source: "telegram" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].title).toBe("Full Stack Engineer");
      expect(candidates[0].company).toBe("Razorpay");
      expect(candidates[0].url).toBe("https://jobs.lever.co/razorpay/98765");
    });

    // 4. LinkedIn alert email HTML snippet
    it("Case 4 (LinkedIn alert email HTML snippet)", () => {
      const html = `
<div class="job-card">
  <h2><a href="https://www.linkedin.com/jobs/view/123456789?trackingId=xyz">Software Engineer</a></h2>
  <div class="company-name">Google</div>
  <div class="job-location">Bengaluru, Karnataka, India (Remote)</div>
  <p>We are looking for an entry level Software Engineer with strong Python and algorithms foundations.</p>
</div>
`;
      const candidates = parseInboundCandidates(html, { source: "email" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].title).toBe("Software Engineer");
      expect(candidates[0].company).toBe("Google");
      expect(candidates[0].location).toContain("Bengaluru");
      expect(candidates[0].url).toContain("linkedin.com/jobs/view/123456789");
    });

    // 5. Hacker News 'Who is hiring' style comment
    it("Case 5 (HN-style comment)", () => {
      const text = `
Datadog | Junior Software Engineer | Remote (US/Worldwide) | Full-time | https://datadog.com/jobs/1234
We build cloud observability tools. Looking for early-career developers with Python or Go skills.
Contact: hiring@datadog.com
`;
      const candidates = parseInboundCandidates(text, { source: "paste" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].company).toBe("Datadog");
      expect(candidates[0].title).toBe("Junior Software Engineer");
      expect(candidates[0].location).toContain("Remote");
      expect(candidates[0].url).toBe("https://datadog.com/jobs/1234");
      expect(candidates[0].contact_email).toBe("hiring@datadog.com");
    });

    // 6. Multiple jobs in one WhatsApp digest (splitting & intrabatch deduplication)
    it("Case 6 (Multi-job digest with numbering)", () => {
      const text = `
Weekly Developer Openings:
1. React Developer at Zerodha
https://zerodha.com/careers/react-dev
Remote (India)

2. Python Developer at Swiggy
https://swiggy.com/careers/python-dev
Bengaluru, Karnataka
`;
      const candidates = parseInboundCandidates(text, { source: "whatsapp" });
      expect(candidates).toHaveLength(2);
      expect(candidates[0].company).toBe("Zerodha");
      expect(candidates[1].company).toBe("Swiggy");
    });

    // 7. Junk / non-job chat message (returns 0 candidates)
    it("Case 7 (Junk chat message returns 0 candidates)", () => {
      const text = `
Hey Ramakrishna, hope you're having a good weekend! Let me know when you're free for dinner tonight.
`;
      const candidates = parseInboundCandidates(text, { source: "whatsapp" });
      expect(candidates).toHaveLength(0);
    });

    // 8. Junk message with non-job link (returns 0 candidates)
    it("Case 8 (Non-job link and text returns 0 candidates)", () => {
      const text = `
Check out this funny cat video I found online: https://youtube.com/watch?v=dQw4w9WgXcQ
`;
      const candidates = parseInboundCandidates(text, { source: "telegram" });
      expect(candidates).toHaveLength(0);
    });

    // 9. "Company is looking for..." pattern
    it("Case 9 ('Company is looking for' pattern)", () => {
      const text = `
Vercel is looking for an AI Automation Engineer.
Work remotely from anywhere in the world. Freshers with open-source experience welcome.
Apply: https://vercel.com/careers/ai-engineer
`;
      const candidates = parseInboundCandidates(text, { source: "telegram" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].company).toBe("Vercel");
      expect(candidates[0].title).toBe("AI Automation Engineer");
      expect(candidates[0].url).toBe("https://vercel.com/careers/ai-engineer");
    });

    // 10. Email forward with contact email and no URL (generates mailto: URL)
    it("Case 10 (Forward with email address and no HTTP link)", () => {
      const text = `
Hiring: Node.js Developer @ Postman
Work from home / Remote. 0-1 years experience.
Please send resumes directly to careers@postman.com
`;
      const candidates = parseInboundCandidates(text, { source: "email" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].company).toBe("Postman");
      expect(candidates[0].title).toBe("Node.js Developer");
      expect(candidates[0].contact_email).toBe("careers@postman.com");
      expect(candidates[0].url).toBe("mailto:careers@postman.com");
    });

    // 11. ATS link with company in URL path (Greenhouse)
    it("Case 11 (Greenhouse link where company is inferred from URL)", () => {
      const text = `
Found this great opening for Junior Software Engineer!
Check out https://boards.greenhouse.io/figma/jobs/5678
Remote work allowed.
`;
      const candidates = parseInboundCandidates(text, { source: "paste" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].company).toBe("Figma");
      expect(candidates[0].url).toContain("boards.greenhouse.io/figma/jobs/5678");
    });

    // 12. Non-English junk / invoice text (returns 0 candidates)
    it("Case 12 (Non-job invoice text returns 0 candidates)", () => {
      const text = `
Facture mensuelle #49281 pour votre service.
Rendez-vous sur https://moncompte.fr pour régler la facture.
`;
      const candidates = parseInboundCandidates(text, { source: "email" });
      expect(candidates).toHaveLength(0);
    });
  });

  describe("processAndIngestInboundCandidates (Pipeline reuse & deduplication)", () => {
    it("ingests new candidate, classifies and saves to repository", async () => {
      const candidates = [
        {
          title: "Junior Full Stack Engineer",
          company: "Acme Corp",
          location: "Remote (Worldwide)",
          url: "https://acme.com/jobs/1",
          description: "We are hiring a Junior Full Stack Engineer with React, TypeScript, and Node.js. 0-1 years exp.",
          source: "paste",
          isRemote: true,
        },
      ];

      const res = await processAndIngestInboundCandidates(candidates, repo);
      expect(res.added).toBe(1);
      expect(res.duplicates).toBe(0);
      expect(res.filtered).toBe(0);
      expect(res.jobs).toHaveLength(1);
      expect(res.jobs[0].title).toBe("Junior Full Stack Engineer");
      expect(res.jobs[0].company).toBe("Acme Corp");
    });

    it("filters out senior roles per pipeline rules", async () => {
      const candidates = [
        {
          title: "Senior Staff Architect",
          company: "Enterprise Inc",
          location: "Remote",
          url: "https://enterprise.com/jobs/senior",
          description: "Requires 10+ years of software architecture experience.",
          source: "telegram",
        },
      ];

      const res = await processAndIngestInboundCandidates(candidates, repo);
      expect(res.added).toBe(1); // Saved to DB as hidden/skipped
      expect(res.filtered).toBe(1);
      expect(res.jobs[0].filter_reason).toBeDefined();
    });

    it("handles intra-batch and DB duplicates cleanly", async () => {
      const candidates = [
        {
          title: "Frontend Developer",
          company: "Test Co",
          location: "Remote",
          url: "https://test.co/jobs/1?utm_source=twitter",
          description: "React and TypeScript engineer with 1 year experience.",
          source: "whatsapp",
        },
        {
          title: "Frontend Developer",
          company: "Test Co",
          location: "Remote",
          url: "https://test.co/jobs/1?utm_source=whatsapp", // Duplicate URL after normalize
          description: "React and TypeScript engineer with 1 year experience.",
          source: "whatsapp",
        },
      ];

      const res1 = await processAndIngestInboundCandidates(candidates, repo);
      expect(res1.added).toBe(1);
      expect(res1.duplicates).toBe(1);

      // Ingesting again with same URL should detect DB duplicate
      const res2 = await processAndIngestInboundCandidates(
        [
          {
            title: "Frontend Developer",
            company: "Test Co",
            location: "Remote",
            url: "https://test.co/jobs/1",
            description: "React and TypeScript engineer with 1 year experience.",
            source: "whatsapp",
          },
        ],
        repo
      );
      expect(res2.added).toBe(0);
      expect(res2.duplicates).toBe(1);
    });
  });
});
