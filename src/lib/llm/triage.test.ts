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
    const ruleGeo = classifyGeo(baseJob.location, baseJob.remoteScope, baseJob.description);
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
    const ruleGeo = classifyGeo(baseJob.location, baseJob.remoteScope, baseJob.description);
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
    const ruleGeo = classifyGeo(seniorJob.location, seniorJob.remoteScope, seniorJob.description);
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
    const ruleGeo = classifyGeo(baseJob.location, baseJob.remoteScope, baseJob.description);
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
});
