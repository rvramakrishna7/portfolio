import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseRemoteOkJobs } from "./remoteok";
import { parseJobicyJobs } from "./jobicy";
import { parseArbeitnowJobs } from "./arbeitnow";
import { parseWeWorkRemotelyRss } from "./weworkremotely";
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
});
