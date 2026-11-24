import { z } from "zod";

export const LlmTriageOutputSchema = z.object({
  expClass: z.enum(["fresher", "junior", "unclear", "senior"]),
  minYears: z.number().nullable(),
  geo: z.enum(["worldwide", "india_ok", "restricted", "unclear"]),
  geoReason: z.string().max(120),
  summaryLine: z.string().max(160),
  skills: z.array(z.string()).max(8),
});

export type LlmTriageOutput = z.infer<typeof LlmTriageOutputSchema>;

export interface LlmCompletionOpts {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LlmProvider {
  lastError?: string | null;
  completeJson<T>(opts: LlmCompletionOpts, schema: z.ZodType<T>): Promise<T | null>;
}

export const DEFAULT_TRIAGE_MODEL = "llama-3.1-8b-instant";
export const LLM_TIMEOUT_MS = 15000;
export const MAX_LLM_CALLS_PER_RUN = 150;
