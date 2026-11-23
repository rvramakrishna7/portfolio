import { createHash } from "crypto";
import { stripHtml } from "../jobs/clean";
import { classifyExperience, classifyGeo, scoreMatch } from "../jobs/classify";
import { detectLanguage } from "../jobs/language";
import { isJobStale } from "../jobs/freshness";
import { isExcludedTitle, OWNER_PROFILE, MAX_AGE_DAYS_DEFAULT } from "../../config/job-profile";
import { NormalizedJob } from "../jobs/types";
import { JobsRepository, StoredJob } from "../jobs/repository";
import { TriagedJobResult } from "../llm/triage";

export interface InboundCandidate {
  title: string;
  company: string;
  location?: string;
  url: string;
  contact_email?: string;
  description: string;
  source: string;
  inbound_raw?: string;
  inbound_source?: string;
  posted_at?: string;
  isRemote?: boolean;
  workplaceType?: string;
}

export interface IngestResult {
  added: number;
  duplicates: number;
  filtered: number;
  jobs: StoredJob[];
}

/**
 * Normalizes a URL by trimming, converting host to lowercase,
 * and stripping tracking query parameters (utm_*, ref, trk, etc.).
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const params = new URLSearchParams(parsed.search);
    const keysToRemove: string[] = [];
    params.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        lower === "ref" ||
        lower === "trk" ||
        lower === "refid" ||
        lower === "trackingid" ||
        lower === "source"
      ) {
        keysToRemove.push(key);
      }
    });
    for (const key of keysToRemove) {
      params.delete(key);
    }
    const cleanSearch = params.toString();
    parsed.search = cleanSearch ? `?${cleanSearch}` : "";
    let clean = parsed.toString();
    if (clean.endsWith("/") && parsed.pathname !== "/") {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Keywords that signal text is genuinely about a job / vacancy.
 */
const JOB_KEYWORDS = [
  "hiring",
  "job",
  "career",
  "role",
  "position",
  "vacancy",
  "opening",
  "looking for",
  "apply",
  "developer",
  "engineer",
  "full stack",
  "fullstack",
  "backend",
  "frontend",
  "intern",
  "internship",
  "fresher",
  "graduate",
  "junior",
  "stipend",
  "salary",
  "lpa",
  "ctc",
  "experience",
  "years of experience",
  "yoe",
  "workplace",
  "remote",
  "hybrid",
  "on-site",
  "onsite",
  "tech stack",
  "skills",
  "resume",
  "cv",
  "linkedin.com/jobs",
  "lever.co",
  "greenhouse.io",
  "ashbyhq.com",
  "workday",
];

const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,;:!?)\]]/gi;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

/**
 * Checks if a string contains job-related keywords.
 */
function containsJobSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return JOB_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Extracts company slug from known ATS URLs (Greenhouse, Lever, Ashby).
 */
function extractCompanyFromUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (host.includes("greenhouse.io")) {
      // boards.greenhouse.io/{company}/jobs/... or boards.greenhouse.io/embed/job_board?for={company}
      if (parts[0] && parts[0] !== "embed") return parts[0];
      const forParam = parsed.searchParams.get("for");
      if (forParam) return forParam;
    } else if (host.includes("lever.co")) {
      // jobs.lever.co/{company}/...
      if (parts[0]) return parts[0];
    } else if (host.includes("ashbyhq.com")) {
      // jobs.ashbyhq.com/{company}/...
      if (parts[0]) return parts[0];
    }
  } catch {
    // Ignore invalid URL
  }
  return null;
}

/**
 * Parses free text or HTML into raw job candidate objects.
 * Deduplicates candidates by normalized URL.
 */
export function parseInboundCandidates(
  input: string,
  options?: { source?: string; defaultLocation?: string }
): InboundCandidate[] {
  if (!input || !input.trim()) return [];

  const rawInput = input.trim();
  const source = options?.source || "inbound";

  // Check if input is HTML by detecting tags
  const isHtml = /<[a-z][\s\S]*>/i.test(rawInput);

  // If HTML, extract structured anchor tags first
  const htmlLinks: Array<{ href: string; text: string }> = [];
  if (isHtml) {
    const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(rawInput)) !== null) {
      const href = match[1];
      const anchorText = stripHtml(match[2]).trim();
      if (/^https?:\/\//i.test(href)) {
        htmlLinks.push({ href, text: anchorText });
      }
    }
  }

  // Convert HTML to clean plain text
  const plainText = isHtml ? stripHtml(rawInput) : rawInput;

  // If the entire text contains no job signals whatsoever, return 0 candidates
  if (!containsJobSignal(plainText)) {
    return [];
  }

  // Segment text into candidate blocks if multiple jobs are present
  const segments = splitIntoJobSegments(plainText);
  const candidates: InboundCandidate[] = [];
  const seenNormUrls = new Set<string>();

  for (const segment of segments) {
    if (segments.length > 1) {
      const urls = segment.match(URL_REGEX) || [];
      const emails = segment.match(EMAIL_REGEX) || [];
      if (urls.length === 0 && emails.length === 0 && !segment.toLowerCase().includes("role:")) {
        continue;
      }
    }

    if (!containsJobSignal(segment) && segments.length > 1) {
      continue;
    }

    const candidate = extractSingleCandidate(segment, {
      source,
      inboundRaw: rawInput,
      htmlLinks,
      defaultLocation: options?.defaultLocation,
    });

    if (candidate) {
      const norm = normalizeUrl(candidate.url);
      if (!seenNormUrls.has(norm)) {
        seenNormUrls.add(norm);
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

/**
 * Splits multi-job digests (numbered lists, markdown sections, double newlines)
 * into distinct text segments if multiple URLs or distinct job headers exist.
 */
function splitIntoJobSegments(text: string): string[] {
  const allUrls = text.match(URL_REGEX) || [];
  if (allUrls.length <= 1) {
    return [text];
  }

  // If multiple URLs exist, try splitting on numbered list markers (e.g. "\n1. ", "\n2. ") or double newlines
  const numberedSplit = text.split(/(?:^|\n)(?:\d+\.|\([0-9]+\)|•|\*|-)\s+/m).filter((s) => s.trim().length > 20);
  if (numberedSplit.length > 1 && numberedSplit.length <= allUrls.length + 1) {
    return numberedSplit;
  }

  // Try splitting by double newline if each chunk has a URL
  const doubleNewlineSplit = text.split(/\n\s*\n/).filter((s) => s.trim().length > 20);
  if (
    doubleNewlineSplit.length > 1 &&
    doubleNewlineSplit.every((chunk) => URL_REGEX.test(chunk) || containsJobSignal(chunk))
  ) {
    return doubleNewlineSplit;
  }

  return [text];
}

/**
 * Extracts a single job candidate from a text segment.
 */
function extractSingleCandidate(
  text: string,
  context: {
    source: string;
    inboundRaw: string;
    htmlLinks: Array<{ href: string; text: string }>;
    defaultLocation?: string;
  }
): InboundCandidate | null {
  const cleanText = text.trim();
  const urls = cleanText.match(URL_REGEX) || [];
  const emails = cleanText.match(EMAIL_REGEX) || [];

  let candidateUrl = urls[0] || "";
  const contactEmail = emails[0] || undefined;

  // If no URL in text segment, check if an htmlLink matches or use mailto
  if (!candidateUrl && context.htmlLinks.length > 0) {
    for (const link of context.htmlLinks) {
      if (cleanText.toLowerCase().includes(link.text.toLowerCase()) || link.text.length > 4) {
        candidateUrl = link.href;
        break;
      }
    }
  }

  if (!candidateUrl) {
    if (contactEmail) {
      candidateUrl = `mailto:${contactEmail}`;
    } else {
      // Fallback synthetic urn URL if text clearly describes a job
      const hash = createHash("sha256").update(cleanText).digest("hex").slice(0, 16);
      candidateUrl = `urn:inbound:${hash}`;
    }
  }

  let title = "";
  let company = "";
  let location: string | undefined = context.defaultLocation;

  // Title / Company Heuristics
  // 1. Explicit labels: "Role: ...", "Title: ...", "Position: ..."
  const roleMatch = cleanText.match(/(?:Role|Job Title|Title|Position)\s*:\s*([^\n\r,;|]+)/i);
  if (roleMatch) {
    title = roleMatch[1].trim();
  }

  // 2. Explicit company labels: "Company: ...", "Organization: ..."
  const companyMatch = cleanText.match(/(?:Company|Organization|Org)\s*:\s*([^\n\r,;|]+)/i);
  if (companyMatch) {
    company = companyMatch[1].trim();
  }

  // 3. Location label: "Location: ..."
  const locationMatch = cleanText.match(/Location\s*:\s*([^\n\r;]+)/i);
  if (locationMatch) {
    location = locationMatch[1].trim();
  }

  // 4. "Hiring Alert: [Title] at [Company]" or "Hiring: [Title] at [Company]"
  if (!title || !company) {
    const hiringAtMatch = cleanText.match(
      /(?:Hiring(?:\s+Alert)?:\s*|We are hiring\s+)([^@\n\r|!]+?)[ \t]+(?:at|@)[ \t]+([A-Za-z0-9&. \t'-]+)/i
    );
    if (hiringAtMatch) {
      if (!title) title = hiringAtMatch[1].replace(/^\*/, "").trim();
      if (!company) company = hiringAtMatch[2].replace(/[*!.,;]+$/, "").trim();
    }
  }

  // 5. "[Company] is hiring [Title]" or "[Company] is looking for [Title]"
  if (!title || !company) {
    const isHiringMatch = cleanText.match(
      /([A-Za-z0-9&.\s'-]+?)\s+is\s+(?:hiring|looking for)\s+(?:an?\s+)?([^,\n\r;|.]+)/i
    );
    if (isHiringMatch) {
      if (!company) company = isHiringMatch[1].trim();
      if (!title) title = isHiringMatch[2].trim();
    }
  }

  // 6. "[Title] at [Company]" / "[Title] @ [Company]" (within single line)
  if (!title || !company) {
    const titleAtMatch = cleanText.match(
      /^[ \t*#]*([A-Za-z0-9\s/+#.-]{3,40}?)[ \t]+(?:at|@)[ \t]+([A-Za-z0-9&. '-]{2,30})/im
    );
    if (titleAtMatch) {
      const candidateTitle = titleAtMatch[1].trim();
      const candidateCompany = titleAtMatch[2].trim();
      if (!title) title = candidateTitle;
      if (!company) company = candidateCompany;
    }
  }

  // 6b. Line-by-line structure (e.g. Line 1: Title, Line 2: Company, Line 3: Location)
  if (!title || !company) {
    const lines = cleanText
      .split("\n")
      .map((l) => l.trim().replace(/^[*#\-_~]+|[*#\-_~]+$/g, "").trim())
      .filter((l) => l.length > 0 && !/^https?:\/\//i.test(l));
    if (lines.length >= 2) {
      const l1 = lines[0];
      const l2 = lines[1];
      // If line 1 matches a known role or job keyword and is concise
      if (l1.length <= 50 && containsJobSignal(l1) && l2.length <= 40 && !containsJobSignal(l2)) {
        if (!title) title = l1;
        if (!company) company = l2;
        if (lines[2] && lines[2].length <= 50 && !location) {
          location = lines[2];
        }
      }
    }
  }

  // 7. HN style: "Company | Title | Location"
  if (!title || !company) {
    const pipeMatch = cleanText.match(
      /^([A-Za-z0-9&.\s'-]{2,30})\s*\|\s*([^|\n\r]+?)\s*\|\s*([^|\n\r]+)/m
    );
    if (pipeMatch) {
      if (!company) company = pipeMatch[1].trim();
      if (!title) title = pipeMatch[2].trim();
      if (!location) location = pipeMatch[3].trim();
    }
  }

  // 8. "[Company] - [Title]"
  if (!title || !company) {
    const dashMatch = cleanText.match(
      /^([A-Za-z0-9&.\s'-]{2,30})\s*[-\u2013\u2014]\s*([A-Za-z0-9\s/+#.-]{3,40})/m
    );
    if (dashMatch) {
      const first = dashMatch[1].trim();
      const second = dashMatch[2].trim();
      // If second looks like a target role
      if (OWNER_PROFILE.targetRoles.some((tr) => second.toLowerCase().includes(tr))) {
        if (!company) company = first;
        if (!title) title = second;
      } else if (OWNER_PROFILE.targetRoles.some((tr) => first.toLowerCase().includes(tr))) {
        if (!title) title = first;
        if (!company) company = second;
      }
    }
  }

  // Fallback company from URL slug (Greenhouse, Lever, Ashby)
  if (!company && candidateUrl) {
    const urlCompany = extractCompanyFromUrl(candidateUrl);
    if (urlCompany) {
      company = urlCompany.charAt(0).toUpperCase() + urlCompany.slice(1);
    }
  }

  // Fallback title from known roles if title is still empty
  if (!title) {
    for (const tr of OWNER_PROFILE.targetRoles) {
      const reg = new RegExp(`\\b${tr}\\b`, "i");
      if (reg.test(cleanText)) {
        // Capitalize words
        title = tr
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        break;
      }
    }
  }

  // If still missing title, check the first line of the text
  if (!title) {
    const firstLine = cleanText.split("\n")[0].trim().replace(/^[*#\-_~]+|[*#\-_~]+$/g, "");
    if (firstLine.length >= 3 && firstLine.length <= 60 && containsJobSignal(firstLine)) {
      title = firstLine;
    }
  }

  if (!title) {
    return null;
  }

  if (!company) {
    company = "Unknown Company";
  }

  // Check remote hints in text or location
  const isRemote =
    /\b(remote|work from home|wfh|anywhere|telecommute)\b/i.test(location || "") ||
    /\b(remote|work from home|wfh|anywhere|telecommute)\b/i.test(cleanText);

  return {
    title,
    company,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    url: candidateUrl,
    contact_email: contactEmail,
    description: cleanText.length > 8000 ? cleanText.slice(0, 8000) : cleanText,
    source: context.source,
    inbound_raw: context.inboundRaw,
    inbound_source: context.source,
    isRemote,
  };
}

/**
 * Routes parsed candidates through classification (title, exp, geo, language, freshness)
 * and deduplicates against DB and intra-batch before upserting into repository.
 */
export async function processAndIngestInboundCandidates(
  candidates: InboundCandidate[],
  repo: JobsRepository,
  options?: { maxAgeDays?: number }
): Promise<IngestResult> {
  const result: IngestResult = {
    added: 0,
    duplicates: 0,
    filtered: 0,
    jobs: [],
  };

  const maxAgeDays = options?.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;
  const seenUrls = new Set<string>();

  for (const candidate of candidates) {
    const normUrl = normalizeUrl(candidate.url);

    // Intra-batch duplicate check
    if (seenUrls.has(normUrl)) {
      result.duplicates++;
      continue;
    }
    seenUrls.add(normUrl);

    // DB duplicate check
    if (typeof repo.hasJobWithUrl === "function") {
      const exists = (await repo.hasJobWithUrl(candidate.url)) || (await repo.hasJobWithUrl(normUrl));
      if (exists) {
        result.duplicates++;
        continue;
      }
    }

    // Hash sourceId from normalized URL
    const sourceId = createHash("sha256").update(normUrl).digest("hex").slice(0, 24);

    const normalizedJob: NormalizedJob = {
      source: candidate.source || "inbound",
      sourceId,
      url: normUrl,
      title: candidate.title,
      company: candidate.company,
      location: candidate.location || "Remote",
      remoteScope: candidate.isRemote ? "Worldwide" : "",
      description: candidate.description,
      postedAt: candidate.posted_at || new Date().toISOString(),
      tags: [],
      contactEmail: candidate.contact_email,
      applyUrl: candidate.url,
      isRemote: candidate.isRemote,
      inboundRaw: candidate.inbound_raw,
      inboundSource: candidate.inbound_source,
    };

    // 1. Language classification
    const lang = detectLanguage(normalizedJob.title, normalizedJob.description);
    let filterReason: string | undefined;

    if (lang.language !== "English") {
      filterReason = `Non-English posting (${lang.language})`;
    }

    // 2. Freshness check
    if (!filterReason && isJobStale(normalizedJob.postedAt, null, maxAgeDays)) {
      filterReason = `Stale posting (older than ${maxAgeDays} days)`;
    }

    // 3. Title check
    if (!filterReason && isExcludedTitle(normalizedJob.title)) {
      filterReason = "Excluded title (senior/management or non-engineering)";
    }

    // 4. Experience classification
    const ruleExp = classifyExperience(normalizedJob.title, normalizedJob.description);
    if (!filterReason && ruleExp.expClass === "senior") {
      filterReason = ruleExp.reason || "Senior experience required";
    }

    // 5. Geo classification
    const ruleGeo = classifyGeo(
      normalizedJob.title,
      normalizedJob.location,
      normalizedJob.remoteScope,
      normalizedJob.description,
      { isRemote: normalizedJob.isRemote }
    );
    if (!filterReason && ruleGeo.geo === "restricted") {
      filterReason = ruleGeo.reason || "Geographically restricted";
    }

    // 6. Score match
    const ruleScore = scoreMatch({
      title: normalizedJob.title,
      description: normalizedJob.description,
      tags: normalizedJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    if (!filterReason && ruleScore.score < 25) {
      filterReason = "Low relevance score";
    }

    const triaged: TriagedJobResult = {
      expClass: ruleExp.expClass,
      expMinYears: ruleExp.minYears,
      geoEligibility: ruleGeo.geo,
      geoReason: ruleGeo.reason,
      summaryLine: `${normalizedJob.title} at ${normalizedJob.company}`,
      skills: ruleScore.matchedSkills,
      filterReason,
      matchScore: ruleScore.score,
      triagedAt: new Date().toISOString(),
      descriptionHash: createHash("sha256").update(normalizedJob.description).digest("hex"),
      llmSkipped: "irrelevant",
    };

    const upsertRes = await repo.upsertJob(normalizedJob, triaged);
    if (upsertRes === "new") {
      result.added++;
    } else {
      result.duplicates++;
    }

    if (filterReason) {
      result.filtered++;
    }

    // Fetch the stored job if available
    const stored = await repo.getJob(normalizedJob.source, normalizedJob.sourceId);
    if (stored) {
      result.jobs.push(stored);
    }
  }

  return result;
}
