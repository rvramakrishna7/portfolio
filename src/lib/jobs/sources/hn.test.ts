import { describe, it, expect } from "vitest";
import { parseHnComments, HnCommentItem } from "./hn";

describe("Hacker News 'Who is hiring' Adapter", () => {
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 25 * 86400000).toISOString(); // 25 days ago

  const mockComments: HnCommentItem[] = [
    // 1. Remote Fresher-friendly
    {
      id: 1001,
      created_at: nowIso,
      text: `<p>Acme Labs | Junior Fullstack Engineer | Remote | REMOTE</p>
<p>We are looking for motivated junior developers (0-1 yrs exp). TypeScript and Next.js.</p>
<p>Email us at: jobs@acmelabs.com or visit https://acmelabs.com/careers/junior</p>`,
    },
    // 2. Remote Senior
    {
      id: 1002,
      created_at: nowIso,
      text: `<p>BigCorp | Senior Staff Architect | Remote | REMOTE</p>
<p>Must have 10+ years of distributed systems experience. Contact: hr@bigcorp.com</p>`,
    },
    // 3. On-site only (no remote)
    {
      id: 1003,
      created_at: nowIso,
      text: `<p>NYC Studio | Junior Frontend Dev | New York, NY</p>
<p>On-site role in Manhattan 5 days a week. Apply at careers@nycstudio.com</p>`,
    },
    // 4. Non-English (mentions remote)
    {
      id: 1004,
      created_at: nowIso,
      text: `<p>BerlinTech | Web Entwickler | Remote (Deutschland)</p>
<p>Wir suchen einen motivierten Junior Entwickler f&uuml;r unser Team. Kontakt: jobs@berlintech.de</p>`,
    },
    // 5. Stale (25 days old)
    {
      id: 1005,
      created_at: staleIso,
      text: `<p>OldStartup | Software Engineer | Remote</p>
<p>Remote friendly team hiring developers. Contact: founder@oldstartup.com</p>`,
    },
    // 6. Email-only (no web link)
    {
      id: 1006,
      created_at: nowIso,
      text: `<p>DirectHire | Backend Engineer | Remote</p>
<p>Work from anywhere. Please email your resume to talent@directhire.co and mention HN.</p>`,
    },
    // 7. Link-only (no email)
    {
      id: 1007,
      created_at: nowIso,
      text: `<p>LinkFirst | Fullstack Developer | Worldwide Remote</p>
<p>We build open source dev tools. Apply directly on our site: https://linkfirst.io/jobs/fullstack</p>`,
    },
    // 8. Malformed header (no pipe or dash)
    {
      id: 1008,
      created_at: nowIso,
      text: `<p>Hello world! Our small team is 100% remote and hiring software developers.</p>
<p>Check out our open roles at https://nomadteam.com/work-with-us or email hello@nomadteam.com</p>`,
    },
  ];

  it("parses 8 comments asserting correct parsing, email/url extraction, and filtering", () => {
    const jobs = parseHnComments("99999", mockComments);

    // 1 (c1: valid), 4 (c4: valid at adapter level), 6 (c6: valid), 7 (c7: valid), 8 (c8: valid)
    // 2 is skipped (senior title)
    // 3 is skipped (on-site only)
    // 5 is skipped (stale > 10 days)
    expect(jobs.length).toBe(5);

    // Assert Comment 1 (Fresher friendly with both email and URL)
    const c1 = jobs.find((j) => j.sourceId === "hn_1001");
    expect(c1).toBeDefined();
    expect(c1?.company).toBe("Acme Labs");
    expect(c1?.title).toBe("Junior Fullstack Engineer");
    expect(c1?.contactEmail).toBe("jobs@acmelabs.com");
    expect(c1?.applyUrl).toBe("https://acmelabs.com/careers/junior");
    expect(c1?.source).toBe("hn");

    // Assert Comment 2 is filtered out (Senior title)
    const c2 = jobs.find((j) => j.sourceId === "hn_1002");
    expect(c2).toBeUndefined();

    // Assert Comment 3 is filtered out (No remote mention)
    const c3 = jobs.find((j) => j.sourceId === "hn_1003");
    expect(c3).toBeUndefined();

    // Assert Comment 5 is filtered out (Stale > 10 days)
    const c5 = jobs.find((j) => j.sourceId === "hn_1005");
    expect(c5).toBeUndefined();

    // Assert Comment 6 (Email only, applyUrl defaults to HN item url)
    const c6 = jobs.find((j) => j.sourceId === "hn_1006");
    expect(c6).toBeDefined();
    expect(c6?.contactEmail).toBe("talent@directhire.co");
    expect(c6?.applyUrl).toBe("https://news.ycombinator.com/item?id=1006");

    // Assert Comment 7 (Link only, no email)
    const c7 = jobs.find((j) => j.sourceId === "hn_1007");
    expect(c7).toBeDefined();
    expect(c7?.contactEmail).toBeUndefined();
    expect(c7?.applyUrl).toBe("https://linkfirst.io/jobs/fullstack");

    // Assert Comment 8 (Malformed header, fallback title and company)
    const c8 = jobs.find((j) => j.sourceId === "hn_1008");
    expect(c8).toBeDefined();
    expect(c8?.company).toBe("Hacker News Startup");
    expect(c8?.title).toBe("Software Engineer (HN Who is Hiring)");
    expect(c8?.contactEmail).toBe("hello@nomadteam.com");
    expect(c8?.applyUrl).toBe("https://nomadteam.com/work-with-us");
  });
});
