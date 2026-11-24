import { z } from "zod";
import {
  LlmProvider,
  LlmCompletionOpts,
  DEFAULT_TRIAGE_MODEL,
  LLM_TIMEOUT_MS,
} from "./types";

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/gsk_[a-zA-Z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "[REDACTED]")
    .replace(/\b[a-zA-Z0-9_-]{32,}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export class GroqProvider implements LlmProvider {
  public lastError: string | null = null;
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
    this.lastError = null;

    if (!this.apiKey) {
      this.lastError = "no api key";
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

          let errorText = errBody;
          try {
            const parsed = JSON.parse(errBody);
            if (parsed?.error?.message) {
              errorText = parsed.error.message;
            } else if (parsed?.message) {
              errorText = parsed.message;
            }
          } catch {
            // Not JSON
          }

          const sanitized = sanitizeErrorMessage(errorText);
          this.lastError = sanitized ? `http ${res.status}: ${sanitized}` : `http ${res.status}`;
          return null;
        }

        const data = await res.json();
        const contentStr = data?.choices?.[0]?.message?.content;
        if (!contentStr) {
          this.lastError = "empty response";
          return null;
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(contentStr);
        } catch {
          this.lastError = "invalid json";
          return null;
        }

        const validated = schema.safeParse(parsedJson);
        if (!validated.success) {
          const firstIssue = validated.error.issues[0];
          const issuePath = firstIssue
            ? firstIssue.path.length > 0
              ? firstIssue.path.join(".")
              : firstIssue.message
            : "unknown";
          this.lastError = `schema: ${issuePath}`;
          return null;
        }

        this.lastError = null;
        return validated.data;
      } catch (err: unknown) {
        clearTimeout(timeout);
        const isTimeout =
          (err instanceof Error && err.name === "AbortError") ||
          controller.signal.aborted;
        this.lastError = isTimeout ? "timeout" : "network error";
        if (attempt === 1) {
          continue;
        }
        return null;
      }
    }

    if (!this.lastError) {
      this.lastError = "empty response";
    }
    return null;
  }
}
