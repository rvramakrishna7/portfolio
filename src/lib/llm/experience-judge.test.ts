import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmProvider } from "./types";
import { experienceFilterReason, judgeExperience } from "./experience-judge";

function fakeProvider(reply: unknown): LlmProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async completeJson<T>(opts: { messages: Array<{ content: string }> }, schema: z.ZodType<T>) {
      prompts.push(opts.messages.map((m) => m.content).join("\n"));
      if (reply === null) return null;
      return schema.parse(reply);
    },
  };
}

describe("judgeExperience", () => {
  it("returns the verdict and sends the description in an untrusted block", async () => {
    const p = fakeProvider({ forFresher: "no", minYears: "3", reason: "Needs 3+ years of Java" });
    const v = await judgeExperience({ title: "Java Dev", company: "NiCE", description: "2+ - 5 years of Java" }, p);
    expect(v).toEqual({ forFresher: "no", minYears: 3, reason: "Needs 3+ years of Java" });
    expect(p.prompts[0]).toContain("<UNTRUSTED_JOB_DATA>");
    expect(p.prompts[0]).toContain("2+ - 5 years of Java");
  });

  it("returns null when the LLM fails, so the caller keeps its own result", async () => {
    expect(await judgeExperience({ title: "x", description: "y" }, fakeProvider(null))).toBeNull();
  });

  it("builds a readable filter reason", () => {
    expect(experienceFilterReason({ forFresher: "no", minYears: 4, reason: "" })).toBe("Experience too high (AI): 4+ years");
    expect(experienceFilterReason({ forFresher: "no", minYears: null, reason: "Senior role" })).toBe("Experience too high (AI): Senior role");
  });
});
