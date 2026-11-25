import { z } from "zod";

// Helper to coerce and normalize skills field: array, comma-separated string, null, or undefined -> string[] capped at 12
const skillsSchema = z
  .union([
    z.array(z.unknown()),
    z.string(),
    z.null(),
    z.undefined(),
  ])
  .transform((val): string[] => {
    if (!val) return [];
    if (typeof val === "string") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
    }
    if (Array.isArray(val)) {
      return val
        .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
        .filter(Boolean)
        .slice(0, 12);
    }
    return [];
  });

// Helper to coerce minYears: number, numeric string, null, or undefined -> number | null
const minYearsSchema = z
  .union([
    z.number(),
    z.string(),
    z.null(),
    z.undefined(),
  ])
  .transform((val): number | null => {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return isNaN(val) ? null : val;
    const parsed = Number(val);
    return isNaN(parsed) ? null : parsed;
  });

// Helper for strings that can be null or string
const safeStringSchema = (maxLen: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((val): string => {
      if (val === null || val === undefined) return "";
      const s = String(val).trim();
      return s.length > maxLen ? s.slice(0, maxLen) : s;
    });

export const LlmTriageOutputSchema = z.object({
  expClass: z.enum(["fresher", "junior", "unclear", "senior"]),
  minYears: minYearsSchema.optional(),
  geo: z.enum(["worldwide", "india_ok", "restricted", "unclear"]),
  geoReason: safeStringSchema(120).optional().default(""),
  summaryLine: safeStringSchema(160).optional().default(""),
  skills: skillsSchema.optional().default([]),
});

export type LlmTriageOutput = z.infer<typeof LlmTriageOutputSchema>;

export interface LlmCompletionOpts {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  fallbackModels?: string[];
}

export interface LlmProvider {
  lastError?: string | null;
  completeJson<T>(opts: LlmCompletionOpts, schema: z.ZodType<T>): Promise<T | null>;
}

export const DEFAULT_TRIAGE_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_OUTREACH_MODEL = "openai/gpt-oss-120b";

export const TRIAGE_MODEL_FALLBACKS: readonly string[] = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
];

export const OUTREACH_MODEL_FALLBACKS: readonly string[] = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
];

export function getTriageModel(): string {
  const envModel = process.env.GROQ_TRIAGE_MODEL?.trim();
  return envModel || DEFAULT_TRIAGE_MODEL;
}

export function getOutreachModel(): string {
  const envModel = process.env.GROQ_OUTREACH_MODEL?.trim();
  return envModel || DEFAULT_OUTREACH_MODEL;
}

export const LLM_TIMEOUT_MS = 15000;
export const MAX_LLM_CALLS_PER_RUN = 150;
