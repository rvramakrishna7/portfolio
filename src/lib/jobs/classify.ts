import { OWNER_PROFILE } from "../../config/job-profile";
import { RESTRICTED_COUNTRIES_AND_REGIONS } from "../../config/countries";
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

// Senior title and level regex patterns (checked in order):
// Title contains level marker at or above mid band for a 0-1 year target:
// 1. Role seniority words
const SENIOR_ROLE_REGEX =
  /\b(senior|sr\.?|staff|principal|lead|architect|manager|head\s+of|director|vp|vice\s+president)\b/i;

// 2. SDE / SWE / Engineer / Developer with numeric level >= 2 or Roman numerals II-V
const SDE_LEVEL_REGEX =
  /\b(?:software\s+engineer|engineer|developer|dev|swe|sde)[\s-]*([2-9]|ii|iii|iv|v)\b/i;

// 3. Level 2-9 / II-V, L3-L7, Grade 3+
const CORPORATE_LEVEL_REGEX =
  /\b(?:level|lvl)[\s-]*([2-9]|ii|iii|iv|v)\b/i;

const L_LEVEL_REGEX = /\bL[\s-]*([3-7])\b/i;

const GRADE_LEVEL_REGEX = /\bGrade[\s-]*([3-9]|\d{2,})\+?\b/i;

// 4. Standalone Roman Numerals II, III, IV, V with word boundaries
// Word boundary matching ensures words like "Civil" (iv) or "Vivid" (vi) or "VN3010" do not match.
const STANDALONE_ROMAN_REGEX = /\b(II|III|IV|V)\b(?![.&])/i;

function checkTitleSeniority(
  title: string
): { isSenior: boolean; reason: string; minYears: number } | null {
  // 1. Role seniority words
  const roleMatch = SENIOR_ROLE_REGEX.exec(title);
  if (roleMatch) {
    const word = roleMatch[1].toLowerCase();
    return {
      isSenior: true,
      reason: `title level: ${word}`,
      minYears: 5,
    };
  }

  // 2. SDE / SWE / Engineer / Developer with numeric level >= 2 or Roman numeral
  const sdeMatch = SDE_LEVEL_REGEX.exec(title);
  if (sdeMatch) {
    const lvl = sdeMatch[1].toUpperCase();
    const years = /^[2-9]$/.test(lvl)
      ? parseInt(lvl, 10)
      : lvl === "II"
      ? 2
      : lvl === "III"
      ? 3
      : lvl === "IV"
      ? 4
      : 5;
    return {
      isSenior: true,
      reason: `title level: ${lvl}`,
      minYears: years,
    };
  }

  // 3. Corporate Level 2+, L3-L7, Grade 3+
  const corpMatch = CORPORATE_LEVEL_REGEX.exec(title);
  if (corpMatch) {
    const lvl = corpMatch[1].toUpperCase();
    const years = /^[2-9]$/.test(lvl)
      ? parseInt(lvl, 10)
      : lvl === "II"
      ? 2
      : lvl === "III"
      ? 3
      : lvl === "IV"
      ? 4
      : 5;
    return {
      isSenior: true,
      reason: `title level: ${corpMatch[0].trim()}`,
      minYears: years,
    };
  }

  const lMatch = L_LEVEL_REGEX.exec(title);
  if (lMatch) {
    const lNum = parseInt(lMatch[1], 10);
    return {
      isSenior: true,
      reason: `title level: ${lMatch[0].trim()}`,
      minYears: Math.max(2, lNum - 1),
    };
  }

  const gradeMatch = GRADE_LEVEL_REGEX.exec(title);
  if (gradeMatch) {
    return {
      isSenior: true,
      reason: `title level: ${gradeMatch[0].trim()}`,
      minYears: 3,
    };
  }

  // 4. Standalone Roman Numerals II, III, IV, V with word boundaries
  const romanMatch = STANDALONE_ROMAN_REGEX.exec(title);
  if (romanMatch) {
    const numeral = romanMatch[1].toUpperCase();
    const years =
      numeral === "II" ? 2 : numeral === "III" ? 3 : numeral === "IV" ? 4 : 5;
    return {
      isSenior: true,
      reason: `title level: ${numeral}`,
      minYears: years,
    };
  }

  return null;
}

/**
 * Shared helper to determine whether a job has a "real description".
 * Treats a description as missing (returns false) when, after trimming:
 * 1. It is empty
 * 2. It is shorter than 80 characters
 * 3. It is equal (case-insensitively) to the title, company, or a title/company combination line
 */
export function hasRealDescription(
  description: string | null | undefined,
  title?: string | null,
  company?: string | null
): boolean {
  if (!description) return false;
  const trimmed = description.trim();
  if (trimmed.length < 80) return false;

  const normDesc = trimmed.replace(/\s+/g, " ").toLowerCase();
  const normTitle = (title || "").trim().replace(/\s+/g, " ").toLowerCase();
  const normCompany = (company || "").trim().replace(/\s+/g, " ").toLowerCase();

  if (normTitle && normDesc === normTitle) return false;
  if (normCompany && normDesc === normCompany) return false;
  if (normTitle && normCompany) {
    const combos = [
      `${normTitle} ${normCompany}`,
      `${normCompany} ${normTitle}`,
      `${normTitle} at ${normCompany}`,
      `${normTitle} - ${normCompany}`,
      `${normCompany} - ${normTitle}`,
      `${normTitle} | ${normCompany}`,
      `${normCompany} | ${normTitle}`,
      `${normTitle}, ${normCompany}`,
      `${normCompany}, ${normTitle}`,
    ];
    if (combos.includes(normDesc)) return false;
  }

  return true;
}

/**
 * Returns the Maybe-tab note for a job whose description is missing and experience is unclear.
 */
export function getMissingDescriptionNote(source?: string | null): string {
  return source === "linkedin"
    ? "LinkedIn description missing, check experience"
    : "description missing, check experience";
}

/**
 * Classifies experience from title and description.
 * Rules:
 * 1. Seniority words and level markers in title (II, III, IV, V, SDE 2+, Level 2+, etc.) => senior
 * 2. Year patterns in description near experience keywords:
 *    minYears >= 2 => senior ("asks N+ years")
 * 3. Fresher words (fresher, graduate, new grad, entry level, 0-1, 0-2, intern, etc.) => fresher
 * 4. "junior" or "associate" in title with no years >= 2 => junior
 * 5. minYears 1 => junior
 * 6. Nothing found => unclear
 * 7. If both fresher words and 5+ years appear, years win (senior)
 */
export function classifyExperience(
  title: string,
  description: string,
  company?: string | null
): ClassifyExperienceResult {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // 1. Exclude titles: Seniority words or level markers in title => senior
  const titleSeniority = checkTitleSeniority(title);
  if (titleSeniority) {
    return {
      expClass: "senior",
      minYears: titleSeniority.minYears,
      reason: titleSeniority.reason,
    };
  }

  // 2. Year patterns in description that are specifically tied to experience
  // Prevent false positives like: "20+ years of company history", "401k", "2 years of funding"
  let detectedMinYears: number | null = null;
  let yearPatternReason = "";

  let workingDesc = descLower;

  // Check ranges first: e.g. "3-5 years", "2 to 4 years", "0-1 years", "0-2 years"
  // The lower bound represents the minimum required experience.
  const rangeRegex =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:-|\u2013|\u2014|to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:years?|yrs?)['\u2019]?(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering|hands-on|prior|practical|direct|related|commercial))*\s*(?:experience|exp)?/gi;

  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangeRegex.exec(descLower)) !== null) {
    const matchedString = rangeMatch[0];
    if (!/years?\s+of\s+(?:company\s+)?history|funding|success/i.test(matchedString)) {
      const matchIndex = rangeMatch.index;
      const snippet = descLower.slice(
        Math.max(0, matchIndex - 20),
        Math.min(descLower.length, matchIndex + rangeMatch[0].length + 20)
      );
      if (!/company\s+history|years\s+of\s+funding|series\s+[a-z]/i.test(snippet)) {
        const lowerVal = parseNumber(rangeMatch[1]);
        if (lowerVal !== null) {
          if (detectedMinYears === null || lowerVal > detectedMinYears) {
            detectedMinYears = lowerVal;
            yearPatternReason = `Requires ${lowerVal}+ years of experience`;
          }
        }
      }
    }
  }

  // Mask matched ranges in workingDesc so upper bounds (e.g. "5" in "3-5 years") are not re-matched as standalone minimums
  workingDesc = workingDesc.replace(rangeRegex, " [exp-range] ");

  const expYearRegexes = [
    // Typically / at least / minimum N+ years of [qualifiers] (experience|exp)
    /\b(?:at\s+least|minimum|min\.?|typically|around|about|approximately)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:-\s*\d+)?\s*(?:years?|yrs?)['\u2019]?(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering|hands-on|prior|practical|direct|related|commercial))*\s*(?:experience|exp)?/gi,
    // N+ years/yrs (of) (qualifiers) (experience|exp)
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+\s*(?:years?|yrs?)['\u2019]?(?:\s+of)?(?:\s+(?:relevant|professional|industry|working|software|engineering|hands-on|prior|practical|direct|related|commercial))*\s*(?:experience|exp)?/gi,
    // N years/yrs['] (of) (qualifiers) experience/exp
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:years?|yrs?)['\u2019]?(?:\s+of)?\s+(?:relevant|professional|industry|working|software|engineering|hands-on|prior|practical|direct|related|commercial)?\s*(?:experience|exp)\b/gi,
    // experience/exp: N+ years/yrs
    /\b(?:experience|exp)\s*[:=-]?(?:\s+of)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:years?|yrs?)['\u2019]?/gi,
  ];

  for (const regex of expYearRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(workingDesc)) !== null) {
      // Avoid matches like "company has 20 years of history" if "history" follows years
      const matchedString = match[0];
      if (/years?\s+of\s+(?:company\s+)?history|funding|success/i.test(matchedString)) {
        continue;
      }

      // Check context surrounding the match for "history" or "funding"
      const matchIndex = match.index;
      const snippet = workingDesc.slice(Math.max(0, matchIndex - 20), Math.min(workingDesc.length, matchIndex + match[0].length + 20));
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
  const noExpRegex = /\b(?:no\s+experience\s+required|0\s*(?:years?|yrs?)\s+(?:of\s+)?experience|zero\s*(?:years?|yrs?)\s+(?:of\s+)?experience)\b/i;
  const hasNoExp = noExpRegex.test(descLower);

  // Check fresher words (includes 0-1, 0-2 yrs, freshers welcome)
  const fresherWordsRegex = /\b(?:fresher|freshers|fresh\s+graduate|fresh\s+graduates|freshers?\s+welcome|new\s+grad|new\s+grads|entry\s*level|entry-level|0\s*-\s*[12]\s*(?:years?|yrs?)|0\s+to\s+[12]\s*(?:years?|yrs?)|intern|internship|trainee|apprentice)\b/i;
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

  if (!hasRealDescription(description, title, company)) {
    return {
      expClass: "unclear",
      minYears: null,
      reason: "description missing, check experience",
    };
  }

  return {
    expClass: "unclear",
    minYears: null,
    reason: "No explicit experience requirements identified",
  };
}

/**
 * Escapes regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build regex patterns for restricted regions/countries
const COUNTRIES_PATTERN = RESTRICTED_COUNTRIES_AND_REGIONS
  .map((c) => escapeRegex(c.toLowerCase()))
  .join("|");

const RESTRICTED_COUNTRY_REGEXES = [
  new RegExp(`\\beligible\\s+in\\s+(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\bbased\\s+in\\s+(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\blocated\\s+in\\s+(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\bmust\\s+reside\\s+in\\s+(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\bwork\\s+from\\s+(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\bremote\\s*\\(\\s*(?:the\\s+)?(${COUNTRIES_PATTERN})\\s*\\)`, "i"),
  new RegExp(`\\bremote\\s*[-,\/:\\s]+\\s*(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
  new RegExp(`\\b(${COUNTRIES_PATTERN})\\s*[-,\/:\\s]+\\s*remote\\b`, "i"),
  new RegExp(`\\bhome[\\s-]based\\s*-\\s*(?:the\\s+)?(${COUNTRIES_PATTERN})\\b`, "i"),
];

/**
 * Checks if a sentence is a boilerplate comma-separated country/office list.
 * Rule: 3+ country names separated by commas in one sentence = boilerplate list, ignored.
 */
function isBoilerplateCountryList(sentence: string): boolean {
  let count = 0;
  for (const c of RESTRICTED_COUNTRIES_AND_REGIONS) {
    const reg = new RegExp(`\\b${escapeRegex(c.toLowerCase())}\\b`, "i");
    if (reg.test(sentence)) {
      count++;
      if (count >= 3) return true;
    }
  }
  // Also check "india"
  if (/\bindia\b/i.test(sentence)) {
    count++;
    if (count >= 3) return true;
  }
  return false;
}

/**
 * Classifies geographical eligibility.
 */
export function classifyGeo(
  title: string,
  location: string,
  remoteScope: string,
  description: string,
  options?: { isRemote?: boolean; workplaceType?: string }
): ClassifyGeoResult {
  // Public sector or security clearance is strictly restricted to domestic citizens/jurisdictions
  const clearanceOrPublicSectorRegex =
    /\b(?:public\s+sector|security\s+clearance|clearance\s+required|u\.?s\.?\s+public\s+sector|federal\s+(?:focus|client|government)|polygraph|secret\s+clearance)\b/i;
  if (clearanceOrPublicSectorRegex.test(title)) {
    return {
      geo: "restricted",
      reason: "Requires public sector or security clearance",
    };
  }

  // Check explicit workplace type or on-site / hybrid markers
  const wpLower = options?.workplaceType?.toLowerCase();
  const isExplicitNonRemoteFlag =
    options?.isRemote === false ||
    wpLower === "onsite" ||
    wpLower === "on-site" ||
    wpLower === "hybrid";

  const nonRemoteKeywordRegex =
    /\b(?:hybrid|on-site|onsite|in-office|in\s+office|office-based|office\s+based)\b/i;
  const hasNonRemoteInLocation =
    nonRemoteKeywordRegex.test(location) ||
    nonRemoteKeywordRegex.test(remoteScope) ||
    nonRemoteKeywordRegex.test(title);

  if (isExplicitNonRemoteFlag || hasNonRemoteInLocation) {
    return {
      geo: "restricted",
      reason: `onsite: On-site or hybrid role, not remote (${options?.workplaceType || location || "non-remote"})`,
    };
  }

  const remoteKeywordRegex =
    /\b(?:remote|worldwide|anywhere|work\s+from\s+anywhere|distributed|virtual|telecommute|wfh|home[\s-]based)\b/i;
  const isRemoteMarked =
    options?.isRemote === true ||
    wpLower === "remote" ||
    remoteKeywordRegex.test(location) ||
    remoteKeywordRegex.test(remoteScope);

  const indiaLocationRegex =
    /\b(?:india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|gurgaon|noida|chennai|kolkata)\b/i;
  const hasIndiaInLocation =
    indiaLocationRegex.test(location) ||
    indiaLocationRegex.test(remoteScope) ||
    indiaLocationRegex.test(title);

  const isUnknownOrGenericLocation =
    !location ||
    /^(?:unknown|n\/?a|anywhere|flexible|various|multiple)$/i.test(location.trim());

  // Non-remote physical location outside of India
  if (!isRemoteMarked && !hasIndiaInLocation && !isUnknownOrGenericLocation) {
    return {
      geo: "restricted",
      reason: `onsite: Non-remote location (${location})`,
    };
  }

  const titleScope = `${title} ${location} ${remoteScope}`.toLowerCase();
  const descriptionLower = description.toLowerCase();
  const combined = `${titleScope} ${descriptionLower}`.toLowerCase();

  // 1. Jurisdictional restriction patterns (US only, Europe only, etc.)
  const generalRestrictedPatterns = [
    /\b(?:us\s+only|usa\s+only|united\s+states\s+only)\b/i,
    /\bmust\s+be\s+located\s+in\s+(?:the\s+)?(?:us|usa|united\s+states|eu|uk|canada|europe)\b/i,
    /\b(?:eu\s+only|europe\s+only|uk\s+only|canada\s+only|americas\s+only|latin\s+america\s+only|latam\s+only)\b/i,
    /\b(?:us|est|pst|cst)\s+timezone\s+only\b/i,
    /\bauthorized\s+to\s+work\s+in\s+the\s+us\b/i,
    /\bus\s+citizenship\s+required\b/i,
    /\bno\s+c2c\b/i,
    /\bnot\s+open\s+internationally\b/i,
  ];

  // Territory restriction in title:
  // e.g. "Sales Director (Middle East)", "Customer Success Producer (China)", "Field Service Engineer - UK Remote", "Virtual IOP Clinician - Florida & Texas"
  const titleTerritoryRegex = new RegExp(
    `(?:\\(|-|–|,|:)\\s*(?:remote\\s+)?(?:the\\s+)?(${COUNTRIES_PATTERN}|florida|texas|california|new york|apac|asia|middle east)\\b`,
    "i"
  );

  let detectedRestriction: string | null = null;
  const titleTerritoryMatch = titleTerritoryRegex.exec(title);
  if (titleTerritoryMatch) {
    const matchedRegion = titleTerritoryMatch[1].toLowerCase();
    // If India or worldwide is listed in that title territory, it's not restricted
    if (!/\b(india|worldwide)\b/i.test(matchedRegion)) {
      detectedRestriction = `Title restricted to territory ${titleTerritoryMatch[1]}`;
    }
  }

  // Check country-specific restrictions in headers (title / location / remoteScope) or description
  if (!detectedRestriction) {
    for (const pat of generalRestrictedPatterns) {
      if (pat.test(combined)) {
        detectedRestriction = "Restricted to specific jurisdictions (e.g. US/EU/UK only)";
        break;
      }
    }
  }

  if (!detectedRestriction) {
    // Check header combined first (e.g. "Remote (Poland)", "Remote - Germany", "Remote Eligible in Bulgaria")
    for (const regex of RESTRICTED_COUNTRY_REGEXES) {
      const match = regex.exec(titleScope);
      if (match) {
        detectedRestriction = `Restricted to ${match[1] || "specific country/region"}`;
        break;
      }
    }
  }

  if (!detectedRestriction) {
    // Also check description for restricted patterns
    for (const regex of RESTRICTED_COUNTRY_REGEXES) {
      const match = regex.exec(descriptionLower);
      if (match) {
        detectedRestriction = `Restricted to ${match[1] || "specific country/region"}`;
        break;
      }
    }
  }

  // 2. Positive signals:
  // From title + location + remoteScope freely:
  const headerWorldwidePatterns = [
    /\bworldwide\b/i,
    /\bwork\s+from\s+anywhere\b/i,
    /\banywhere\s+in\s+the\s+world\b/i,
    /\bglobal\b/i,
    /\banywhere\b/i,
    /\bany\s+timezone\b/i,
  ];
  const headerIndiaPatterns = [
    /\bindia\b/i,
    /\bapac\b/i,
    /\basia\b/i,
    /\bist\s+timezone\b/i,
    /\bbengaluru|bangalore|mumbai|delhi|hyderabad|pune\b/i,
  ];

  // From description: ONLY explicit eligibility phrases
  // A bare "worldwide" (customers worldwide, offices worldwide, worldwide leader) must be ignored.
  const descWorldwidePatterns = [
    /\bremote\s+worldwide\b/i,
    /\bworldwide\s+remote\b/i,
    /\bwork\s+worldwide\b/i,
    /\bopen\s+worldwide\b/i,
    /\banywhere\s+worldwide\b/i,
    /\bhiring\s+worldwide\b/i,
    /\bcandidates\s+worldwide\b/i,
    /\bworldwide\s*\(\s*remote\s*\)/i,
    /\bfrom\s+anywhere\b/i,
    /\banywhere\s+in\s+the\s+world\b/i,
    /\bany\s+country\b/i,
  ];
  const descIndiaPatterns = [
    /\bopen\s+to\s+candidates\s+in\s+india\b/i,
    /\bopen\s+to\s+(?:candidates\s+in\s+)?(?:india|apac)\b/i,
    /\bindia\s+timezone\b/i,
    /\bapac\s+timezones?\b/i,
    /\bremote,\s*india\b/i,
    /\bremote\s*-\s*india\b/i,
    /\bhiring\s+in\s+india\b/i,
    /\bcandidates\s+in\s+india\b/i,
    /\bwork\s+from\s+india\b/i,
  ];

  let matchesWorldwide = headerWorldwidePatterns.some((pat) => pat.test(titleScope));
  let matchesIndia = headerIndiaPatterns.some((pat) => pat.test(titleScope));

  if (!matchesWorldwide) {
    matchesWorldwide = descWorldwidePatterns.some((pat) => pat.test(descriptionLower));
  }

  if (!matchesIndia) {
    // Check description sentences for explicit India allow signals, filtering out boilerplate country lists
    const sentences = description.split(/[.!?\n]+/);
    for (const sentence of sentences) {
      if (isBoilerplateCountryList(sentence)) {
        continue;
      }
      if (descIndiaPatterns.some((pat) => pat.test(sentence))) {
        matchesIndia = true;
        break;
      }
      // Also allow "India timezones welcome" or "APAC timezones welcome" in clean sentences
      if (/\b(india|apac)\s+(?:timezones?\s+)?welcome\b/i.test(sentence)) {
        matchesIndia = true;
        break;
      }
    }
  }

  // 3. Precedence:
  // A restriction ALWAYS wins over worldwide.
  // India/APAC can override a restriction ONLY if the same sentence explicitly allows India.
  if (detectedRestriction) {
    if (matchesIndia) {
      // Check if India is explicitly allowed in an allow sentence that is NOT a boilerplate list
      // Note: allowedSentencePattern must NOT include "based in", "located in", "across" (these describe offices, not eligibility).
      const sentences = combined.split(/[.!?\n]+/);
      let explicitlyAllowed = false;
      for (const sentence of sentences) {
        if (isBoilerplateCountryList(sentence)) {
          continue;
        }
        const allowedPattern = /\b(?:open\s+to|welcome|hiring\s+in|available\s+in|remote,\s*|remote\s*-\s*)\s+[^,]*\b(india|apac)\b/i;
        if (allowedPattern.test(sentence) || /\b(india|apac)\s+(?:timezones?\s+)?welcome\b/i.test(sentence)) {
          explicitlyAllowed = true;
          break;
        }
      }

      if (explicitlyAllowed) {
        return {
          geo: "india_ok",
          reason: "Explicitly open to India / APAC",
        };
      }
    }

    return {
      geo: "restricted",
      reason: detectedRestriction,
    };
  }

  // No restriction found
  if (matchesIndia) {
    return {
      geo: "india_ok",
      reason: "Explicitly open to India / APAC",
    };
  }

  if (matchesWorldwide) {
    return {
      geo: "worldwide",
      reason: "Open worldwide / work from anywhere",
    };
  }

  const isRemote =
    isRemoteMarked ||
    remoteKeywordRegex.test(descriptionLower) ||
    remoteKeywordRegex.test(title);

  if (isRemote) {
    return {
      geo: "unclear",
      reason: "remote-unconfirmed: Remote role, India eligibility not stated",
    };
  }

  return {
    geo: "unclear",
    reason: `onsite: Location not confirmed remote (${location || "unspecified"})`,
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
