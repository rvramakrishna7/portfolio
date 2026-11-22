import { z } from "zod";
import {
  LlmProvider,
  LlmCompletionOpts,
  DEFAULT_TRIAGE_MODEL,
  LLM_TIMEOUT_MS,
} from "./types";

export class GroqProvider implements LlmProvider {
  private apiKey: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(
    apiKey = process.env.GROQ_API_KEY || "",
    defaultModel = DEFAULT_TRIAGE_MODEL,
    fetchFn: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.fetchFn = fetchFn;
  }

  async completeJson<T>(
    opts: LlmCompletionOpts,
    schema: z.ZodType<T>
  ): Promise<T | null> {
    if (!this.apiKey) {
      return null;
    }

    const model = opts.model || this.defaultModel;
    const url = "https://api.groq.com/openai/v1/chat/completions";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      try {
        const res = await this.fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: opts.messages,
            temperature: opts.temperature ?? 0,
            max_tokens: opts.maxTokens ?? 300,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 429 && attempt === 1) {
          // Retry once on 429 honoring retry-after header (up to max 20 s)
          const retryAfterSec = parseInt(
            res.headers.get("retry-after") || "2",
            10
          );
          const waitTimeMs = Math.min(20000, Math.max(1000, (isNaN(retryAfterSec) ? 2 : retryAfterSec) * 1000));
          await new Promise((r) => setTimeout(r, waitTimeMs));
          continue;
        }

        if (!res.ok) {
          // Check for quota or rate exhaustion
          const errBody = await res.text().catch(() => "");
          if (
            res.status === 429 ||
            errBody.includes("rate_limit_exceeded") ||
            errBody.includes("tokens_per_day") ||
            errBody.includes("requests_per_day")
          ) {
            console.warn("Groq rate/quota limit reached. Discontinuing LLM triage for this run.");
          }
          return null;
        }

        const data = await res.json();
        const contentStr = data?.choices?.[0]?.message?.content;
        if (!contentStr) {
          return null;
        }

        const parsedJson = JSON.parse(contentStr);
        const validated = schema.safeParse(parsedJson);
        if (!validated.success) {
          return null;
        }

        return validated.data;
      } catch {
        clearTimeout(timeout);
        if (attempt === 1) {
          continue;
        }
        return null;
      }
    }

    return null;
  }
}
