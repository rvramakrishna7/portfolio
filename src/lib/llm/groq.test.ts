import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { GroqProvider } from "./groq";

const SampleSchema = z.object({
  greeting: z.string(),
  count: z.number(),
});

describe("GroqProvider (src/lib/llm/groq.ts)", () => {
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
});
