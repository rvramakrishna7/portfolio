import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  generateApplicationAnswer,
  DailyAnswerLimitExceededError,
  validateApplicationAnswer,
  AnswerLlmOutput,
} from "./answer";
import { StoredJob, InMemoryJobsRepository } from "../jobs/repository";
import { LlmProvider, LlmCompletionOpts } from "../llm/types";

class MockAnswerLlmProvider implements LlmProvider {
  public lastError: string | null = null;
  public responses: AnswerLlmOutput[] = [];
  public callCount = 0;
  public capturedOptions: LlmCompletionOpts[] = [];

  constructor(responses: AnswerLlmOutput[] = [], lastError: string | null = null) {
    this.responses = responses;
    this.lastError = lastError;
  }

  async completeJson<T>(
    opts: LlmCompletionOpts,
    schema: z.ZodType<T>
  ): Promise<T | null> {
    this.capturedOptions.push(opts);
    const resp = this.responses[this.callCount++];
    if (!resp) return null;
    return schema.parse(resp) as T;
  }
}

function createSampleJob(overrides?: Partial<StoredJob>): StoredJob {
  return {
    id: "job-answer-1",
    source: "greenhouse",
    source_id: "gh-1",
    title: "Backend Platform Engineer",
    company: "Stripe",
    location: "Remote",
    remote_scope: null,
    url: "https://example.com/jobs/gh-1",
    description: "Build robust API infrastructure and high-throughput microservices. Requires Node.js and PostgreSQL.",
    skills: ["node.js", "postgresql"],
    posted_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    status: "shortlisted",
    exp_class: "junior",
    exp_min_years: null,
    geo_eligibility: "worldwide",
    geo_reason: null,
    filter_reason: null,
    summary_line: "Backend Platform Engineer",
    match_score: 85,
    raw: null,
    ...overrides,
  };
}

describe("Application Answer Generator (src/lib/outreach/answer.ts)", () => {
  it("validates word limits strictly between 70% and 100% of maxWords", () => {
    // maxWords = 100 -> min 70 words
    const shortText = Array(60).fill("word").join(" ");
    const okText = Array(80).fill("word").join(" ");
    const longText = Array(110).fill("word").join(" ");

    const shortErrors = validateApplicationAnswer(shortText, 100, "");
    expect(shortErrors.some((e) => e.includes("must be between 70 and 100 words"))).toBe(true);

    const okErrors = validateApplicationAnswer(okText, 100, "");
    expect(okErrors).toHaveLength(0);

    const longErrors = validateApplicationAnswer(longText, 100, "");
    expect(longErrors.some((e) => e.includes("must be between 70 and 100 words"))).toBe(true);
  });

  it("enforces numbers allow-list plus numbers present in job text", () => {
    // 1212 is in candidate profile, 9999 is in job text, 7777 is not in either
    const jobText = "We process 9999 requests per minute.";
    const validWithJobNum = Array(75).fill("word").join(" ") + " 1,212 and 9999.";
    expect(validateApplicationAnswer(validWithJobNum, 100, jobText)).toHaveLength(0);

    const invalidNum = Array(75).fill("word").join(" ") + " 7777.";
    const errors = validateApplicationAnswer(invalidNum, 100, jobText);
    expect(errors.some((e) => e.includes("Disallowed number \"7777\""))).toBe(true);
  });

  it("rejects banned phrases and normalizes dashes", async () => {
    const job = createSampleJob();
    const emDash = String.fromCharCode(8212);
    const answerWithDash = Array(75).fill("word").join(" ") + ` ${emDash} and 1,212 tests.`;

    const mockProvider = new MockAnswerLlmProvider([{ answer: answerWithDash }]);
    const draft = await generateApplicationAnswer({
      job,
      question: "Why this role?",
      provider: mockProvider,
    });

    expect(draft.kind).toBe("application_answer");
    expect(draft.body).not.toContain(emDash);
    expect(draft.body).toContain(" - ");
    expect(draft.question).toBe("Why this role?");
  });

  it("enforces daily budget of 20 answers", async () => {
    const repo = new InMemoryJobsRepository();
    const job = createSampleJob();

    // Create 20 existing answers today
    for (let i = 0; i < 20; i++) {
      await repo.createDrafts(job.id, [
        {
          kind: "application_answer",
          question: `Q ${i}`,
          body: "Answer body text",
        },
      ]);
    }

    const todayAnswers = await repo.countAnswersToday();
    expect(todayAnswers).toBe(20);

    const mockProvider = new MockAnswerLlmProvider([{ answer: Array(80).fill("word").join(" ") }]);
    await expect(
      generateApplicationAnswer({
        job,
        question: "Another question?",
        repo,
        provider: mockProvider,
      })
    ).rejects.toThrow(DailyAnswerLimitExceededError);
  });
});
