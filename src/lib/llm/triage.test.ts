import { describe, it, expect } from "vitest";
import { z } from "zod";
import { triageJobWithLlm } from "./triage";
import { LlmProvider, LlmCompletionOpts } from "./types";
import { NormalizedJob } from "../jobs/types";
import {
  classifyExperience,
  classifyGeo,
  scoreMatch,
} from "../jobs/classify";

class FakeLlmProvider implements LlmProvider {
  public callCount = 0;
  public mockResponse: unknown = null;
  public returnInvalidJson = false;
  public simulate429 = false;

  async completeJson<T>(
    opts: LlmCompletionOpts,
    schema: z.ZodType<T>
  ): Promise<T | null> {
    this.callCount++;

    if (this.simulate429) {
      return null;
    }

    if (this.returnInvalidJson) {
      return null;
    }

    const validated = schema.safeParse(this.mockResponse);
    if (!validated.success) {
      return null;
    }

    return validated.data;
  }
}

describe("LLM Triage & Guardrails", () => {
  const baseJob: NormalizedJob = {
    source: "remoteok",
    sourceId: "999",
    url: "https://example.com/job/999",
    title: "Software Engineer",
    company: "Stealth Startup",
    location: "Remote",
    remoteScope: "Remote",
    description: "Developing modern cloud services using TypeScript and Node.",
    postedAt: "2026-11-20T10:00:00Z",
    tags: ["typescript", "node"],
  };

  it("applies valid LLM result when rule classification is unclear", async () => {
    const fake = new FakeLlmProvider();
    fake.mockResponse = {
      expClass: "junior",
      minYears: 1,
      geo: "worldwide",
      geoReason: "Job mentions anywhere globally",
      summaryLine: "Full stack developer role working with TypeScript/Node",
      skills: ["TypeScript", "Node.js", "Docker"],
    };

    const ruleExp = classifyExperience(baseJob.title, baseJob.description);
    const ruleGeo = classifyGeo(baseJob.title, baseJob.location, baseJob.remoteScope, baseJob.description);
    const ruleScore = scoreMatch({
      title: baseJob.title,
      description: baseJob.description,
      tags: baseJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    const callsMade = { count: 0 };
    const result = await triageJobWithLlm(
      baseJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade
    );

    expect(fake.callCount).toBe(1);
    expect(result.expClass).toBe("junior");
    expect(result.geoEligibility).toBe("worldwide");
    expect(result.skills).toContain("TypeScript");
    expect(result.matchScore).toBeGreaterThan(40);
  });

  it("ignores invalid JSON and retains rule result", async () => {
    const fake = new FakeLlmProvider();
    fake.returnInvalidJson = true;

    const ruleExp = classifyExperience(baseJob.title, baseJob.description);
    const ruleGeo = classifyGeo(baseJob.title, baseJob.location, baseJob.remoteScope, baseJob.description);
    const ruleScore = scoreMatch({
      title: baseJob.title,
      description: baseJob.description,
      tags: baseJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    const callsMade = { count: 0 };
    const result = await triageJobWithLlm(
      baseJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade
    );

    expect(fake.callCount).toBe(1);
    expect(result.expClass).toBe("unclear");
    expect(result.geoEligibility).toBe("unclear");
  });

  it("respects rule override: LLM cannot upgrade a rule-detected senior", async () => {
    const seniorJob: NormalizedJob = {
      ...baseJob,
      title: "Senior Lead Architect",
      description: "Must have 8+ years experience.",
    };

    const fake = new FakeLlmProvider();
    // LLM maliciously attempts to downgrade to fresher
    fake.mockResponse = {
      expClass: "fresher",
      minYears: 0,
      geo: "worldwide",
      geoReason: "Open worldwide",
      summaryLine: "Great junior role",
      skills: ["TypeScript"],
    };

    const ruleExp = classifyExperience(seniorJob.title, seniorJob.description);
    const ruleGeo = classifyGeo(seniorJob.title, seniorJob.location, seniorJob.remoteScope, seniorJob.description);
    const ruleScore = scoreMatch({
      title: seniorJob.title,
      description: seniorJob.description,
      tags: seniorJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    expect(ruleExp.expClass).toBe("senior");

    const callsMade = { count: 0 };
    const result = await triageJobWithLlm(
      seniorJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade
    );

    // Because rule was senior, rule overrides and expClass stays senior!
    expect(result.expClass).toBe("senior");
    expect(result.filterReason).toBeDefined();
  });

  it("respects daily budget cap (max 150 calls)", async () => {
    const fake = new FakeLlmProvider();
    const ruleExp = classifyExperience(baseJob.title, baseJob.description);
    const ruleGeo = classifyGeo(baseJob.title, baseJob.location, baseJob.remoteScope, baseJob.description);
    const ruleScore = scoreMatch({
      title: baseJob.title,
      description: baseJob.description,
      tags: baseJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    const callsMade = { count: 150 }; // At limit
    const result = await triageJobWithLlm(
      baseJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade
    );

    expect(fake.callCount).toBe(0); // Did not make call
    expect(result.expClass).toBe("unclear");
  });

  it("skips LLM when job was already triaged and description hash is unchanged", async () => {
    const fake = new FakeLlmProvider();
    fake.mockResponse = {
      expClass: "junior",
      minYears: 1,
      geo: "worldwide",
      geoReason: "Open worldwide",
      summaryLine: "Role summary",
      skills: ["TypeScript"],
    };

    const ruleExp = classifyExperience(baseJob.title, baseJob.description);
    const ruleGeo = classifyGeo(baseJob.title, baseJob.location, baseJob.remoteScope, baseJob.description);
    const ruleScore = scoreMatch({
      title: baseJob.title,
      description: baseJob.description,
      tags: baseJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    // First triage (not yet triaged)
    const callsMade1 = { count: 0 };
    const result1 = await triageJobWithLlm(
      baseJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade1
    );

    expect(fake.callCount).toBe(1);
    expect(result1.descriptionHash).toBeDefined();
    expect(result1.triagedAt).toBeDefined();

    // Re-run with existingData containing same descriptionHash and triagedAt
    const callsMade2 = { count: 0 };
    const result2 = await triageJobWithLlm(
      baseJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade2,
      {
        triagedAt: result1.triagedAt,
        descriptionHash: result1.descriptionHash,
      }
    );

    // Call count on fake provider remains 1 (no new LLM call made!)
    expect(fake.callCount).toBe(1);
    expect(result2.llmSkipped).toBe("already");
  });

  it("skips LLM and marks filtered for non-engineering titles", async () => {
    const nonEngTitles = [
      "Sales Representative",
      "VP of Marketing",
      "Technical Recruiter",
      "Talent Acquisition Lead",
      "Customer Success Specialist",
      "Account Executive",
      "Legal Counsel",
    ];

    for (const title of nonEngTitles) {
      const fake = new FakeLlmProvider();
      const job: NormalizedJob = {
        ...baseJob,
        title,
      };

      const ruleExp = classifyExperience(job.title, job.description);
      const ruleGeo = classifyGeo(job.title, job.location, job.remoteScope, job.description);
      const ruleScore = scoreMatch({
        title: job.title,
        description: job.description,
        tags: job.tags,
        expClass: ruleExp.expClass,
        geoEligibility: ruleGeo.geo,
      });

      const callsMade = { count: 0 };
      const result = await triageJobWithLlm(
        job,
        ruleExp,
        ruleGeo,
        ruleScore,
        fake,
        callsMade
      );

      expect(fake.callCount).toBe(0);
      expect(result.llmSkipped).toBe("irrelevant");
      expect(result.filterReason).toBe("Non-engineering role");
    }
  });

  it("skips LLM when rule indicates senior or restricted", async () => {
    const fake = new FakeLlmProvider();

    // Restricted geo job
    const restrictedJob: NormalizedJob = {
      ...baseJob,
      location: "USA Only",
      description: "Must be US citizen residing in North America.",
    };

    const ruleExp = classifyExperience(restrictedJob.title, restrictedJob.description);
    const ruleGeo = classifyGeo(restrictedJob.title, restrictedJob.location, restrictedJob.remoteScope, restrictedJob.description);
    const ruleScore = scoreMatch({
      title: restrictedJob.title,
      description: restrictedJob.description,
      tags: restrictedJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    expect(ruleGeo.geo).toBe("restricted");

    const callsMade = { count: 0 };
    const result = await triageJobWithLlm(
      restrictedJob,
      ruleExp,
      ruleGeo,
      ruleScore,
      fake,
      callsMade
    );

    expect(fake.callCount).toBe(0);
    expect(result.llmSkipped).toBe("irrelevant");
    expect(result.geoEligibility).toBe("restricted");
  });

  describe("STEP 4: Tolerant triage schema coercion", () => {
    it("accepts skills as comma-separated string, array of strings, null, or undefined and caps at 12", async () => {
      const { LlmTriageOutputSchema } = await import("./types");
      // 1. comma-separated string
      const r1 = LlmTriageOutputSchema.parse({
        expClass: "junior",
        minYears: 2,
        geo: "worldwide",
        geoReason: "Anywhere",
        summaryLine: "Summary",
        skills: "react, node, typescript, docker, postgres, k8s, helm, groq, express, vite, vitest, next, extra1, extra2",
      });
      expect(Array.isArray(r1.skills)).toBe(true);
      expect(r1.skills).toHaveLength(12);
      expect(r1.skills[0]).toBe("react");

      // 2. null skills
      const r2 = LlmTriageOutputSchema.parse({
        expClass: "junior",
        minYears: null,
        geo: "worldwide",
        geoReason: "Anywhere",
        summaryLine: "Summary",
        skills: null,
      });
      expect(r2.skills).toEqual([]);

      // 3. undefined skills
      const r3 = LlmTriageOutputSchema.parse({
        expClass: "fresher",
        minYears: undefined,
        geo: "india_ok",
        geoReason: "India allowed",
        summaryLine: "Summary",
      });
      expect(r3.skills).toEqual([]);
    });

    it("coerces minYears safely from strings, numbers, and null", async () => {
      const { LlmTriageOutputSchema } = await import("./types");
      const r1 = LlmTriageOutputSchema.parse({
        expClass: "junior",
        minYears: "3",
        geo: "worldwide",
        geoReason: "Anywhere",
        summaryLine: "Summary",
        skills: ["react"],
      });
      expect(r1.minYears).toBe(3);

      const r2 = LlmTriageOutputSchema.parse({
        expClass: "junior",
        minYears: null,
        geo: "worldwide",
        geoReason: "Anywhere",
        summaryLine: "Summary",
        skills: ["react"],
      });
      expect(r2.minYears).toBeNull();
    });

    it("safely handles null or numbers where strings are expected for geoReason and summaryLine", async () => {
      const { LlmTriageOutputSchema } = await import("./types");
      const r = LlmTriageOutputSchema.parse({
        expClass: "junior",
        minYears: null,
        geo: "worldwide",
        geoReason: null,
        summaryLine: null,
        skills: [],
      });
      expect(r.geoReason).toBe("");
      expect(r.summaryLine).toBe("");
    });
  });
});
