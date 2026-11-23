/**
 * Owner Profile Facts for Job Search Engine (J2)
 *
 * Configurable constants representing target profile, qualifications,
 * role titles, skill weights, and exclusion patterns.
 */

export interface SkillWeight {
  skill: string;
  weight: number;
}

export const MAX_AGE_DAYS_DEFAULT = 7;
export const ALLOWED_MAX_AGE_DAYS = [3, 7, 10] as const;
export type AllowedMaxAgeDays = (typeof ALLOWED_MAX_AGE_DAYS)[number];

export const NON_ENGINEERING_TITLE_WORDS = [
  "sales",
  "marketing",
  "recruiter",
  "recruiting",
  "talent acquisition",
  "clinician",
  "nurse",
  "physician",
  "counsel",
  "legal",
  "finance",
  "accountant",
  "accounting",
  "customer success",
  "support", // non-engineering
  "account executive",
  "business development",
] as const;

const SENIOR_OR_MANAGEMENT_REGEX =
  /\b(senior|lead|principal|staff|director|vp|vice president|manager|head of)\b/i;

export function isExcludedTitle(title: string): boolean {
  if (SENIOR_OR_MANAGEMENT_REGEX.test(title)) return true;
  const lower = title.toLowerCase();
  return NON_ENGINEERING_TITLE_WORDS.some((word) => {
    const reg = new RegExp(`\\b${word}\\b`, "i");
    return reg.test(lower);
  });
}

export const OWNER_PROFILE = {
  name: "Ramakrishna",
  roleStatus: "Fresher",
  education: "BS Computer Science BITS Pilani 2026",
  baseLocation: "India (IST)",
  desiredWorkMode: "REMOTE open to India or worldwide",
  minYearsExp: 0,
  maxYearsExp: 1,

  // Target roles (matched case-insensitively on job title)
  targetRoles: [
    "software engineer",
    "software developer",
    "full stack",
    "full-stack",
    "backend",
    "back-end",
    "frontend", // lower weight handled in scoring
    "ai engineer",
    "applied ai",
    "llm",
    "ml engineer", // junior only
    "automation engineer",
    "python developer",
    "node",
    "typescript",
    "javascript",
    "mcp",
    "integration engineer",
    "solutions engineer", // junior
    "forward deployed", // junior
  ],

  // Skills and associated match weights (1 to 3)
  skills: [
    { skill: "TypeScript", weight: 3 },
    { skill: "Python", weight: 3 },
    { skill: "React", weight: 3 },
    { skill: "Next.js", weight: 2 },
    { skill: "Node.js", weight: 3 },
    { skill: "Express", weight: 2 },
    { skill: "FastAPI", weight: 2 },
    { skill: "PostgreSQL", weight: 2 },
    { skill: "MongoDB", weight: 2 },
    { skill: "REST", weight: 1 },
    { skill: "WebSocket", weight: 1 },
    { skill: "Docker", weight: 2 },
    { skill: "Kubernetes", weight: 1 },
    { skill: "LLM", weight: 3 },
    { skill: "RAG", weight: 2 },
    { skill: "MCP", weight: 3 },
    { skill: "prompt", weight: 1 },
    { skill: "Groq", weight: 1 },
    { skill: "Playwright", weight: 1 },
    { skill: "Git", weight: 1 },
  ] as const satisfies readonly SkillWeight[],

  // Titles to immediately exclude or classify as senior/non-target
  excludeTitles: [
    "senior",
    "sr.",
    "sr ",
    "staff",
    "principal",
    "lead",
    "head",
    "director",
    "manager",
    "vp",
    "architect",
    "research scientist",
    "phd",
    "data scientist", // unless junior
    "sales",
    "marketing",
    "recruiter",
    "support", // non-engineering
  ],
} as const;
