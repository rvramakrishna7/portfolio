import { OWNER_PROFILE } from "../../config/job-profile";
import { NormalizedJob } from "./types";

export type ExpClass = "fresher" | "junior" | "unclear" | "senior";
export type GeoEligibility = "worldwide" | "india_ok" | "restricted" | "unclear";

export interface ClassifyExperienceResult {
  expClass: ExpClass;
  minYears: number | null;
  reason: string;
}

export interface ClassifyGeoResult {
  geo: GeoEligibility;
  reason: string;
}

export interface ScoreMatchResult {
  score: number;
  matchedSkills: string[];
  reasons: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseNumber(str: string): number | null {
  const trimmed = str.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (trimmed in NUMBER_WORDS) {
    return NUMBER_WORDS[trimmed];
  }
  return null;
}

/**
 * Classifies experience from title and description.
 * Rules:
 * 1. Seniority words in title => senior
 * 2. Year patterns in description near experience keywords:
 *    minYears >= 2 => senior ("asks N+ years")
 * 3. Fresher words (fresher, graduate, new grad, entry level, 0-1, intern, etc.) => fresher
 * 4. "junior" or "associate" in title with no years >= 2 => junior
 * 5. minYears 1 => junior
 * 6. Nothing found => unclear
 * 7. If both fresher words and 5+ years appear, years win (senior)
 */
export function classifyExperience(
  title: string,
  description: string
): ClassifyExperienceResult {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // 1. Exclude titles: Seniority words in title => senior
  const seniorTitleWords = [
    "senior",
    "sr.",
    "sr ",
    "staff",
    "principal",
    "lead",
    "head of",
    "director",
    "manager",
    "vp",
    "architect",
  ];
  for (const word of seniorTitleWords) {
    const regex = new RegExp(`\\b${word.replace(".", "\\.")}\\b`, "i");
    if (regex.test(titleLower)) {
      return {
        expClass: "senior",
        minYears: 5,
        reason: `Title contains senior role indicator '${word}'`,
      };
    }
  }

  // 2. Year patterns in description that are specifically tied to experience
  // Prevent false positives like: "20+ years of company history", "401k", "2 years of funding"
  // Look for patterns like:
  // (N+ | N-M | N to M | at least N | minimum N | N) years (of)? (experience|exp|professional|industry|relevant|working)
  // or (experience|exp) of N years
  let detectedMinYears: number | null = null;
  let yearPatternReason = "";

  const expYearRegexes = [
    /\b(?:at\s+least|minimum|min\.?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:-\s*\d+)?\s*years?\b(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering))?\s*(?:experience|exp)?/gi,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+\s*years?\b(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering))?\s*(?:experience|exp)?/gi,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*years?\b(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering))?\s*(?:experience|exp)?/gi,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*years?\b(?:\s+of)?\s+(?:relevant|professional|industry|working|software|engineering|hands-on)?\s*(?:experience|exp)\b/gi,
    /\b(?:experience|exp)(?:\s+of)?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*years?\b/gi,
  ];

  for (const regex of expYearRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(descLower)) !== null) {
      // Avoid matches like "company has 20 years of history" if "history" follows years
      const matchedString = match[0];
      if (/years?\s+of\s+(?:company\s+)?history|funding|success/i.test(matchedString)) {
        continue;
      }

      // Check context surrounding the match for "history" or "funding"
      const matchIndex = match.index;
      const snippet = descLower.slice(Math.max(0, matchIndex - 20), Math.min(descLower.length, matchIndex + match[0].length + 20));
      if (/company\s+history|years\s+of\s+funding|series\s+[a-z]/i.test(snippet)) {
        continue;
      }

      const numStr = match[1];
      if (numStr) {
        const val = parseNumber(numStr);
        if (val !== null) {
          if (detectedMinYears === null || val > detectedMinYears) {
            detectedMinYears = val;
            yearPatternReason = `Requires ${val}+ years of experience`;
          }
        }
      }
    }
  }

  // Check for explicit "no experience required"
  const noExpRegex = /\b(?:no\s+experience\s+required|0\s*years?\s+(?:of\s+)?experience|zero\s+years?\s+(?:of\s+)?experience)\b/i;
  const hasNoExp = noExpRegex.test(descLower);

  // Check fresher words
  const fresherWordsRegex = /\b(?:fresher|freshers|fresh\s+graduate|new\s+grad|new\s+grads|entry\s*level|entry-level|0\s*-\s*1\s*(?:years?|yrs?)|0\s+to\s+1\s*(?:years?|yrs?)|intern|internship|trainee|apprentice)\b/i;
  const hasFresherInTitle = fresherWordsRegex.test(titleLower);
  const hasFresherInDesc = fresherWordsRegex.test(descLower);
  const hasFresher = hasFresherInTitle || hasFresherInDesc || hasNoExp;

  // Rule 7: If both fresher words and 5+ years appear, years win (senior)
  if (detectedMinYears !== null && detectedMinYears >= 5) {
    return {
      expClass: "senior",
      minYears: detectedMinYears,
      reason: yearPatternReason,
    };
  }

  // minYears >= 2 => senior
  if (detectedMinYears !== null && detectedMinYears >= 2) {
    return {
      expClass: "senior",
      minYears: detectedMinYears,
      reason: yearPatternReason,
    };
  }

  // Fresher words found (and not senior by years >= 2)
  if (hasFresher) {
    return {
      expClass: "fresher",
      minYears: 0,
      reason: "Targets freshers, new grads, or entry level (0-1 yrs)",
    };
  }

  // "junior" or "associate" in title with no years >= 2
  const isJuniorTitle = /\b(?:junior|associate)\b/i.test(titleLower);
  if (isJuniorTitle) {
    return {
      expClass: "junior",
      minYears: detectedMinYears ?? 1,
      reason: "Job title indicates Junior or Associate position",
    };
  }

  // minYears === 1 => junior
  if (detectedMinYears === 1) {
    return {
      expClass: "junior",
      minYears: 1,
      reason: "Requires 1 year of experience",
    };
  }

  return {
    expClass: "unclear",
    minYears: null,
    reason: "No explicit experience requirements identified",
  };
}

/**
 * Classifies geographical eligibility.
 */
export function classifyGeo(
  location: string,
  remoteScope: string,
  description: string
): ClassifyGeoResult {
  const combined = `${location} ${remoteScope} ${description}`.toLowerCase();

  // 1. Restricted patterns (US only, Europe only, etc.)
  const restrictedPatterns = [
    /\b(?:us\s+only|usa\s+only|united\s+states\s+only)\b/i,
    /\bmust\s+be\s+located\s+in\s+(?:the\s+)?(?:us|usa|united\s+states|eu|uk|canada|europe)\b/i,
    /\b(?:eu\s+only|europe\s+only|uk\s+only|canada\s+only|americas\s+only|latin\s+america\s+only|latam\s+only)\b/i,
    /\b(?:us|est|pst|cst)\s+timezone\s+only\b/i,
    /\bauthorized\s+to\s+work\s+in\s+the\s+us\b/i,
    /\bus\s+citizenship\s+required\b/i,
    /\bno\s+c2c\b/i,
  ];

  for (const pat of restrictedPatterns) {
    if (pat.test(combined)) {
      return {
        geo: "restricted",
        reason: "Restricted to specific jurisdictions (e.g. US/EU/UK only)",
      };
    }
  }

  // 2. India ok
  const indiaPatterns = [
    /\bindia\b/i,
    /\bapac\b/i,
    /\basia\b/i,
    /\bist\s+timezone\b/i,
    /\bbengaluru|bangalore|mumbai|delhi|hyderabad|pune\b/i,
  ];
  for (const pat of indiaPatterns) {
    if (pat.test(combined)) {
      return {
        geo: "india_ok",
        reason: "Explicitly open to India / APAC",
      };
    }
  }

  // 3. Worldwide
  const worldwidePatterns = [
    /\bworldwide\b/i,
    /\banywhere\b/i,
    /\bglobal\b/i,
    /\bwork\s+from\s+anywhere\b/i,
    /\banywhere\s+in\s+the\s+world\b/i,
    /\bany\s+timezone\b/i,
  ];
  for (const pat of worldwidePatterns) {
    if (pat.test(combined)) {
      return {
        geo: "worldwide",
        reason: "Open worldwide / work from anywhere",
      };
    }
  }

  return {
    geo: "unclear",
    reason: "No explicit geographic restrictions found",
  };
}

/**
 * Computes an explainable 0-100 match score based on title relevance,
 * weighted skill overlap, experience fit, and geo eligibility.
 */
export function scoreMatch(
  job: Pick<NormalizedJob, "title" | "description" | "tags"> & {
    expClass?: ExpClass;
    geoEligibility?: GeoEligibility;
  },
  profile = OWNER_PROFILE
): ScoreMatchResult {
  let score = 0;
  const matchedSkills: string[] = [];
  const reasons: string[] = [];

  const titleLower = job.title.toLowerCase();
  const descLower = job.description.toLowerCase();
  const tagsLower = (job.tags || []).map((t) => t.toLowerCase());

  // 1. Title match (up to 40 pts)
  let titleMatched = false;
  for (const role of profile.targetRoles) {
    if (titleLower.includes(role.toLowerCase())) {
      titleMatched = true;
      if (role === "frontend") {
        score += 25; // lower weight
        reasons.push(`Title matches '${role}' (+25)`);
      } else {
        score += 40;
        reasons.push(`Title matches core target '${role}' (+40)`);
      }
      break;
    }
  }

  if (!titleMatched) {
    reasons.push("Title does not directly match core target roles (+0)");
  }

  // 2. Skill matches (weighted, up to 40 pts)
  let totalSkillPoints = 0;
  for (const { skill, weight } of profile.skills) {
    const sLower = skill.toLowerCase();
    // Match skill as whole word in tags, title, or description
    const regex = new RegExp(`\\b${sLower.replace(".", "\\.")}\\b`, "i");
    const inTags = tagsLower.includes(sLower);
    const inDesc = regex.test(descLower);
    const inTitle = regex.test(titleLower);

    if (inTags || inDesc || inTitle) {
      matchedSkills.push(skill);
      totalSkillPoints += weight * 3;
    }
  }

  const cappedSkillPoints = Math.min(40, totalSkillPoints);
  score += cappedSkillPoints;
  if (matchedSkills.length > 0) {
    reasons.push(
      `Matched ${matchedSkills.length} skills: ${matchedSkills.slice(0, 6).join(", ")} (+${cappedSkillPoints})`
    );
  }

  // 3. Experience fit adjustments
  const exp = job.expClass || "unclear";
  if (exp === "fresher") {
    score += 10;
    reasons.push("Fresher / entry-level fit bonus (+10)");
  } else if (exp === "junior") {
    score += 8;
    reasons.push("Junior role fit bonus (+8)");
  } else if (exp === "unclear") {
    score -= 5;
    reasons.push("Unclear experience requirement penalty (-5)");
  } else if (exp === "senior") {
    score = Math.min(score, 15);
    reasons.push("Senior requirement cap (score capped at 15)");
  }

  // 4. Geo fit adjustments
  const geo = job.geoEligibility || "unclear";
  if (geo === "worldwide" || geo === "india_ok") {
    score += 10;
    reasons.push("Geo eligibility bonus (worldwide or India ok) (+10)");
  } else if (geo === "restricted") {
    score = 0;
    reasons.push("Geographically restricted role (score set to 0)");
  }

  if (exp === "senior") {
    score = Math.min(score, 15);
  }
  if (geo === "restricted") {
    score = 0;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    matchedSkills,
    reasons,
  };
}
