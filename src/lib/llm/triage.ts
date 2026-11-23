import { NormalizedJob } from "../jobs/types";
import { calculateJobAgeDays } from "../jobs/freshness";
import { detectLanguage } from "../jobs/language";
import { MAX_AGE_DAYS_DEFAULT, NON_ENGINEERING_TITLE_WORDS } from "../../config/job-profile";
import {
  ClassifyExperienceResult,
  ClassifyGeoResult,
  scoreMatch,
  ScoreMatchResult,
} from "../jobs/classify";
import {
  LlmProvider,
  LlmTriageOutput,
  LlmTriageOutputSchema,
  MAX_LLM_CALLS_PER_RUN,
} from "./types";

/**
 * Computes a simple deterministic 32-bit FNV-1a hash of a string.
 */
export function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export interface ExistingJobTriageData {
  triagedAt?: string | null;
  descriptionHash?: string | null;
}

export interface TriagedJobResult {
  expClass: "fresher" | "junior" | "unclear" | "senior";
  expMinYears: number | null;
  geoEligibility: "worldwide" | "india_ok" | "restricted" | "unclear";
  geoReason: string;
  summaryLine: string;
  skills: string[];
  filterReason?: string;
  matchScore: number;
  triagedAt?: string | null;
  descriptionHash?: string;
  llmSkipped?: "already" | "irrelevant" | "stale";
}

/**
 * Triages an ambiguous job with LLM if expClass or geo is 'unclear'.
 * Invariant: Rules override! LLM may NOT upgrade a rule-detected 'senior' or 'restricted'.
 */
export async function triageJobWithLlm(
  job: NormalizedJob,
  ruleExp: ClassifyExperienceResult,
  ruleGeo: ClassifyGeoResult,
  ruleScore: ScoreMatchResult,
  provider: LlmProvider,
  llmCallsMade: { count: number },
  existingData?: ExistingJobTriageData | null
): Promise<TriagedJobResult> {
  let expClass = ruleExp.expClass;
  let expMinYears = ruleExp.minYears;
  let geoEligibility = ruleGeo.geo;
  let geoReason = ruleGeo.reason;
  let summaryLine = job.title;
  let skills = ruleScore.matchedSkills;

  const currentDescHash = hashString(job.description || "");
  let triagedAt = existingData?.triagedAt || null;
  let llmSkipped: "already" | "irrelevant" | "stale" | undefined;

  // 1. Age check: skip LLM triage if older than 10 days
  const jobAge = calculateJobAgeDays(job.postedAt);
  const isStale = jobAge > 10;

  // 2. Language check: if non-English, skip LLM and place in hidden with reason
  const langResult = detectLanguage(job.title, job.description);
  const isNonEnglish = langResult.language !== "English";

  // 3. Skip already triaged jobs if description hash is unchanged
  const alreadyTriaged =
    Boolean(existingData?.triagedAt) &&
    existingData?.descriptionHash === currentDescHash;

  // 4. Skip non-engineering roles or already restricted/senior roles
  const titleLower = job.title.toLowerCase();
  const isNonEngineering = NON_ENGINEERING_TITLE_WORDS.some((word) => {
    const reg = new RegExp(`\\b${word}\\b`, "i");
    return reg.test(titleLower);
  });
  const isAlreadyFiltered =
    ruleExp.expClass === "senior" || ruleGeo.geo === "restricted";

  if (ruleExp.expClass === "unclear" || ruleGeo.geo === "unclear") {
    if (alreadyTriaged) {
      llmSkipped = "already";
    } else if (isNonEngineering || isAlreadyFiltered) {
      llmSkipped = "irrelevant";
    } else if (isStale) {
      llmSkipped = "stale";
    }
  }

  const needsLlm =
    !isNonEnglish &&
    !alreadyTriaged &&
    !isNonEngineering &&
    !isAlreadyFiltered &&
    !isStale &&
    (ruleExp.expClass === "unclear" || ruleGeo.geo === "unclear") &&
    llmCallsMade.count < MAX_LLM_CALLS_PER_RUN;

  if (needsLlm) {
    llmCallsMade.count++;
    triagedAt = new Date().toISOString();

    const systemPrompt = `You are a technical job triage assistant for a software engineer.
Candidate profile: Fresher, BS Computer Science 2026, based in India (IST). Target: Remote SWE, Full Stack, Backend, AI / LLM Engineer (0-1 yrs exp only).
Given a job posting, output valid JSON matching the exact schema:
{
  "expClass": "fresher" | "junior" | "unclear" | "senior",
  "minYears": number | null,
  "geo": "worldwide" | "india_ok" | "restricted" | "unclear",
  "geoReason": "Short reason for geo classification (max 120 chars)",
  "summaryLine": "1-line crisp overview of tech stack & role (max 160 chars)",
  "skills": ["Array", "of", "up", "to", "8", "matched", "skills"]
}`;

    const userPrompt = `Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location} (Remote Scope: ${job.remoteScope})
Description Snippet:
${job.description.slice(0, 1500)}`;

    const llmResult = await provider.completeJson<LlmTriageOutput>(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        maxTokens: 300,
      },
      LlmTriageOutputSchema
    );

    if (llmResult) {
      // Rule override enforcement:
      // If rule already found senior or restricted, LLM CANNOT downgrade or override it!
      if (ruleExp.expClass !== "senior") {
        expClass = llmResult.expClass;
        expMinYears = llmResult.minYears ?? expMinYears;
      }
      if (ruleGeo.geo !== "restricted") {
        geoEligibility = llmResult.geo;
        geoReason = llmResult.geoReason || geoReason;
      }
      if (llmResult.summaryLine) {
        summaryLine = llmResult.summaryLine.slice(0, 160);
      }
      if (Array.isArray(llmResult.skills) && llmResult.skills.length > 0) {
        skills = llmResult.skills.slice(0, 8);
      }
    }
  } else {
    // If not triaged by LLM, mark triagedAt so subsequent runs recognize it has been processed
    triagedAt = triagedAt || new Date().toISOString();
  }

  // Recalculate match score with refined attributes
  const finalScoreResult = scoreMatch({
    title: job.title,
    description: job.description,
    tags: job.tags,
    expClass,
    geoEligibility,
  });

  // Determine filter reason if excluded from shortlist
  let filterReason: string | undefined;
  if (isNonEnglish) {
    filterReason = `description not in English (${langResult.language})`;
  } else if (isNonEngineering) {
    filterReason = "Non-engineering role";
  } else if (jobAge > MAX_AGE_DAYS_DEFAULT) {
    filterReason = `posted ${jobAge} days ago`;
  } else if (expClass === "senior") {
    filterReason = ruleExp.reason || "Senior experience required";
  } else if (geoEligibility === "restricted") {
    filterReason = geoReason || "Geographically restricted";
  } else if (geoEligibility === "unclear") {
    filterReason = "location not remote / not confirmed for India";
  } else if (finalScoreResult.score < 25) {
    filterReason = "Low relevance score";
  }

  return {
    expClass,
    expMinYears,
    geoEligibility,
    geoReason,
    summaryLine,
    skills,
    filterReason,
    matchScore: finalScoreResult.score,
    triagedAt,
    descriptionHash: currentDescHash,
    llmSkipped,
  };
}
