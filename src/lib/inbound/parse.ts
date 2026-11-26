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
  contact_url?: string;
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
 * and stripping tracking query parameters (utm_*, rcm, highlightedUpdate*, origin, ref, trk, etc.).
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
        lower.startsWith("highlightedupdate") ||
        lower === "rcm" ||
        lower === "origin" ||
        lower === "ref" ||
        lower === "trk" ||
        lower === "refid" ||
        lower === "trackingid" ||
        lower === "source" ||
        lower === "sid" ||
        lower === "spid" ||
        lower === "src" ||
        lower === "track" ||
        lower === "qp" ||
        lower === "clk" ||
        lower === "click"
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
 * Resolves tracking and redirect URLs (e.g. Naukri tracking links, email click trackers)
 * by extracting destination URL from query parameters without making any network requests.
 * Strips tracking parameters from the resulting URL.
 */
export function resolveTrackingUrl(rawHref: string): string {
  let url = rawHref.trim();
  try {
    const parsed = new URL(url);
    const redirectParamNames = [
      "targeturl",
      "target_url",
      "url",
      "dest",
      "destination",
      "redirect",
      "target",
      "link",
      "to",
      "clk",
    ];
    for (const [key, val] of parsed.searchParams.entries()) {
      if (redirectParamNames.includes(key.toLowerCase()) && /^https?:\/\//i.test(val)) {
        url = val;
        break;
      }
    }
  } catch {
    // If not a valid URL, use raw string
  }

  return normalizeUrl(url);
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
 * Strips trailing company-size suffixes (e.g. " / 51-200 Employees", " · 11-50 employees", " (201-500 Employees)")
 * and similar newsletter metadata noise (ratings, funding stage, hiring status) from company names.
 */
export function cleanCompanyName(raw: string): string {
  if (!raw) return "";
  let out = raw.trim();

  let prev = "";
  while (out !== prev) {
    prev = out;
    // 1. Trailing size suffix after slash, pipe, middot, bullet, dash, or in parentheses/brackets
    out = out
      .replace(
        /(?:\s*[\/|·•\-\u2013\u2014]\s*|\s*[\(\[]\s*)\d[\d,]*(?:\s*(?:-\s*|\u2013\s*|to\s*)\d[\d,]*|\+)?\s*(?:employees?|people|staff|team\s+members?|headcount)[\)\]]?\s*$/i,
        ""
      )
      .trim();

    // 2. Trailing funding / stage / hiring status suffix after separator
    out = out
      .replace(
        /\s*[\/|·•]\s*(?:pre-seed|seed|series\s+[a-z0-9+]+|bootstrapped|public|ipo|actively\s+hiring|growing\s+fast|early\s+stage|growth\s+stage|late\s+stage)\s*$/i,
        ""
      )
      .trim();

    // 3. Trailing ratings / reviews noise
    out = out
      .replace(
        /(?:\s*[\/|·•\-\u2013\u2014])?\s*[\(\[]?\d\.\d\s*(?:★|⭐|stars?|\/5)(?:\s*[\(\[]?\d[\d,]*\+?\s*reviews?[\)\]]?)?[\)\]]?\s*$/i,
        ""
      )
      .trim();
  }

  out = out.replace(/[\s\/|·•\-\u2013\u2014,;:]+$/g, "").trim();
  return out;
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
 * Extracts multiple job candidates from structured HTML newsletters and digests
 * (Naukri alerts, LinkedIn job alerts, Wellfound digests).
 */
export function extractNewsletterHtmlCandidates(
  html: string,
  options?: { source?: string; defaultLocation?: string }
): InboundCandidate[] {
  const source = options?.source || "email";
  const candidates: InboundCandidate[] = [];
  const seenNormUrls = new Set<string>();

  // 1. Try block-level extraction: table rows (<tr>...</tr>), list items (<li>...</li>), or articles/sections
  const blockRegex = /<(?:tr|li|article|section)\b[^>]*>([\s\S]*?)<\/(?:tr|li|article|section)>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const blockHtml = match[1];
    const blockText = stripHtml(blockHtml).trim();
    if (blockText.length < 5) continue;

    // Search for anchor tags in this block
    const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorRegex.exec(blockHtml)) !== null) {
      const rawHref = anchorMatch[1];
      const anchorText = cleanTitle(stripHtml(anchorMatch[2]));

      if (!/^https?:\/\//i.test(rawHref)) continue;
      if (isInvalidTitleLine(anchorText) || anchorText.length < 3) continue;

      const resolvedUrl = resolveTrackingUrl(rawHref);
      const normUrl = normalizeUrl(resolvedUrl);
      if (seenNormUrls.has(normUrl)) continue;

      const isJobLink =
        /job-listings|jobs\/view|\/jobs\/|\/job\/|wellfound\.com|angel\.co|greenhouse\.io|lever\.co|ashbyhq\.com|careers/i.test(resolvedUrl) ||
        containsJobSignal(anchorText) ||
        containsJobSignal(blockText);

      if (!isJobLink) continue;

      const lines = blockText.split(/\r?\n/).map((l) => cleanTitle(l)).filter(Boolean);
      let title = anchorText;
      let company = "";
      let location = options?.defaultLocation;

      // Extract company and location from remaining lines
      for (const line of lines) {
        if (line === title) continue;
        if (isInvalidTitleLine(line)) continue;
        if (/remote|onsite|hybrid|india|bengaluru|mumbai|delhi|hyderabad|pune|gurgaon|noida|chennai/i.test(line)) {
          if (!location) location = line;
        } else if (!company && line.length < 80) {
          const cleaned = cleanCompanyName(line);
          if (cleaned && cleaned.length < 50) {
            company = cleaned;
          }
        }
      }

      if (!company) {
        const atMatch = title.match(/^(.+?)\s+at\s+([A-Za-z0-9&.\-_ /|·•()]+)$/i);
        if (atMatch) {
          title = cleanTitle(atMatch[1]);
          company = cleanCompanyName(atMatch[2]);
        }
      }

      company = cleanCompanyName(company);
      if (!company) {
        company = extractCompanyFromUrl(resolvedUrl) || "Job Alert";
      }

      if (title && !isInvalidTitleLine(title)) {
        seenNormUrls.add(normUrl);
        candidates.push({
          title,
          company,
          location,
          url: resolvedUrl,
          description: blockText || `${title} at ${company}`,
          source,
          inbound_raw: blockHtml,
          isRemote: /remote/i.test(location || "") || /remote/i.test(blockText),
        });
      }
    }
  }

  return candidates;
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

  if (isHtml) {
    const newsletterCandidates = extractNewsletterHtmlCandidates(rawInput, {
      source,
      defaultLocation: options?.defaultLocation,
    });
    if (newsletterCandidates.length > 0) {
      return newsletterCandidates;
    }
  }

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
 * Strips emojis, pin symbols, trailing punctuation, and markdown formatting from titles.
 */
export function cleanTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  // Strip emojis, pictographs, symbols, pin emojis (📍, 📌, etc.)
  title = title.replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}]/gu, "").trim();
  // Strip trailing punctuation and symbols (: . , ; ! ? -)
  title = title.replace(/[:.,;!?-]+$/, "").trim();
  // Strip markdown markers (*, #, _, ~)
  title = title.replace(/^[*#\-_~]+|[*#\-_~]+$/g, "").trim();
  return title;
}

/**
 * Checks if a candidate line is an invalid title (action prompts, forms, DM requests).
 */
export function isInvalidTitleLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (
    /^(?:dm\b|fill\b|apply\b|click\b|link\b|open\b|register\b|submit\b|check\b|visit\b|note\b|details\b|call\b|contact\b)/i.test(
      lower
    )
  ) {
    return true;
  }
  if (
    lower.includes("hiring manager") ||
    lower.includes("fill this form") ||
    lower.includes("fill the form")
  ) {
    return true;
  }
  if (
    lower.includes("on linkedin") ||
    lower.includes("google form") ||
    lower.includes("microsoft form")
  ) {
    return true;
  }
  if (/^https?:\/\//i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Splits multi-job digests (WhatsApp message exports, numbered lists, blank-line-separated 'is Hiring' lines)
 * into distinct text segments.
 */
export function splitIntoJobSegments(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let prevLineWasBlank = false;

  const waHeaderRegex = /^(?:\[\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?\]|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?\s*-\s*[^:]+:)/i;
  const isHiringRegex = /^.+?\s+(?:is|are)\s+hiring\s+.+$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    const isWaHeader = waHeaderRegex.test(trimmed);
    // A new "X is hiring Y" line starts a new job after a blank line, or right after a link
    // (so a job's own link can never be handed to the next job in the same message).
    const currentHasUrl = currentBlock.some((l) => /https?:\/\//i.test(l));
    const isNewHiringLine = (prevLineWasBlank || currentHasUrl) && isHiringRegex.test(trimmed);

    if ((isWaHeader || isNewHiringLine) && currentBlock.length > 0) {
      const blockStr = currentBlock.join("\n").trim();
      if (blockStr.length > 10) {
        blocks.push(blockStr);
      }
      currentBlock = [];
    }

    currentBlock.push(line);
    prevLineWasBlank = trimmed.length === 0;
  }

  if (currentBlock.length > 0) {
    const blockStr = currentBlock.join("\n").trim();
    if (blockStr.length > 10) {
      blocks.push(blockStr);
    }
  }

  if (blocks.length > 1) {
    return blocks;
  }

  // If no multi-block found above, check for numbered lists (e.g. "1. ... \n2. ...")
  const allUrls = text.match(URL_REGEX) || [];
  if (allUrls.length > 1) {
    const numberedSplit = text.split(/(?:^|\n)(?:\d+\.|\([0-9]+\)|•|\*|-)\s+/m).filter((s) => s.trim().length > 20);
    if (numberedSplit.length > 1 && numberedSplit.length <= allUrls.length + 1) {
      return numberedSplit;
    }
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
  const allUrls = cleanText.match(URL_REGEX) || [];
  const emails = cleanText.match(EMAIL_REGEX) || [];

  let formUrl: string | undefined;
  let postUrl: string | undefined;
  let otherApplyUrl: string | undefined;
  let contactUrl: string | undefined;

  for (const rawUrl of allUrls) {
    const norm = normalizeUrl(rawUrl);
    const lower = norm.toLowerCase();

    // Check if it's a contact profile link (e.g. linkedin.com/in/, example.com/in/)
    const isContactLink =
      lower.includes("linkedin.com/in/") ||
      /\/in\/[a-z0-9_-]+/i.test(norm) ||
      lower.includes("twitter.com/") ||
      lower.includes("x.com/");

    if (isContactLink) {
      if (!contactUrl) contactUrl = norm;
      continue;
    }

    // Check if it's a form or direct ATS link
    const isFormOrAts =
      lower.includes("forms.cloud.microsoft") ||
      lower.includes("forms.office.com") ||
      lower.includes("docs.google.com/forms") ||
      lower.includes("forms.gle") ||
      lower.includes("oraclecloud.com") ||
      lower.includes("greenhouse.io") ||
      lower.includes("lever.co") ||
      lower.includes("ashbyhq.com") ||
      lower.includes("myworkdayjobs.com");

    if (isFormOrAts) {
      if (!formUrl) formUrl = norm;
      continue;
    }

    // Check if it's a LinkedIn post / feed update link
    const isPostLink = lower.includes("linkedin.com/posts/") || lower.includes("linkedin.com/feed/update/");
    if (isPostLink) {
      if (!postUrl) postUrl = norm;
      continue;
    }

    // Other general HTTP link
    if (!otherApplyUrl) otherApplyUrl = norm;
  }

  // Priority for candidateUrl: formUrl > otherApplyUrl > postUrl > contactUrl > synthetic urn
  let candidateUrl = formUrl || otherApplyUrl || postUrl || "";
  if (!candidateUrl && context.htmlLinks.length > 0) {
    for (const link of context.htmlLinks) {
      const norm = normalizeUrl(link.href);
      if (!norm.includes("/in/")) {
        candidateUrl = norm;
        break;
      }
    }
  }

  const contactEmail = emails[0] || undefined;

  if (!candidateUrl) {
    if (contactEmail) {
      candidateUrl = `mailto:${contactEmail}`;
    } else if (contactUrl) {
      candidateUrl = contactUrl;
    } else {
      const hash = createHash("sha256").update(cleanText).digest("hex").slice(0, 16);
      candidateUrl = `urn:inbound:${hash}`;
    }
  }

  let title = "";
  let company = "";
  let location: string | undefined = context.defaultLocation;

  // Title / Company Heuristics
  // 0. Primary rule: first line matching /^(.+?)\s+(?:is|are)\s+hiring\s+(.+)$/i gives company and title
  const rawLines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of rawLines) {
    const isHiringMatch = line.match(/^(.+?)\s+(?:is|are)\s+hiring\s+(.+)$/i);
    if (isHiringMatch) {
      const rawComp = isHiringMatch[1].trim().replace(/^[*#\-_~]+|[*#\-_~]+$/g, "").trim();
      const rawTit = cleanTitle(isHiringMatch[2]);
      if (rawComp && rawTit && !isInvalidTitleLine(rawTit)) {
        company = rawComp;
        title = rawTit;
        break;
      }
    }
  }

  // 1. Explicit labels: "Role: ...", "Title: ...", "Position: ..."
  if (!title) {
    const roleMatch = cleanText.match(/(?:Role|Job Title|Title|Position)\s*:\s*([^\n\r,;|]+)/i);
    if (roleMatch) {
      const cand = cleanTitle(roleMatch[1]);
      if (!isInvalidTitleLine(cand)) {
        title = cand;
      }
    }
  }

  // 2. Explicit company labels: "Company: ...", "Organization: ..."
  if (!company) {
    const companyMatch = cleanText.match(/(?:Company|Organization|Org)\s*:\s*([^\n\r,;|]+)/i);
    if (companyMatch) {
      company = companyMatch[1].trim().replace(/^[*#\-_~]+|[*#\-_~]+$/g, "").trim();
    }
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
      const candTit = cleanTitle(hiringAtMatch[1]);
      const candComp = hiringAtMatch[2].replace(/[*!.,;]+$/, "").trim();
      if (!title && !isInvalidTitleLine(candTit)) title = candTit;
      if (!company) company = candComp;
    }
  }

  // 5. "[Company] is hiring [Title]" or "[Company] is looking for [Title]" (inline fallback)
  if (!title || !company) {
    const isHiringMatch = cleanText.match(
      /([A-Za-z0-9&.\s'-]+?)\s+is\s+(?:hiring|looking for)\s+(?:an?\s+)?([^,\n\r;|.]+)/i
    );
    if (isHiringMatch) {
      const candComp = isHiringMatch[1].trim();
      const candTit = cleanTitle(isHiringMatch[2]);
      if (!company) company = candComp;
      if (!title && !isInvalidTitleLine(candTit)) title = candTit;
    }
  }

  // 6. "[Title] at [Company]" / "[Title] @ [Company]" (within single line)
  if (!title || !company) {
    const titleAtMatch = cleanText.match(
      /^[ \t*#]*([A-Za-z0-9\s/+#.-]{3,40}?)[ \t]+(?:at|@)[ \t]+([A-Za-z0-9&. '-]{2,30})/im
    );
    if (titleAtMatch) {
      const candidateTitle = cleanTitle(titleAtMatch[1]);
      const candidateCompany = titleAtMatch[2].trim();
      if (!title && !isInvalidTitleLine(candidateTitle)) title = candidateTitle;
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
      const l1 = cleanTitle(lines[0]);
      const l2 = lines[1];
      // If line 1 matches a known role or job keyword and is concise
      if (
        l1.length <= 50 &&
        containsJobSignal(l1) &&
        !isInvalidTitleLine(l1) &&
        l2.length <= 40 &&
        !containsJobSignal(l2)
      ) {
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
      const candTit = cleanTitle(pipeMatch[2]);
      if (!company) company = pipeMatch[1].trim();
      if (!title && !isInvalidTitleLine(candTit)) title = candTit;
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
      const second = cleanTitle(dashMatch[2]);
      // If second looks like a target role
      if (OWNER_PROFILE.targetRoles.some((tr) => second.toLowerCase().includes(tr))) {
        if (!company) company = first;
        if (!title && !isInvalidTitleLine(second)) title = second;
      } else if (OWNER_PROFILE.targetRoles.some((tr) => first.toLowerCase().includes(tr))) {
        if (!title && !isInvalidTitleLine(cleanTitle(first))) title = cleanTitle(first);
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
    const firstLine = cleanTitle(cleanText.split("\n")[0]);
    if (
      firstLine.length >= 3 &&
      firstLine.length <= 60 &&
      containsJobSignal(firstLine) &&
      !isInvalidTitleLine(firstLine)
    ) {
      title = firstLine;
    }
  }

  if (!title) {
    return null;
  }

  company = cleanCompanyName(company);
  if (!company) {
    company = "Unknown Company";
  }

  // Check remote hints in text or location
  const isRemote =
    /\b(remote|work from home|wfh|anywhere|telecommute)\b/i.test(location || "") ||
    /\b(remote|work from home|wfh|anywhere|telecommute)\b/i.test(cleanText);

  // If contactUrl exists and is not present in description text, append it
  let descriptionText = cleanText;
  if (contactUrl && !descriptionText.includes(contactUrl)) {
    descriptionText = `${descriptionText}\nContact: ${contactUrl}`;
  }

  return {
    title,
    company,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    url: candidateUrl,
    contact_email: contactEmail,
    contact_url: contactUrl,
    description: descriptionText.length > 8000 ? descriptionText.slice(0, 8000) : descriptionText,
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
      contactUrl: candidate.contact_url,
      applyUrl: candidate.url,
      isRemote: candidate.isRemote,
      inboundRaw: candidate.inbound_raw,
      inboundSource: candidate.inbound_source,
    };

    const isInbox =
      (candidate.inbound_source && ["telegram", "whatsapp", "pasted", "paste"].includes(candidate.inbound_source)) ||
      ["telegram", "whatsapp", "pasted", "paste"].includes(candidate.source);

    // 1. Language classification
    const lang = detectLanguage(normalizedJob.title, normalizedJob.description);
    let filterReason: string | undefined;

    if (lang.language !== "English") {
      filterReason = `Non-English posting (${lang.language})`;
    }

    // 2. Freshness check (10 days default for inbox from message time if available)
    const effectiveMaxAge = isInbox ? 10 : maxAgeDays;
    if (!filterReason && isJobStale(normalizedJob.postedAt, null, effectiveMaxAge)) {
      filterReason = `Stale posting (older than ${effectiveMaxAge} days)`;
    }

    // 3. Title check: senior or non-engineering title rule applied only to final parsed title
    if (!filterReason && isExcludedTitle(normalizedJob.title)) {
      filterReason = "Excluded title (senior/management or non-engineering)";
    }

    // Experience and Geo classification
    const ruleExp = classifyExperience(normalizedJob.title, normalizedJob.description);
    const ruleGeo = classifyGeo(
      normalizedJob.title,
      normalizedJob.location,
      normalizedJob.remoteScope,
      normalizedJob.description,
      { isRemote: normalizedJob.isRemote }
    );

    const ruleScore = scoreMatch({
      title: normalizedJob.title,
      description: normalizedJob.description,
      tags: normalizedJob.tags,
      expClass: ruleExp.expClass,
      geoEligibility: ruleGeo.geo,
    });

    // Non-inbox jobs undergo full experience, geo, and score filtering
    // Inbox jobs skip the geo/onsite filter and low match score filter
    if (!isInbox) {
      if (!filterReason && ruleExp.expClass === "senior") {
        filterReason = ruleExp.reason || "Senior experience required";
      }

      if (!filterReason && ruleGeo.geo === "restricted") {
        filterReason = ruleGeo.reason || "Geographically restricted";
      }

      if (!filterReason && ruleScore.score < 25) {
        filterReason = "Low relevance score";
      }
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
