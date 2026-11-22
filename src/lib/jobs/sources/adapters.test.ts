import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseRemoteOkJobs } from "./remoteok";
import { parseJobicyJobs } from "./jobicy";
import { parseArbeitnowJobs } from "./arbeitnow";
import { parseWeWorkRemotelyRss } from "./weworkremotely";
import { parseGreenhouseJobs } from "./greenhouse";
import { parseLeverJobs } from "./lever";
import { parseAshbyJobs } from "./ashby";
import { stripHtml } from "../clean";

describe("Job Source Adapters (Fixtures)", () => {
  it("remoteok adapter skips legal notice and parses jobs cleanly", () => {
    const fixturePath = path.resolve(__dirname, "../__fixtures__/remoteok.json");
    const json = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const jobs = parseRemoteOkJobs(json);

    expect(jobs.length).toBe(2);
    expect(jobs[0].source).toBe("remoteok");
    expect(jobs[0].sourceId).toBe("1001");
    expect(jobs[0].title).toBe("Junior Backend Engineer");
    expect(jobs[0].company).toBe("Acme Cloud");
    expect(jobs[0].tags).toEqual(["backend", "typescript", "node", "postgresql"]);
    expect(jobs[0].description).not.toContain("<p>");
    expect(jobs[0].description).toContain("0-1 years of experience");
    expect(jobs[0].salaryText).toBe("$50,000 - $70,000");

    expect(jobs[1].sourceId).toBe("1002");
    expect(jobs[1].title).toBe("Senior Software Architect");
  });

  it("jobicy adapter parses nested jobs and strips HTML", () => {
    const fixturePath = path.resolve(__dirname, "../__fixtures__/jobicy.json");
    const json = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const jobs = parseJobicyJobs(json);

    expect(jobs.length).toBe(2);
    expect(jobs[0].source).toBe("jobicy");
    expect(jobs[0].sourceId).toBe("2001");
    expect(jobs[0].title).toContain("Full Stack Developer");
    expect(jobs[0].company).toBe("InnoTech Labs");
    expect(jobs[0].description).not.toContain("<div>");
    expect(jobs[0].description).toContain("React & TypeScript");
    expect(jobs[0].salaryText).toBe("USD 40000 - 60000");
  });

  it("arbeitnow adapter filters out non-remote jobs", () => {
    const fixturePath = path.resolve(__dirname, "../__fixtures__/arbeitnow.json");
    const json = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const jobs = parseArbeitnowJobs(json);

    expect(jobs.length).toBe(1);
    expect(jobs[0].source).toBe("arbeitnow");
    expect(jobs[0].sourceId).toBe("arbeitnow-ai-engineer-intern-3001");
    expect(jobs[0].title).toBe("AI Engineer (Junior / Intern)");
    expect(jobs[0].company).toBe("Cognitive AI");
    expect(jobs[0].tags).toContain("llm");
  });

  it("weworkremotely RSS parser splits company/title and handles CDATA", () => {
    const fixturePath = path.resolve(__dirname, "../__fixtures__/weworkremotely.xml");
    const xml = fs.readFileSync(fixturePath, "utf8");
    const jobs = parseWeWorkRemotelyRss(xml);

    expect(jobs.length).toBe(2);
    expect(jobs[0].source).toBe("weworkremotely");
    expect(jobs[0].company).toBe("Starlight Systems");
    expect(jobs[0].title).toBe("Junior Software Engineer");
    expect(jobs[0].description).toContain("1 year of professional experience");
    expect(jobs[0].description).not.toContain("<p>");
    expect(jobs[0].tags).toContain("typescript");

    expect(jobs[1].company).toBe("MegaCorp");
    expect(jobs[1].title).toBe("Staff Backend Engineer");
  });

  it("stripHtml cleanly decodes entities and truncates long text", () => {
    const sample = "<p>Hello &amp; welcome &lt;world&gt;! &quot;Quotes&quot; &#39;Apos&#39;</p>";
    const cleaned = stripHtml(sample);
    expect(cleaned).toBe('Hello & welcome <world>! "Quotes" \'Apos\'');

    const longHtml = "<p>" + "A".repeat(10000) + "</p>";
    const truncated = stripHtml(longHtml, 500);
    expect(truncated.length).toBe(500);
  });

  it("greenhouse adapter parses title, location, url, remoteScope, postedAt and skips senior", () => {
    const nowIso = new Date().toISOString();
    const mockData = {
      jobs: [
        {
          id: 5501,
          title: "Junior Backend Engineer",
          location: { name: "Remote, India" },
          updated_at: nowIso,
          absolute_url: "https://boards.greenhouse.io/gitlab/jobs/5501",
          content: "<p>We build Go and TypeScript services. Work from anywhere.</p>",
        },
        {
          id: 5502,
          title: "Senior Engineering Manager",
          location: { name: "Remote" },
          updated_at: nowIso,
          absolute_url: "https://boards.greenhouse.io/gitlab/jobs/5502",
          content: "<p>Lead 10+ engineers.</p>",
        },
      ],
    };

    const jobs = parseGreenhouseJobs(mockData, "gitlab");
    expect(jobs.length).toBe(1);
    expect(jobs[0].source).toBe("greenhouse");
    expect(jobs[0].sourceId).toBe("gitlab_5501");
    expect(jobs[0].title).toBe("Junior Backend Engineer");
    expect(jobs[0].company).toBe("Gitlab");
    expect(jobs[0].location).toBe("Remote, India");
    expect(jobs[0].remoteScope).toBe("Remote, India");
    expect(jobs[0].url).toBe("https://boards.greenhouse.io/gitlab/jobs/5501");
    expect(jobs[0].applyUrl).toBe("https://boards.greenhouse.io/gitlab/jobs/5501#app");
    expect(jobs[0].postedAt).toBe(new Date(nowIso).toISOString());
    expect(jobs[0].description).toBe("We build Go and TypeScript services. Work from anywhere.");
  });

  it("lever adapter parses title, location, url, remoteScope, postedAt and skips senior", () => {
    const nowTime = Date.now();
    const mockData = [
      {
        id: "lev-101",
        text: "Software Developer",
        createdAt: nowTime,
        hostedUrl: "https://jobs.lever.co/kinsta/lev-101",
        applyUrl: "https://jobs.lever.co/kinsta/lev-101/apply",
        categories: {
          commitment: "Full time",
          department: "Engineering",
          location: "Worldwide (Remote)",
        },
        descriptionPlain: "Build modern web apps with TypeScript and Node.",
      },
      {
        id: "lev-102",
        text: "Principal Architect",
        createdAt: nowTime,
        hostedUrl: "https://jobs.lever.co/kinsta/lev-102",
        categories: {
          location: "Remote",
        },
        descriptionPlain: "Lead architecture.",
      },
    ];

    const jobs = parseLeverJobs(mockData, "kinsta");
    expect(jobs.length).toBe(1);
    expect(jobs[0].source).toBe("lever");
    expect(jobs[0].sourceId).toBe("kinsta_lev-101");
    expect(jobs[0].title).toBe("Software Developer");
    expect(jobs[0].company).toBe("Kinsta");
    expect(jobs[0].location).toBe("Worldwide (Remote)");
    expect(jobs[0].remoteScope).toBe("Worldwide (Remote)");
    expect(jobs[0].url).toBe("https://jobs.lever.co/kinsta/lev-101");
    expect(jobs[0].applyUrl).toBe("https://jobs.lever.co/kinsta/lev-101/apply");
    expect(jobs[0].postedAt).toBe(new Date(nowTime).toISOString());
    expect(jobs[0].description).toBe("Build modern web apps with TypeScript and Node.");
  });

  it("ashby adapter parses title, location, url, remoteScope, postedAt and skips senior", () => {
    const nowIso = new Date().toISOString();
    const mockData = {
      jobs: [
        {
          id: "ash-201",
          title: "Frontend Engineer",
          department: "Product",
          location: "Remote, Global",
          publishedAt: nowIso,
          jobUrl: "https://jobs.ashbyhq.com/linear/ash-201",
          applyUrl: "https://jobs.ashbyhq.com/linear/ash-201/application",
          descriptionPlain: "Develop intuitive UI using React and TypeScript.",
        },
        {
          id: "ash-202",
          title: "Staff Infrastructure Engineer",
          publishedAt: nowIso,
          jobUrl: "https://jobs.ashbyhq.com/linear/ash-202",
          descriptionPlain: "Manage clusters.",
        },
      ],
    };

    const jobs = parseAshbyJobs(mockData, "linear");
    expect(jobs.length).toBe(1);
    expect(jobs[0].source).toBe("ashby");
    expect(jobs[0].sourceId).toBe("linear_ash-201");
    expect(jobs[0].title).toBe("Frontend Engineer");
    expect(jobs[0].company).toBe("Linear");
    expect(jobs[0].location).toBe("Remote, Global");
    expect(jobs[0].remoteScope).toBe("Remote, Global");
    expect(jobs[0].url).toBe("https://jobs.ashbyhq.com/linear/ash-201");
    expect(jobs[0].applyUrl).toBe("https://jobs.ashbyhq.com/linear/ash-201/application");
    expect(jobs[0].postedAt).toBe(new Date(nowIso).toISOString());
    expect(jobs[0].description).toBe("Develop intuitive UI using React and TypeScript.");
  });
});
