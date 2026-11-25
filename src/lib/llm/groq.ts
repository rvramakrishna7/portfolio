import { z } from "zod";
import {
  LlmProvider,
  LlmCompletionOpts,
  TRIAGE_MODEL_FALLBACKS,
  OUTREACH_MODEL_FALLBACKS,
  getTriageModel,
  getOutreachModel,
  LLM_TIMEOUT_MS,
} from "./types";

export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/gsk_[a-zA-Z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "[REDACTED]")
    .replace(/\b[a-zA-Z0-9_-]{32,}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Extracts the first balanced JSON object {...} block from arbitrary surrounding text.
 */
export function extractJsonBlock(text: string): string | null {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }

  return null;
}

export class GroqProvider implements LlmProvider {
  public static rememberedWorkingModels: Map<string, string> = new Map();
  public lastError: string | null = null;
  private apiKey: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(
    apiKey = process.env.GROQ_API_KEY || "",
    defaultModel = getTriageModel(),
    fetchFn: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.fetchFn = fetchFn;
  }

  private async callModelEndpoint<T>(
    model: string,
    opts: LlmCompletionOpts,
    schema: z.ZodType<T>
  ): Promise<
    | { kind: "ok"; data: T }
    | { kind: "decommissioned"; status: number; message: string }
    | { kind: "error"; message: string }
  > {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const isReasoning = /gpt-oss|qwen/i.test(model);
    const maxTokensRequested = opts.maxTokens ?? 300;
    // Reasoning models need headroom for chain-of-thought tokens so they do not exhaust completion budget
    const maxCompletionTokens = isReasoning
      ? maxTokensRequested + (maxTokensRequested > 500 ? 1000 : 700)
      : maxTokensRequested;

    const requestBody: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_completion_tokens: maxCompletionTokens,
      response_format: { type: "json_object" },
    };

    if (isReasoning) {
      requestBody.reasoning_effort = "low";
    }

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
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 429 && attempt === 1) {
          const retryAfterSec = parseInt(res.headers.get("retry-after") || "2", 10);
          const waitTimeMs = Math.min(
            20000,
            Math.max(1000, (isNaN(retryAfterSec) ? 2 : retryAfterSec) * 1000)
          );
          await new Promise((r) => setTimeout(r, waitTimeMs));
          continue;
        }

        if (!res.ok) {
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
          const isDecommissioned =
            res.status === 404 ||
            /model_decommissioned|does not exist/i.test(errorText);

          if (isDecommissioned) {
            return {
              kind: "decommissioned",
              status: res.status,
              message: sanitized ? `http ${res.status}: ${sanitized}` : `http ${res.status}`,
            };
          }

          return {
            kind: "error",
            message: sanitized ? `http ${res.status}: ${sanitized}` : `http ${res.status}`,
          };
        }

        const data = await res.json();
        const contentStr = data?.choices?.[0]?.message?.content;
        if (!contentStr) {
          return { kind: "error", message: "empty response" };
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(contentStr);
        } catch {
          const extracted = extractJsonBlock(contentStr);
          if (extracted) {
            try {
              parsedJson = JSON.parse(extracted);
            } catch {
              return { kind: "error", message: "invalid json" };
            }
          } else {
            return { kind: "error", message: "invalid json" };
          }
        }

        const validated = schema.safeParse(parsedJson);
        if (!validated.success) {
          const firstIssue = validated.error.issues[0];
          const issuePath = firstIssue
            ? firstIssue.path.length > 0
              ? firstIssue.path.join(".")
              : firstIssue.message
            : "unknown";
          return { kind: "error", message: `schema: ${issuePath}` };
        }

        return { kind: "ok", data: validated.data };
      } catch (err: unknown) {
        clearTimeout(timeout);
        const isTimeout =
          (err instanceof Error && err.name === "AbortError") || controller.signal.aborted;
        if (attempt === 1) {
          continue;
        }
        return { kind: "error", message: isTimeout ? "timeout" : "network error" };
      }
    }

    return { kind: "error", message: "empty response" };
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

    const requestedModel = opts.model || this.defaultModel;
    const initialModel =
      GroqProvider.rememberedWorkingModels.get(requestedModel) || requestedModel;

    let fallbackList: string[];
    if (opts.fallbackModels && opts.fallbackModels.length > 0) {
      fallbackList = [...opts.fallbackModels];
    } else if (
      requestedModel === getOutreachModel() ||
      requestedModel === "openai/gpt-oss-120b" ||
      OUTREACH_MODEL_FALLBACKS.includes(requestedModel)
    ) {
      fallbackList = Array.from(new Set([getOutreachModel(), ...OUTREACH_MODEL_FALLBACKS]));
    } else if (
      requestedModel === getTriageModel() ||
      requestedModel === "openai/gpt-oss-20b" ||
      TRIAGE_MODEL_FALLBACKS.includes(requestedModel)
    ) {
      fallbackList = Array.from(new Set([getTriageModel(), ...TRIAGE_MODEL_FALLBACKS]));
    } else {
      fallbackList = [requestedModel];
    }

    const candidates = Array.from(new Set([initialModel, ...fallbackList]));
    const primaryModel = candidates[0];

    const result = await this.callModelEndpoint(primaryModel, opts, schema);

    if (result.kind === "ok") {
      this.lastError = null;
      return result.data;
    }

    if (result.kind === "decommissioned") {
      this.lastError = result.message.includes(primaryModel)
        ? result.message
        : `${result.message} (model ${primaryModel} does not exist)`;

      const nextModel = candidates.find((m) => m !== primaryModel);
      if (nextModel) {
        // Try next fallback model once (no loop, max one extra call)
        const fallbackResult = await this.callModelEndpoint(nextModel, opts, schema);

        if (fallbackResult.kind === "ok") {
          // Remember working model for rest of process
          GroqProvider.rememberedWorkingModels.set(requestedModel, nextModel);
          GroqProvider.rememberedWorkingModels.set(primaryModel, nextModel);
          this.lastError = null;
          return fallbackResult.data;
        }

        // Fallback also failed
        const fallbackMsg =
          fallbackResult.kind === "decommissioned"
            ? fallbackResult.message
            : fallbackResult.message;
        this.lastError = `model ${primaryModel} does not exist; fallback ${nextModel} failed: ${fallbackMsg}`;
        return null;
      }

      return null;
    }

    this.lastError = result.message;
    return null;
  }
}
