import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { GroqProvider, extractJsonBlock } from "./groq";
import {
  DEFAULT_TRIAGE_MODEL,
  DEFAULT_OUTREACH_MODEL,
  getTriageModel,
  getOutreachModel,
} from "./types";

const SampleSchema = z.object({
  greeting: z.string(),
  count: z.number(),
});

describe("GroqProvider (src/lib/llm/groq.ts)", () => {
  beforeEach(() => {
    GroqProvider.rememberedWorkingModels.clear();
  });
  it("sets lastError to 'no api key' when apiKey is empty", async () => {
    const provider = new GroqProvider("");
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toBe("no api key");
  });

  it("sets lastError to 'http 400: ...' on HTTP error and redacts keys/tokens", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          error: {
            message:
              "Failed request with key gsk_1234567890abcdef1234567890 and Bearer secret_token_xyz_123456789012345678901234567890",
          },
        }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toContain("http 400");
    expect(provider.lastError).toContain("[REDACTED]");
    expect(provider.lastError).not.toContain("gsk_1234567890abcdef1234567890");
    expect(provider.lastError!.length).toBeLessThanOrEqual(140);
  });

  it("sets lastError to 'empty response' when message content is missing", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toBe("empty response");
  });

  it("sets lastError to 'invalid json' when response is not valid JSON", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: "not valid json {{" } }] }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toBe("invalid json");
  });

  it("sets lastError to 'schema: <path>' when output violates schema", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ greeting: "hello" }) } }] }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toBe("schema: count");
  });

  it("sets lastError to 'timeout' when aborted", async () => {
    const fakeFetch = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toBe("timeout");
  });

  it("clears lastError on successful completion", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ greeting: "hi", count: 42 }) } }],
      }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    provider.lastError = "previous error";

    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toEqual({ greeting: "hi", count: 42 });
    expect(provider.lastError).toBeNull();
  });

  it("404 on the first model falls back to the second", async () => {
    const calledModels: string[] = [];
    const fakeFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const parsedBody = JSON.parse(init.body as string);
      calledModels.push(parsedBody.model);

      if (parsedBody.model === "openai/gpt-oss-120b") {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              error: { message: "The model openai/gpt-oss-120b does not exist" },
            }),
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ greeting: "from-fallback", count: 1 }) } }],
        }),
      } as unknown as Response;
    });

    const provider = new GroqProvider("mock-key", "openai/gpt-oss-120b", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "test" }] },
      SampleSchema
    );

    expect(result).toEqual({ greeting: "from-fallback", count: 1 });
    expect(calledModels).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.6-27b"]);
    expect(provider.lastError).toBeNull();
  });

  it("fallback is remembered for subsequent calls in process", async () => {
    const calledModels: string[] = [];
    const fakeFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const parsedBody = JSON.parse(init.body as string);
      calledModels.push(parsedBody.model);

      if (parsedBody.model === "openai/gpt-oss-120b") {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              error: { message: "The model openai/gpt-oss-120b does not exist" },
            }),
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ greeting: "ok", count: 2 }) } }],
        }),
      } as unknown as Response;
    });

    const provider = new GroqProvider("mock-key", "openai/gpt-oss-120b", fakeFetch as unknown as typeof fetch);

    // First call: triggers fallback from 120b to qwen
    const res1 = await provider.completeJson(
      { messages: [{ role: "user", content: "first" }] },
      SampleSchema
    );
    expect(res1).toEqual({ greeting: "ok", count: 2 });
    expect(calledModels).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.6-27b"]);

    // Second call: directly uses remembered working model (qwen/qwen3.6-27b)
    calledModels.length = 0;
    const res2 = await provider.completeJson(
      { messages: [{ role: "user", content: "second" }] },
      SampleSchema
    );
    expect(res2).toEqual({ greeting: "ok", count: 2 });
    expect(calledModels).toEqual(["qwen/qwen3.6-27b"]);
  });

  it("env override wins for triage and outreach models", () => {
    const origTriage = process.env.GROQ_TRIAGE_MODEL;
    const origOutreach = process.env.GROQ_OUTREACH_MODEL;

    try {
      delete process.env.GROQ_TRIAGE_MODEL;
      delete process.env.GROQ_OUTREACH_MODEL;
      expect(getTriageModel()).toBe(DEFAULT_TRIAGE_MODEL);
      expect(getOutreachModel()).toBe(DEFAULT_OUTREACH_MODEL);

      process.env.GROQ_TRIAGE_MODEL = "custom/triage-model-override";
      process.env.GROQ_OUTREACH_MODEL = "custom/outreach-model-override";
      expect(getTriageModel()).toBe("custom/triage-model-override");
      expect(getOutreachModel()).toBe("custom/outreach-model-override");

      process.env.GROQ_TRIAGE_MODEL = "   ";
      process.env.GROQ_OUTREACH_MODEL = "";
      expect(getTriageModel()).toBe(DEFAULT_TRIAGE_MODEL);
      expect(getOutreachModel()).toBe(DEFAULT_OUTREACH_MODEL);
    } finally {
      process.env.GROQ_TRIAGE_MODEL = origTriage;
      process.env.GROQ_OUTREACH_MODEL = origOutreach;
    }
  });

  it("extraction of JSON from surrounding text parses valid block", async () => {
    const rawContent = `Here is your requested structured output:
\`\`\`json
{
  "greeting": "extracted-hello",
  "count": 99
}
\`\`\`
Hope this answers your inquiry!`;

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: rawContent } }],
      }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "test-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      { messages: [{ role: "user", content: "hi" }] },
      SampleSchema
    );

    expect(result).toEqual({ greeting: "extracted-hello", count: 99 });
    expect(provider.lastError).toBeNull();
  });

  it("extractJsonBlock helper handles nested objects and escaped characters", () => {
    expect(extractJsonBlock("Nothing here")).toBeNull();
    expect(extractJsonBlock('prefix {"a": {"b": 1}} postfix')).toBe('{"a": {"b": 1}}');
    expect(extractJsonBlock('text {"message": "a } b { c"} end')).toBe('{"message": "a } b { c"}');
  });

  it("no key or full body ever appears in lastError", async () => {
    const sensitiveKey = "gsk_supersecretkey1234567890abcdef";
    const longPayload = "very-long-error-details-".repeat(30);

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          error: {
            message: `The model deprecated-model does not exist or you do not have access to it with key ${sensitiveKey} and data ${longPayload}`,
          },
        }),
    } as unknown as Response);

    const provider = new GroqProvider("mock-key", "deprecated-model", fakeFetch as unknown as typeof fetch);
    const result = await provider.completeJson(
      {
        model: "deprecated-model",
        fallbackModels: ["deprecated-model"],
        messages: [{ role: "user", content: "hi" }],
      },
      SampleSchema
    );

    expect(result).toBeNull();
    expect(provider.lastError).toContain("deprecated-model");
    expect(provider.lastError).toContain("does not exist");
    expect(provider.lastError).not.toContain(sensitiveKey);
    expect(provider.lastError).toContain("[REDACTED]");
    expect(provider.lastError!.length).toBeLessThanOrEqual(140);
  });
});
