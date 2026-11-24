import { getSql, hasDatabaseUrl } from "../db";
import { NormalizedJob } from "./types";
import { TriagedJobResult } from "../llm/triage";
import { calculateJobAgeDays } from "./freshness";
import { MAX_AGE_DAYS_DEFAULT } from "../../config/job-profile";
import {
  classifyGeo,
  classifyExperience,
  hasRealDescription,
  getMissingDescriptionNote,
} from "./classify";
import { safeFetch, SafeFetchOptions, SafeFetchResult } from "../inbound/safe-fetch";

export interface StoredJob {
  id: string;
  source: string;
  source_id: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remote_scope: string | null;
  description: string | null;
  posted_at: string | null;
  fetched_at: string;
  exp_min_years: number | null;
  exp_class: "fresher" | "junior" | "unclear" | "senior";
  geo_eligibility: "worldwide" | "india_ok" | "restricted" | "unclear";
  geo_reason: string | null;
  skills: string[];
  filter_reason: string | null;
  summary_line: string | null;
  match_score: number | null;
  status: "new" | "shortlisted" | "skipped" | "applied";
  raw: unknown;
  last_seen_at: string;
  triaged_at?: string | null;
  contact_email?: string | null;
  contact_url?: string | null;
  apply_url?: string | null;
  inbound_raw?: string | null;
  inbound_source?: string | null;
}

export interface SourceStatusInfo {
  status: "ok" | "pending" | "error" | "skipped" | string;
  count: number;
  error?: string;
  note?: string;
  seen?: number;
  fromKnownSender?: number;
  fromFallbackSubject?: number;
  parsedJobs?: number;
  collected?: boolean;
  [key: string]: unknown;
}

export interface SearchRunStats {
  llmCalls: number;
  llmErrors: number;
  llmSkippedStale: number;
  llmSkippedAlready?: number;
  llmSkippedIrrelevant?: number;
  shortlistCount: number;
  hiddenCount: number;
  languageHidden: number;
  boardsTotal?: number;
  boardsDone?: number;
  boardErrors?: Record<string, string>;
  apifyRunId?: string;
  apifyDatasetId?: string;
  apifyStartedAt?: string;
  apifyStatus?: string;
  apifyCollected?: boolean;
  apifyCount?: number;
  apifyNote?: string;
  apifyError?: string;
  sources?: Record<string, SourceStatusInfo>;
}

export interface SearchRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  source_counts: Record<string, number>;
  new_jobs: number;
  filtered_out: number;
  error: string | null;
  stats?: SearchRunStats | null;
}

export interface JobsQueryOptions {
  view?: "shortlist" | "maybe" | "inbox" | "all" | "hidden";
  source?: string;
  q?: string;
  status?: string;
  maxAgeDays?: number;
  limit?: number;
  offset?: number;
}

export interface ReclassifyOptions {
  timeBudgetMs?: number;
  clock?: () => number;
  batchSize?: number;
  classifyFn?: typeof classifyGeo;
  classifyExpFn?: typeof classifyExperience;
}

export interface CustomBoard {
  id: string;
  kind: "greenhouse" | "lever" | "ashby";
  slug: string;
  label?: string | null;
  created_at?: string;
}

export interface ReclassifyResult {
  updated: number;
  remaining: number;
  error?: boolean;
}

export interface EnrichDescriptionsOptions {
  maxJobs?: number;
  fetchTimeoutMs?: number;
  timeBudgetMs?: number;
  maxAttempts?: number;
  maxAgeDays?: number;
  clock?: () => number;
  fetcherFn?: (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;
}

export interface EnrichDescriptionsResult {
  attempted: number;
  enriched: number;
  movedToSenior: number;
  movedToShortlist: number;
  failed: number;
  remaining: number;
}

/**
 * Returns true if the URL is a public https:// URL eligible for description enrichment.
 * Skips linkedin.com and indeed.com (login walls).
 */
export function isEnrichablePublicHttpsUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr) return false;
  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return false;
  if (host === "indeed.com" || host.endsWith(".indeed.com")) return false;
  return true;
}

/**
 * Strips HTML tags, scripts, styles, comments, and entities down to plain text, keeping up to maxChars.
 */
export function stripHtmlToPlainText(html: string, maxChars = 6000): string {
  if (!html) return "";
  let text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }
  return text;
}

export interface JobsRepository {
  upsertJob(job: NormalizedJob, triaged: TriagedJobResult): Promise<"new" | "existing">;
  hasJobWithUrl?(url: string): Promise<boolean>;
  getJob(source: string, sourceId: string): Promise<StoredJob | null>;
  getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }>;
  getViewCounts(
    maxAgeDays?: number
  ): Promise<{ shortlist: number; maybe: number; inbox: number; hidden: number; all: number }>;
  reclassifyUnclearJobs?(opts?: ReclassifyOptions): Promise<ReclassifyResult>;
  reclassifyInboxJobs?(opts?: ReclassifyOptions): Promise<ReclassifyResult>;
  reclassifyLinkedInJobs?(opts?: ReclassifyOptions): Promise<ReclassifyResult>;
  enrichMissingDescriptions?(opts?: EnrichDescriptionsOptions): Promise<EnrichDescriptionsResult>;
  getStats(): Promise<{
    jobsFound: number;
    newToday: number;
    applied: number;
    replies: number;
    visits: number;
  }>;
  updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean>;
  createSearchRun(): Promise<string>;
  updateSearchRun(
    id: string,
    updates: Partial<SearchRun>
  ): Promise<void>;
  getSearchRun(id: string): Promise<SearchRun | null>;
  getLastSearchRun(): Promise<SearchRun | null>;
  getLastSearchRuns?(limit?: number): Promise<SearchRun[]>;
  getCustomBoards?(): Promise<CustomBoard[]>;
  addCustomBoard?(board: { kind: "greenhouse" | "lever" | "ashby"; slug: string; label?: string }): Promise<CustomBoard>;
  deleteCustomBoard?(id: string): Promise<boolean>;
}

// In-Memory implementation for tests or when DB is not configured
export class InMemoryJobsRepository implements JobsRepository {
  private jobs = new Map<string, StoredJob>();
  private runs = new Map<string, SearchRun>();
  private customBoards = new Map<string, CustomBoard>();

  async upsertJob(
    job: NormalizedJob,
    triaged: TriagedJobResult
  ): Promise<"new" | "existing"> {
    const key = `${job.source}:${job.sourceId}`;
    const existing = this.jobs.get(key);
    const nowIso = new Date().toISOString();

    if (existing) {
      existing.title = job.title;
      existing.company = job.company;
      existing.location = job.location;
      existing.remote_scope = job.remoteScope;
      existing.description = job.description;
      existing.posted_at = job.postedAt;
      existing.exp_min_years = triaged.expMinYears;
      existing.exp_class = triaged.expClass;
      existing.geo_eligibility = triaged.geoEligibility;
      existing.geo_reason = triaged.geoReason;
      existing.skills = triaged.skills;
      existing.filter_reason = triaged.filterReason || null;
      existing.summary_line = triaged.summaryLine;
      existing.match_score = triaged.matchScore;
      existing.last_seen_at = nowIso;
      if (triaged.triagedAt) existing.triaged_at = triaged.triagedAt;
      if (job.contactEmail) existing.contact_email = job.contactEmail;
      if (job.contactUrl) existing.contact_url = job.contactUrl;
      if (job.applyUrl) existing.apply_url = job.applyUrl;
      if (job.inboundRaw) existing.inbound_raw = job.inboundRaw;
      if (job.inboundSource) existing.inbound_source = job.inboundSource;
      return "existing";
    }

    const stored: StoredJob = {
      id: `mem-${this.jobs.size + 1}`,
      source: job.source,
      source_id: job.sourceId,
      url: job.url,
      title: job.title,
      company: job.company,
      location: job.location,
      remote_scope: job.remoteScope,
      description: job.description,
      posted_at: job.postedAt,
      fetched_at: nowIso,
      exp_min_years: triaged.expMinYears,
      exp_class: triaged.expClass,
      geo_eligibility: triaged.geoEligibility,
      geo_reason: triaged.geoReason,
      skills: triaged.skills,
      filter_reason: triaged.filterReason || null,
      summary_line: triaged.summaryLine,
      match_score: triaged.matchScore,
      status: "new",
      raw: { ...job, descriptionHash: triaged.descriptionHash },
      last_seen_at: nowIso,
      triaged_at: triaged.triagedAt || null,
      contact_email: job.contactEmail || null,
      contact_url: job.contactUrl || null,
      apply_url: job.applyUrl || job.url,
      inbound_raw: job.inboundRaw || null,
      inbound_source: job.inboundSource || null,
    };

    this.jobs.set(key, stored);
    return "new";
  }

  async hasJobWithUrl(url: string): Promise<boolean> {
    const norm = url.trim().toLowerCase();
    for (const j of this.jobs.values()) {
      if (
        j.url.trim().toLowerCase() === norm ||
        (j.apply_url && j.apply_url.trim().toLowerCase() === norm)
      ) {
        return true;
      }
    }
    return false;
  }

  async getJob(source: string, sourceId: string): Promise<StoredJob | null> {
    const key = `${source}:${sourceId}`;
    return this.jobs.get(key) || null;
  }

  async getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }> {
    let list = Array.from(this.jobs.values());
    const view = opts.view || "shortlist";
    const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;

    const isInboxJob = (j: StoredJob) =>
      Boolean(
        (j.inbound_source && ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source)) ||
        ["telegram", "whatsapp", "pasted", "paste"].includes(j.source)
      );

    if (view === "shortlist") {
      list = list.filter((j) => {
        if (isInboxJob(j)) return false;
        const isNotSkipped = j.status !== "skipped";
        const hasValidExp =
          ["fresher", "junior"].includes(j.exp_class) ||
          (j.exp_class === "unclear" && hasRealDescription(j.description, j.title, j.company));
        const hasValidGeo = ["worldwide", "india_ok"].includes(j.geo_eligibility);
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isFresh = age <= maxAgeDays;
        const noFilter = !j.filter_reason;
        return isNotSkipped && hasValidExp && hasValidGeo && isFresh && noFilter;
      });
      list.sort((a, b) => {
        const scoreDiff = (b.match_score ?? 0) - (a.match_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const timeB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return timeB - timeA;
      });
    } else if (view === "maybe") {
      list = list.filter((j) => {
        if (isInboxJob(j)) return false;
        const isNotSkipped = j.status !== "skipped";
        const isMissingDescMaybe =
          j.exp_class === "unclear" &&
          !hasRealDescription(j.description, j.title, j.company) &&
          ["worldwide", "india_ok"].includes(j.geo_eligibility);
        const isUnclearGeoRemote =
          ["fresher", "junior", "unclear"].includes(j.exp_class) &&
          j.geo_eligibility === "unclear" &&
          Boolean(j.geo_reason && j.geo_reason.startsWith("remote-unconfirmed:"));
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isFresh = age <= maxAgeDays;
        const noFilter = !j.filter_reason;
        return isNotSkipped && (isUnclearGeoRemote || isMissingDescMaybe) && isFresh && noFilter;
      });
      list.sort((a, b) => {
        const scoreDiff = (b.match_score ?? 0) - (a.match_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const timeB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return timeB - timeA;
      });
    } else if (view === "inbox") {
      list = list.filter((j) => {
        if (!isInboxJob(j)) return false;
        const isNotSkipped = j.status !== "skipped";
        const noFilter = !j.filter_reason;
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isFresh = age <= maxAgeDays;
        return isNotSkipped && noFilter && isFresh;
      });
      list.sort((a, b) => {
        const timeA = a.posted_at ? new Date(a.posted_at).getTime() : new Date(a.fetched_at).getTime();
        const timeB = b.posted_at ? new Date(b.posted_at).getTime() : new Date(b.fetched_at).getTime();
        return timeB - timeA;
      });
    } else if (view === "hidden") {
      list = list.filter((j) => {
        if (isInboxJob(j)) return false;
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isOlder = age > maxAgeDays;
        const isUnclearNonRemote =
          j.geo_eligibility === "unclear" && (!j.geo_reason || !j.geo_reason.startsWith("remote-unconfirmed:"));
        return (
          j.exp_class === "senior" ||
          j.geo_eligibility === "restricted" ||
          isUnclearNonRemote ||
          j.status === "skipped" ||
          Boolean(j.filter_reason) ||
          isOlder
        );
      });
    } else {
      // "all" view: also filter by maxAgeDays
      list = list.filter((j) => {
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        return age <= maxAgeDays;
      });
    }

    if (opts.source && opts.source.trim()) {
      const srcLower = opts.source.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.source.toLowerCase() === srcLower ||
          Boolean(j.inbound_source && j.inbound_source.toLowerCase() === srcLower)
      );
    }

    if (opts.status && opts.status.trim()) {
      const st = opts.status.trim();
      list = list.filter((j) => j.status === st);
    }

    if (opts.q && opts.q.trim()) {
      const qLower = opts.q.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(qLower) ||
          j.company.toLowerCase().includes(qLower) ||
          (Array.isArray(j.skills) && j.skills.some((s) => s.toLowerCase().includes(qLower)))
      );
    }

    const total = list.length;
    const offset = opts.offset || 0;
    const limit = opts.limit || 50;
    const paginated = list.slice(offset, offset + limit);

    return { jobs: paginated, total };
  }

  async getViewCounts(
    maxAgeDays: number = MAX_AGE_DAYS_DEFAULT
  ): Promise<{ shortlist: number; maybe: number; inbox: number; hidden: number; all: number }> {
    const list = Array.from(this.jobs.values());
    let shortlist = 0;
    let maybe = 0;
    let inbox = 0;
    let hidden = 0;
    let all = 0;

    for (const j of list) {
      const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
      const isInbox =
        (j.inbound_source && ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source)) ||
        ["telegram", "whatsapp", "pasted", "paste"].includes(j.source);

      if (isInbox) {
        if (j.status !== "skipped" && !j.filter_reason && age <= maxAgeDays) {
          inbox++;
        }
      } else {
        const hasValidExp =
          ["fresher", "junior"].includes(j.exp_class) ||
          (j.exp_class === "unclear" && hasRealDescription(j.description, j.title, j.company));

        const isShortlistCandidate =
          hasValidExp &&
          ["worldwide", "india_ok"].includes(j.geo_eligibility) &&
          j.status !== "skipped" &&
          !j.filter_reason;

        const isMissingDescMaybe =
          j.exp_class === "unclear" &&
          !hasRealDescription(j.description, j.title, j.company) &&
          ["worldwide", "india_ok"].includes(j.geo_eligibility);

        const isUnclearGeoRemote =
          ["fresher", "junior", "unclear"].includes(j.exp_class) &&
          j.geo_eligibility === "unclear" &&
          Boolean(j.geo_reason && j.geo_reason.startsWith("remote-unconfirmed:"));

        const isMaybeCandidate =
          (isUnclearGeoRemote || isMissingDescMaybe) &&
          j.status !== "skipped" &&
          !j.filter_reason;

        const isHiddenCandidate =
          j.exp_class === "senior" ||
          j.geo_eligibility === "restricted" ||
          (j.geo_eligibility === "unclear" && (!j.geo_reason || !j.geo_reason.startsWith("remote-unconfirmed:"))) ||
          j.status === "skipped" ||
          Boolean(j.filter_reason) ||
          age > maxAgeDays;

        if (isShortlistCandidate && age <= maxAgeDays) {
          shortlist++;
        }
        if (isMaybeCandidate && age <= maxAgeDays) {
          maybe++;
        }
        if (isHiddenCandidate) {
          hidden++;
        }
      }

      if (age <= maxAgeDays) {
        all++;
      }
    }

    return { shortlist, maybe, inbox, hidden, all };
  }

  async reclassifyInboxJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const startTime = clock();

    const candidates = Array.from(this.jobs.values()).filter((j) => {
      const isInbox =
        (j.inbound_source && ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source)) ||
        ["telegram", "whatsapp", "pasted", "paste"].includes(j.source);
      return isInbox;
    });

    let updated = 0;
    let remaining = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (clock() - startTime > timeBudgetMs) {
        remaining = candidates.length - i;
        break;
      }

      const job = candidates[i];
      let newFilterReason: string | null = null;

      // Import detectLanguage & isExcludedTitle dynamically or pass
      const { detectLanguage } = await import("./language");
      const { isExcludedTitle } = await import("../../config/job-profile");

      const lang = detectLanguage(job.title, job.description || "");
      if (lang.language !== "English") {
        newFilterReason = `Non-English posting (${lang.language})`;
      } else if (isExcludedTitle(job.title)) {
        newFilterReason = "Excluded title (senior/management or non-engineering)";
      }

      if (job.filter_reason !== newFilterReason) {
        job.filter_reason = newFilterReason;
        const key = `${job.source}:${job.source_id}`;
        this.jobs.set(key, job);
        updated++;
      }
    }

    return { updated, remaining };
  }

  async reclassifyUnclearJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const classifyFn = opts?.classifyFn ?? classifyGeo;
    const startTime = clock();

    // (a) SELECT only rows where geo_eligibility = 'unclear' AND
    // (geo_reason IS NULL OR (geo_reason NOT LIKE 'remote-unconfirmed:%' AND geo_reason NOT LIKE 'onsite:%'))
    const candidates = Array.from(this.jobs.values()).filter((j) => {
      if (j.geo_eligibility !== "unclear") return false;
      if (!j.geo_reason) return true;
      return (
        !j.geo_reason.startsWith("remote-unconfirmed:") &&
        !j.geo_reason.startsWith("onsite:")
      );
    });

    let updated = 0;
    let processedCount = 0;

    for (const j of candidates) {
      if (clock() - startTime >= timeBudgetMs) {
        break;
      }

      const rawObj = j.raw as Record<string, unknown> | undefined;
      const isRemote =
        (rawObj?.isRemote as boolean | undefined) ??
        (/\bremote\b/i.test(j.location || "") ||
          /\bremote\b/i.test(j.remote_scope || "") ||
          /\bremote\b/i.test(j.title || "") ||
          /\bremote\b/i.test(j.description || ""));
      const workplaceType = rawObj?.workplaceType as string | undefined;
      const reclassified = classifyFn(
        j.title || "",
        j.location || "",
        j.remote_scope || "",
        j.description || "",
        { isRemote, workplaceType }
      );

      const newFilterReason = reclassified.reason.startsWith("remote-unconfirmed:")
        ? null
        : reclassified.geo === "restricted"
        ? reclassified.reason
        : reclassified.reason.startsWith("onsite:")
        ? "location not remote / not confirmed for India"
        : null;

      // (b) Skip the UPDATE when geo, geo_reason and filter_reason would not change
      const changed =
        j.geo_eligibility !== reclassified.geo ||
        j.geo_reason !== reclassified.reason ||
        (j.filter_reason ?? null) !== (newFilterReason ?? null);

      if (changed) {
        j.geo_eligibility = reclassified.geo;
        j.geo_reason = reclassified.reason;
        j.filter_reason = newFilterReason;
        updated++;
      }

      processedCount++;
    }

    const remaining = candidates.length - processedCount;
    return { updated, remaining };
  }

  async reclassifyLinkedInJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const classifyExpFn = opts?.classifyExpFn ?? classifyExperience;
    const startTime = clock();

    const linkedinJobs = Array.from(this.jobs.values()).filter(
      (j) => j.source === "linkedin"
    );

    let updated = 0;
    let processedCount = 0;

    for (const j of linkedinJobs) {
      if (clock() - startTime >= timeBudgetMs) {
        break;
      }

      const reclassified = classifyExpFn(j.title || "", j.description || "", j.company);
      const hasNoDesc = !hasRealDescription(j.description, j.title, j.company);

      let newFilterReason = j.filter_reason;
      let newSummaryLine = j.summary_line;

      if (reclassified.expClass === "senior") {
        newFilterReason = reclassified.reason || "Senior experience required";
      } else if (reclassified.expClass === "unclear" && hasNoDesc) {
        newSummaryLine = getMissingDescriptionNote(j.source);
      }

      const changed =
        j.exp_class !== reclassified.expClass ||
        j.exp_min_years !== reclassified.minYears ||
        (j.filter_reason ?? null) !== (newFilterReason ?? null) ||
        (j.summary_line ?? null) !== (newSummaryLine ?? null);

      if (changed) {
        j.exp_class = reclassified.expClass;
        j.exp_min_years = reclassified.minYears;
        j.filter_reason = newFilterReason;
        j.summary_line = newSummaryLine;
        updated++;
      }

      processedCount++;
    }

    const remaining = linkedinJobs.length - processedCount;
    return { updated, remaining };
  }

  async enrichMissingDescriptions(opts?: EnrichDescriptionsOptions): Promise<EnrichDescriptionsResult> {
    const maxJobs = opts?.maxJobs ?? 25;
    const fetchTimeoutMs = opts?.fetchTimeoutMs ?? 6000;
    const timeBudgetMs = opts?.timeBudgetMs ?? 10000;
    const maxAttempts = opts?.maxAttempts ?? 3;
    const maxAgeDays = opts?.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;
    const clock = opts?.clock ?? Date.now;
    const fetcher = opts?.fetcherFn ?? safeFetch;
    const startTime = clock();

    const isInboxJob = (j: StoredJob) =>
      Boolean(
        (j.inbound_source && ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source)) ||
        ["telegram", "whatsapp", "pasted", "paste"].includes(j.source)
      );

    const candidates = Array.from(this.jobs.values()).filter((j) => {
      if (isInboxJob(j)) return false;
      if (j.status === "skipped") return false;
      if (j.filter_reason) return false;
      if (j.exp_class === "senior") return false;
      const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
      if (age > maxAgeDays) return false;

      const geoOk =
        ["worldwide", "india_ok"].includes(j.geo_eligibility) ||
        (j.geo_eligibility === "unclear" && Boolean(j.geo_reason && j.geo_reason.startsWith("remote-unconfirmed:")));
      if (!geoOk) return false;

      if (hasRealDescription(j.description, j.title, j.company)) return false;

      const rawObj = (typeof j.raw === "object" && j.raw !== null ? j.raw : {}) as Record<string, unknown>;
      const attempts = typeof rawObj.enrichAttempts === "number" ? rawObj.enrichAttempts : 0;
      if (attempts >= maxAttempts) return false;

      const targetUrl = isEnrichablePublicHttpsUrl(j.apply_url)
        ? j.apply_url
        : isEnrichablePublicHttpsUrl(j.url)
        ? j.url
        : null;
      return Boolean(targetUrl);
    });

    let attempted = 0;
    let enriched = 0;
    let movedToSenior = 0;
    let movedToShortlist = 0;
    let failed = 0;

    for (const j of candidates) {
      if (attempted >= maxJobs) break;
      if (clock() - startTime >= timeBudgetMs) break;

      const targetUrl = isEnrichablePublicHttpsUrl(j.apply_url) ? j.apply_url! : j.url;
      const rawObj = (typeof j.raw === "object" && j.raw !== null ? j.raw : {}) as Record<string, unknown>;
      const prevAttempts = typeof rawObj.enrichAttempts === "number" ? rawObj.enrichAttempts : 0;
      const nextAttempts = prevAttempts + 1;

      attempted++;
      const res = await fetcher(targetUrl, { timeoutMs: fetchTimeoutMs });

      if (res.ok && res.body) {
        const plainText = stripHtmlToPlainText(res.body, 6000);
        if (hasRealDescription(plainText, j.title, j.company)) {
          const expRes = classifyExperience(j.title, plainText, j.company);
          j.description = plainText;
          j.exp_class = expRes.expClass;
          j.exp_min_years = expRes.minYears;
          j.raw = {
            ...rawObj,
            enrichAttempts: nextAttempts,
            enrichedAt: new Date().toISOString(),
            expReason: expRes.reason,
          };

          if (expRes.expClass === "senior") {
            j.filter_reason = expRes.reason || "Senior experience required";
            movedToSenior++;
          } else {
            j.filter_reason = null;
            if (!j.summary_line || j.summary_line === getMissingDescriptionNote(j.source)) {
              j.summary_line = `${j.title} at ${j.company}`;
            }
            if (["worldwide", "india_ok"].includes(j.geo_eligibility)) {
              movedToShortlist++;
            }
          }
          enriched++;
        } else {
          j.raw = {
            ...rawObj,
            enrichAttempts: nextAttempts,
            lastEnrichError: "extracted text too short",
          };
          if (j.exp_class === "unclear") {
            j.summary_line = getMissingDescriptionNote(j.source);
          }
          failed++;
        }
      } else {
        j.raw = {
          ...rawObj,
          enrichAttempts: nextAttempts,
          lastEnrichError: res.error || `HTTP ${res.status}`,
        };
        if (j.exp_class === "unclear") {
          j.summary_line = getMissingDescriptionNote(j.source);
        }
        failed++;
      }
    }

    const remaining = Math.max(0, candidates.length - attempted);
    return {
      attempted,
      enriched,
      movedToSenior,
      movedToShortlist,
      failed,
      remaining,
    };
  }

  async getStats() {
    const list = Array.from(this.jobs.values());
    const today = new Date().toISOString().slice(0, 10);
    const jobsFound = list.length;
    const newToday = list.filter((j) => j.fetched_at.startsWith(today)).length;
    const applied = list.filter((j) => j.status === "applied").length;

    return {
      jobsFound,
      newToday,
      applied,
      replies: 0,
      visits: 0,
    };
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean> {
    for (const job of this.jobs.values()) {
      if (job.id === id) {
        job.status = status;
        return true;
      }
    }
    return false;
  }

  async createSearchRun(): Promise<string> {
    const id = `run-${this.runs.size + 1}`;
    this.runs.set(id, {
      id,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "running",
      source_counts: {},
      new_jobs: 0,
      filtered_out: 0,
      error: null,
    });
    return id;
  }

  async updateSearchRun(id: string, updates: Partial<SearchRun>): Promise<void> {
    const run = this.runs.get(id);
    if (run) {
      Object.assign(run, updates);
    }
  }

  async getSearchRun(id: string): Promise<SearchRun | null> {
    return this.runs.get(id) || null;
  }

  async getLastSearchRun(): Promise<SearchRun | null> {
    const list = Array.from(this.runs.values());
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  async getLastSearchRuns(limit = 10): Promise<SearchRun[]> {
    return Array.from(this.runs.values())
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, limit);
  }

  async getCustomBoards(): Promise<CustomBoard[]> {
    return Array.from(this.customBoards.values());
  }

  async addCustomBoard(board: {
    kind: "greenhouse" | "lever" | "ashby";
    slug: string;
    label?: string;
  }): Promise<CustomBoard> {
    const key = `${board.kind}:${board.slug.toLowerCase()}`;
    const existing = this.customBoards.get(key);
    if (existing) {
      if (board.label !== undefined) existing.label = board.label;
      return existing;
    }
    const created: CustomBoard = {
      id: `board-${this.customBoards.size + 1}`,
      kind: board.kind,
      slug: board.slug.toLowerCase(),
      label: board.label || null,
      created_at: new Date().toISOString(),
    };
    this.customBoards.set(key, created);
    return created;
  }

  async deleteCustomBoard(id: string): Promise<boolean> {
    for (const [key, b] of this.customBoards.entries()) {
      if (b.id === id) {
        this.customBoards.delete(key);
        return true;
      }
    }
    return false;
  }
}

// Neon PostgreSQL Implementation with Parameterized Tagged Templates ONLY
export class NeonJobsRepository implements JobsRepository {
  private readonly sqlOverride?: ReturnType<typeof getSql>;

  constructor(sqlOverride?: ReturnType<typeof getSql>) {
    this.sqlOverride = sqlOverride;
  }

  private resolveSql(): ReturnType<typeof getSql> {
    return this.sqlOverride ?? getSql();
  }

  async upsertJob(
    job: NormalizedJob,
    triaged: TriagedJobResult
  ): Promise<"new" | "existing"> {
    const sql = this.resolveSql();

    const rawPayload = {
      ...job,
      descriptionHash: triaged.descriptionHash,
    };

    try {
      // Try upserting with migration 005 columns (inbound_raw, inbound_source) + migration 004 columns
      const rows = await sql`
        INSERT INTO jobs (
          source, source_id, url, title, company, location, remote_scope,
          description, posted_at, exp_min_years, exp_class, geo_eligibility,
          geo_reason, skills, filter_reason, summary_line, match_score,
          raw, last_seen_at, triaged_at, contact_email, apply_url, inbound_raw, inbound_source
        ) VALUES (
          ${job.source},
          ${job.sourceId},
          ${job.url},
          ${job.title},
          ${job.company},
          ${job.location},
          ${job.remoteScope},
          ${job.description},
          ${job.postedAt},
          ${triaged.expMinYears},
          ${triaged.expClass},
          ${triaged.geoEligibility},
          ${triaged.geoReason},
          ${triaged.skills},
          ${triaged.filterReason || null},
          ${triaged.summaryLine},
          ${triaged.matchScore},
          ${JSON.stringify(rawPayload)},
          NOW(),
          ${triaged.triagedAt ? new Date(triaged.triagedAt) : null},
          ${job.contactEmail || null},
          ${job.applyUrl || job.url},
          ${job.inboundRaw || null},
          ${job.inboundSource || null}
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          title = EXCLUDED.title,
          company = EXCLUDED.company,
          location = EXCLUDED.location,
          remote_scope = EXCLUDED.remote_scope,
          description = EXCLUDED.description,
          posted_at = EXCLUDED.posted_at,
          exp_min_years = EXCLUDED.exp_min_years,
          exp_class = EXCLUDED.exp_class,
          geo_eligibility = EXCLUDED.geo_eligibility,
          geo_reason = EXCLUDED.geo_reason,
          skills = EXCLUDED.skills,
          filter_reason = EXCLUDED.filter_reason,
          summary_line = EXCLUDED.summary_line,
          match_score = EXCLUDED.match_score,
          raw = EXCLUDED.raw,
          last_seen_at = NOW(),
          triaged_at = COALESCE(EXCLUDED.triaged_at, jobs.triaged_at),
          contact_email = COALESCE(EXCLUDED.contact_email, jobs.contact_email),
          apply_url = COALESCE(EXCLUDED.apply_url, jobs.apply_url),
          inbound_raw = COALESCE(EXCLUDED.inbound_raw, jobs.inbound_raw),
          inbound_source = COALESCE(EXCLUDED.inbound_source, jobs.inbound_source)
        RETURNING (xmax = 0) AS is_new;
      `;
      return rows[0]?.is_new ? "new" : "existing";
    } catch {
      // Fallback if migration 005 has not run yet: try migration 004 columns
      try {
        const rows = await sql`
          INSERT INTO jobs (
            source, source_id, url, title, company, location, remote_scope,
            description, posted_at, exp_min_years, exp_class, geo_eligibility,
            geo_reason, skills, filter_reason, summary_line, match_score,
            raw, last_seen_at, triaged_at, contact_email, apply_url
          ) VALUES (
            ${job.source},
            ${job.sourceId},
            ${job.url},
            ${job.title},
            ${job.company},
            ${job.location},
            ${job.remoteScope},
            ${job.description},
            ${job.postedAt},
            ${triaged.expMinYears},
            ${triaged.expClass},
            ${triaged.geoEligibility},
            ${triaged.geoReason},
            ${triaged.skills},
            ${triaged.filterReason || null},
            ${triaged.summaryLine},
            ${triaged.matchScore},
            ${JSON.stringify(rawPayload)},
            NOW(),
            ${triaged.triagedAt ? new Date(triaged.triagedAt) : null},
            ${job.contactEmail || null},
            ${job.applyUrl || job.url}
          )
          ON CONFLICT (source, source_id) DO UPDATE SET
            title = EXCLUDED.title,
            company = EXCLUDED.company,
            location = EXCLUDED.location,
            remote_scope = EXCLUDED.remote_scope,
            description = EXCLUDED.description,
            posted_at = EXCLUDED.posted_at,
            exp_min_years = EXCLUDED.exp_min_years,
            exp_class = EXCLUDED.exp_class,
            geo_eligibility = EXCLUDED.geo_eligibility,
            geo_reason = EXCLUDED.geo_reason,
            skills = EXCLUDED.skills,
            filter_reason = EXCLUDED.filter_reason,
            summary_line = EXCLUDED.summary_line,
            match_score = EXCLUDED.match_score,
            raw = EXCLUDED.raw,
            last_seen_at = NOW(),
            triaged_at = COALESCE(EXCLUDED.triaged_at, jobs.triaged_at),
            contact_email = COALESCE(EXCLUDED.contact_email, jobs.contact_email),
            apply_url = COALESCE(EXCLUDED.apply_url, jobs.apply_url)
          RETURNING (xmax = 0) AS is_new;
        `;
        return rows[0]?.is_new ? "new" : "existing";
      } catch {
        // Fallback if migration 004 has not yet run in database
      const rows = await sql`
        INSERT INTO jobs (
          source, source_id, url, title, company, location, remote_scope,
          description, posted_at, exp_min_years, exp_class, geo_eligibility,
          geo_reason, skills, filter_reason, summary_line, match_score,
          raw, last_seen_at
        ) VALUES (
          ${job.source},
          ${job.sourceId},
          ${job.url},
          ${job.title},
          ${job.company},
          ${job.location},
          ${job.remoteScope},
          ${job.description},
          ${job.postedAt},
          ${triaged.expMinYears},
          ${triaged.expClass},
          ${triaged.geoEligibility},
          ${triaged.geoReason},
          ${triaged.skills},
          ${triaged.filterReason || null},
          ${triaged.summaryLine},
          ${triaged.matchScore},
          ${JSON.stringify(rawPayload)},
          NOW()
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          title = EXCLUDED.title,
          company = EXCLUDED.company,
          location = EXCLUDED.location,
          remote_scope = EXCLUDED.remote_scope,
          description = EXCLUDED.description,
          posted_at = EXCLUDED.posted_at,
          exp_min_years = EXCLUDED.exp_min_years,
          exp_class = EXCLUDED.exp_class,
          geo_eligibility = EXCLUDED.geo_eligibility,
          geo_reason = EXCLUDED.geo_reason,
          skills = EXCLUDED.skills,
          filter_reason = EXCLUDED.filter_reason,
          summary_line = EXCLUDED.summary_line,
          match_score = EXCLUDED.match_score,
          raw = EXCLUDED.raw,
          last_seen_at = NOW()
        RETURNING (xmax = 0) AS is_new;
      `;
      return rows[0]?.is_new ? "new" : "existing";
    }
  }
}

  async getJob(source: string, sourceId: string): Promise<StoredJob | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM jobs
      WHERE source = ${source} AND source_id = ${sourceId}
      LIMIT 1
    `) as StoredJob[];
    return rows[0] || null;
  }

  async hasJobWithUrl(url: string): Promise<boolean> {
    const sql = getSql();
    const rows = await sql`
      SELECT 1 FROM jobs
      WHERE LOWER(TRIM(url)) = LOWER(TRIM(${url}))
         OR LOWER(TRIM(apply_url)) = LOWER(TRIM(${url}))
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }> {
    const sql = this.resolveSql();
    const limit = opts.limit || 50;
    const offset = opts.offset || 0;
    const view = opts.view || "shortlist";
    const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;
    const sourceFilter = opts.source ? opts.source.trim().toLowerCase() : "";
    const statusFilter = opts.status ? opts.status.trim() : "";
    const qFilter = opts.q ? opts.q.trim().toLowerCase() : "";

    let rows: StoredJob[] = [];
    let countRows: Array<{ count?: number }> = [];

    if (view === "shortlist") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (
            exp_class IN ('fresher', 'junior')
            OR (
              exp_class = 'unclear'
              AND LENGTH(TRIM(COALESCE(description, ''))) >= 80
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
            )
          )
          AND geo_eligibility IN ('worldwide', 'india_ok')
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
        ORDER BY match_score DESC, posted_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (
            exp_class IN ('fresher', 'junior')
            OR (
              exp_class = 'unclear'
              AND LENGTH(TRIM(COALESCE(description, ''))) >= 80
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
              AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
            )
          )
          AND geo_eligibility IN ('worldwide', 'india_ok')
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
      `) as Array<{ count?: number }>;
    } else if (view === "maybe") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            (exp_class IN ('fresher', 'junior', 'unclear') AND geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') LIKE 'remote-unconfirmed:%')
            OR (
              exp_class = 'unclear'
              AND geo_eligibility IN ('worldwide', 'india_ok')
              AND (
                LENGTH(TRIM(COALESCE(description, ''))) < 80
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
              )
            )
          )
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
        ORDER BY match_score DESC, posted_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            (exp_class IN ('fresher', 'junior', 'unclear') AND geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') LIKE 'remote-unconfirmed:%')
            OR (
              exp_class = 'unclear'
              AND geo_eligibility IN ('worldwide', 'india_ok')
              AND (
                LENGTH(TRIM(COALESCE(description, ''))) < 80
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
              )
            )
          )
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
      `) as Array<{ count?: number }>;
    } else if (view === "inbox") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
        ORDER BY posted_at DESC NULLS LAST, last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
      `) as Array<{ count?: number }>;
    } else if (view === "hidden") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (
            exp_class = 'senior'
            OR geo_eligibility = 'restricted'
            OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
            OR status = 'skipped'
            OR filter_reason IS NOT NULL
            OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
          )
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (
            exp_class = 'senior'
            OR geo_eligibility = 'restricted'
            OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
            OR status = 'skipped'
            OR filter_reason IS NOT NULL
            OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
          )
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
      `) as Array<{ count?: number }>;
    } else {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (${sourceFilter} = '' OR LOWER(COALESCE(source, '')) = ${sourceFilter} OR LOWER(COALESCE(inbound_source, '')) = ${sourceFilter})
          AND (${statusFilter} = '' OR COALESCE(status, '') = ${statusFilter})
          AND (
            ${qFilter} = ''
            OR POSITION(${qFilter} IN LOWER(COALESCE(title, ''))) > 0
            OR POSITION(${qFilter} IN LOWER(COALESCE(company, ''))) > 0
            OR EXISTS (
              SELECT 1 FROM UNNEST(COALESCE(skills, '{}'::text[])) AS s
              WHERE POSITION(${qFilter} IN LOWER(COALESCE(s, ''))) > 0
            )
          )
      `) as Array<{ count?: number }>;
    }

    const total = Number(countRows[0]?.count || 0);

    return { jobs: rows, total };
  }

  async getViewCounts(
    maxAgeDays: number = MAX_AGE_DAYS_DEFAULT
  ): Promise<{ shortlist: number; maybe: number; inbox: number; hidden: number; all: number }> {
    const sql = this.resolveSql();
    try {
      const rows = await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND (
                exp_class IN ('fresher', 'junior')
                OR (
                  exp_class = 'unclear'
                  AND LENGTH(TRIM(COALESCE(description, ''))) >= 80
                  AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '')))
                  AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '')))
                  AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                  AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                  AND LOWER(TRIM(COALESCE(description, ''))) != LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
                )
              )
              AND geo_eligibility IN ('worldwide', 'india_ok')
              AND status != 'skipped'
              AND filter_reason IS NULL
              AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS shortlist,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND status != 'skipped'
              AND filter_reason IS NULL
              AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
              AND (
                (exp_class IN ('fresher', 'junior', 'unclear') AND geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') LIKE 'remote-unconfirmed:%')
                OR (
                  exp_class = 'unclear'
                  AND geo_eligibility IN ('worldwide', 'india_ok')
                  AND (
                    LENGTH(TRIM(COALESCE(description, ''))) < 80
                    OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                    OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                    OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                    OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                    OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
                  )
                )
              )
          )::int AS maybe,
          COUNT(*) FILTER (
            WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND status != 'skipped'
              AND filter_reason IS NULL
              AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS inbox,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND (
                exp_class = 'senior'
                OR geo_eligibility = 'restricted'
                OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                OR status = 'skipped'
                OR filter_reason IS NOT NULL
                OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
              )
          )::int AS hidden,
          COUNT(*) FILTER (
            WHERE COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS all
        FROM jobs;
      `;
      return {
        shortlist: Number(rows[0]?.shortlist || 0),
        maybe: Number(rows[0]?.maybe || 0),
        inbox: Number(rows[0]?.inbox || 0),
        hidden: Number(rows[0]?.hidden || 0),
        all: Number(rows[0]?.all || 0),
      };
    } catch {
      return { shortlist: 0, maybe: 0, inbox: 0, hidden: 0, all: 0 };
    }
  }

  async reclassifyUnclearJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const batchSize = opts?.batchSize ?? 100;
    const classifyFn = opts?.classifyFn ?? classifyGeo;
    const startTime = clock();

    const sql = getSql();
    try {
      const rows = (await sql`
        SELECT id, title, location, remote_scope, description, raw, geo_eligibility, geo_reason, filter_reason
        FROM jobs
        WHERE geo_eligibility = 'unclear'
          AND (
            geo_reason IS NULL
            OR (
              geo_reason NOT LIKE 'remote-unconfirmed:%'
              AND geo_reason NOT LIKE 'onsite:%'
            )
          )
      `) as Array<{
        id: string;
        title: string;
        location: string | null;
        remote_scope: string | null;
        description: string | null;
        raw: unknown;
        geo_eligibility: string;
        geo_reason: string | null;
        filter_reason: string | null;
      }>;

      let totalUpdated = 0;
      let currentIndex = 0;

      while (currentIndex < rows.length) {
        if (clock() - startTime >= timeBudgetMs) {
          break;
        }

        const batchEnd = Math.min(currentIndex + batchSize, rows.length);
        const batch = rows.slice(currentIndex, batchEnd);

        const ids: string[] = [];
        const geos: string[] = [];
        const reasons: string[] = [];
        const filterReasons: Array<string | null> = [];

        for (const row of batch) {
          let rawObj: Record<string, unknown> | null = null;
          if (typeof row.raw === "string") {
            try {
              rawObj = JSON.parse(row.raw);
            } catch {
              rawObj = null;
            }
          } else if (typeof row.raw === "object" && row.raw !== null) {
            rawObj = row.raw as Record<string, unknown>;
          }

          const isRemote =
            (rawObj?.isRemote as boolean | undefined) ??
            (/\bremote\b/i.test(row.location || "") ||
              /\bremote\b/i.test(row.remote_scope || "") ||
              /\bremote\b/i.test(row.title || "") ||
              /\bremote\b/i.test(row.description || ""));
          const workplaceType = rawObj?.workplaceType as string | undefined;
          const reclassified = classifyFn(
            row.title || "",
            row.location || "",
            row.remote_scope || "",
            row.description || "",
            { isRemote, workplaceType }
          );

          const newFilterReason = reclassified.reason.startsWith("remote-unconfirmed:")
            ? null
            : reclassified.geo === "restricted"
            ? reclassified.reason
            : reclassified.reason.startsWith("onsite:")
            ? "location not remote / not confirmed for India"
            : null;

          const changed =
            row.geo_eligibility !== reclassified.geo ||
            row.geo_reason !== reclassified.reason ||
            (row.filter_reason ?? null) !== (newFilterReason ?? null);

          if (changed) {
            ids.push(row.id);
            geos.push(reclassified.geo);
            reasons.push(reclassified.reason);
            filterReasons.push(newFilterReason);
          }
        }

        if (ids.length > 0) {
          await sql`
            UPDATE jobs AS j
            SET
              geo_eligibility = u.geo,
              geo_reason = u.geo_reason,
              filter_reason = u.filter_reason
            FROM (
              SELECT
                UNNEST(${ids}::uuid[]) AS id,
                UNNEST(${geos}::text[]) AS geo,
                UNNEST(${reasons}::text[]) AS geo_reason,
                UNNEST(${filterReasons}::text[]) AS filter_reason
            ) AS u
            WHERE j.id = u.id;
          `;
          totalUpdated += ids.length;
        }

        currentIndex = batchEnd;
      }

      const remaining = rows.length - currentIndex;
      return { updated: totalUpdated, remaining };
    } catch (err) {
      console.error("[reclassifyUnclearJobs] Error reclassifying jobs:", err);
      return { updated: 0, remaining: 0, error: true };
    }
  }

  async reclassifyInboxJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const batchSize = opts?.batchSize ?? 100;
    const startTime = clock();

    const sql = getSql();
    try {
      const rows = (await sql`
        SELECT id, title, description, filter_reason
        FROM jobs
        WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND filter_reason IS NOT NULL
          AND filter_reason NOT LIKE 'Non-English%'
          AND filter_reason NOT LIKE 'Excluded title%'
          AND filter_reason NOT LIKE 'Stale posting%'
      `) as Array<{
        id: string;
        title: string;
        description: string | null;
        filter_reason: string | null;
      }>;

      if (rows.length === 0) {
        return { updated: 0, remaining: 0 };
      }

      const { detectLanguage } = await import("./language");
      const { isExcludedTitle } = await import("../../config/job-profile");

      const updates: Array<{ id: string; filter_reason: string | null }> = [];

      for (let i = 0; i < rows.length; i++) {
        if (clock() - startTime > timeBudgetMs) {
          break;
        }

        const row = rows[i];
        let newFilterReason: string | null = null;
        const lang = detectLanguage(row.title, row.description || "");
        if (lang.language !== "English") {
          newFilterReason = `Non-English posting (${lang.language})`;
        } else if (isExcludedTitle(row.title)) {
          newFilterReason = "Excluded title (senior/management or non-engineering)";
        }

        if (row.filter_reason !== newFilterReason) {
          updates.push({ id: row.id, filter_reason: newFilterReason });
        }
      }

      let totalUpdated = 0;
      if (updates.length > 0) {
        for (let i = 0; i < updates.length; i += batchSize) {
          if (clock() - startTime > timeBudgetMs) {
            break;
          }
          const batch = updates.slice(i, i + batchSize);
          const ids = batch.map((u) => u.id);
          const filterReasons = batch.map((u) => u.filter_reason);

          await sql`
            UPDATE jobs AS j
            SET filter_reason = v.filter_reason
            FROM (
              SELECT
                UNNEST(${ids}::text[])::uuid AS id,
                UNNEST(${filterReasons}::text[]) AS filter_reason
            ) AS v
            WHERE j.id = v.id;
          `;
          totalUpdated += batch.length;
        }
      }

      const remaining = Math.max(0, rows.length - updates.length);
      return { updated: totalUpdated, remaining };
    } catch (err: unknown) {
      console.error("[reclassifyInboxJobs] Error reclassifying inbox jobs:", err);
      return { updated: 0, remaining: 0, error: true };
    }
  }

  async reclassifyLinkedInJobs(opts?: ReclassifyOptions): Promise<ReclassifyResult> {
    const timeBudgetMs = opts?.timeBudgetMs ?? 15000;
    const clock = opts?.clock ?? Date.now;
    const batchSize = opts?.batchSize ?? 100;
    const classifyExpFn = opts?.classifyExpFn ?? classifyExperience;
    const startTime = clock();

    const sql = getSql();
    try {
      const rows = (await sql`
        SELECT id, source, title, company, description, exp_class, exp_min_years, filter_reason, summary_line
        FROM jobs
        WHERE source = 'linkedin'
      `) as Array<{
        id: string;
        source: string;
        title: string;
        company: string;
        description: string | null;
        exp_class: "fresher" | "junior" | "unclear" | "senior";
        exp_min_years: number | null;
        filter_reason: string | null;
        summary_line: string | null;
      }>;

      if (rows.length === 0) {
        return { updated: 0, remaining: 0 };
      }

      const updates: Array<{
        id: string;
        exp_class: string;
        exp_min_years: number | null;
        filter_reason: string | null;
        summary_line: string | null;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        if (clock() - startTime > timeBudgetMs) {
          break;
        }

        const row = rows[i];
        const reclassified = classifyExpFn(row.title || "", row.description || "", row.company);
        const hasNoDesc = !hasRealDescription(row.description, row.title, row.company);

        let newFilterReason = row.filter_reason;
        let newSummaryLine = row.summary_line;

        if (reclassified.expClass === "senior") {
          newFilterReason = reclassified.reason || "Senior experience required";
        } else if (reclassified.expClass === "unclear" && hasNoDesc) {
          newSummaryLine = getMissingDescriptionNote(row.source);
        }

        const changed =
          row.exp_class !== reclassified.expClass ||
          row.exp_min_years !== reclassified.minYears ||
          (row.filter_reason ?? null) !== (newFilterReason ?? null) ||
          (row.summary_line ?? null) !== (newSummaryLine ?? null);

        if (changed) {
          updates.push({
            id: row.id,
            exp_class: reclassified.expClass,
            exp_min_years: reclassified.minYears,
            filter_reason: newFilterReason,
            summary_line: newSummaryLine,
          });
        }
      }

      let totalUpdated = 0;
      if (updates.length > 0) {
        for (let i = 0; i < updates.length; i += batchSize) {
          if (clock() - startTime > timeBudgetMs) {
            break;
          }
          const batch = updates.slice(i, i + batchSize);
          const ids = batch.map((u) => u.id);
          const expClasses = batch.map((u) => u.exp_class);
          const minYearsList = batch.map((u) => u.exp_min_years);
          const filterReasons = batch.map((u) => u.filter_reason);
          const summaryLines = batch.map((u) => u.summary_line);

          await sql`
            UPDATE jobs AS j
            SET
              exp_class = v.exp_class,
              exp_min_years = v.exp_min_years,
              filter_reason = v.filter_reason,
              summary_line = v.summary_line
            FROM (
              SELECT
                UNNEST(${ids}::text[])::uuid AS id,
                UNNEST(${expClasses}::text[]) AS exp_class,
                UNNEST(${minYearsList}::int[]) AS exp_min_years,
                UNNEST(${filterReasons}::text[]) AS filter_reason,
                UNNEST(${summaryLines}::text[]) AS summary_line
            ) AS v
            WHERE j.id = v.id;
          `;
          totalUpdated += batch.length;
        }
      }

      const remaining = Math.max(0, rows.length - updates.length);
      return { updated: totalUpdated, remaining };
    } catch (err: unknown) {
      console.error("[reclassifyLinkedInJobs] Error reclassifying LinkedIn jobs:", err);
      return { updated: 0, remaining: 0, error: true };
    }
  }

  async enrichMissingDescriptions(opts?: EnrichDescriptionsOptions): Promise<EnrichDescriptionsResult> {
    const maxJobs = opts?.maxJobs ?? 25;
    const fetchTimeoutMs = opts?.fetchTimeoutMs ?? 6000;
    const timeBudgetMs = opts?.timeBudgetMs ?? 10000;
    const maxAttempts = opts?.maxAttempts ?? 3;
    const maxAgeDays = opts?.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;
    const clock = opts?.clock ?? Date.now;
    const fetcher = opts?.fetcherFn ?? safeFetch;
    const startTime = clock();

    const sql = getSql();
    try {
      const rows = (await sql`
        SELECT id, source, title, company, url, apply_url, description, exp_class, exp_min_years, geo_eligibility, geo_reason, filter_reason, summary_line, raw
        FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND exp_class != 'senior'
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            geo_eligibility IN ('worldwide', 'india_ok')
            OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') LIKE 'remote-unconfirmed:%')
          )
          AND (
            LENGTH(TRIM(COALESCE(description, ''))) < 80
            OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
            OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
            OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
            OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
            OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
          )
        ORDER BY match_score DESC NULLS LAST, last_seen_at DESC
        LIMIT 100
      `) as Array<{
        id: string;
        source: string;
        title: string;
        company: string;
        url: string;
        apply_url: string | null;
        description: string | null;
        exp_class: "fresher" | "junior" | "unclear" | "senior";
        exp_min_years: number | null;
        geo_eligibility: "worldwide" | "india_ok" | "restricted" | "unclear";
        geo_reason: string | null;
        filter_reason: string | null;
        summary_line: string | null;
        raw: unknown;
      }>;

      const parseRaw = (raw: unknown): Record<string, unknown> => {
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            return typeof parsed === "object" && parsed !== null ? parsed : {};
          } catch {
            return {};
          }
        }
        return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      };

      const eligibleRows = rows.filter((r) => {
        if (hasRealDescription(r.description, r.title, r.company)) return false;
        const rawObj = parseRaw(r.raw);
        const attempts = typeof rawObj.enrichAttempts === "number" ? rawObj.enrichAttempts : 0;
        if (attempts >= maxAttempts) return false;
        const targetUrl = isEnrichablePublicHttpsUrl(r.apply_url)
          ? r.apply_url
          : isEnrichablePublicHttpsUrl(r.url)
          ? r.url
          : null;
        return Boolean(targetUrl);
      });

      let attempted = 0;
      let enriched = 0;
      let movedToSenior = 0;
      let movedToShortlist = 0;
      let failed = 0;

      for (const row of eligibleRows) {
        if (attempted >= maxJobs) break;
        if (clock() - startTime >= timeBudgetMs) break;

        const targetUrl = isEnrichablePublicHttpsUrl(row.apply_url) ? row.apply_url! : row.url;
        const rawObj = parseRaw(row.raw);
        const prevAttempts = typeof rawObj.enrichAttempts === "number" ? rawObj.enrichAttempts : 0;
        const nextAttempts = prevAttempts + 1;

        attempted++;
        const res = await fetcher(targetUrl, { timeoutMs: fetchTimeoutMs });

        if (res.ok && res.body) {
          const plainText = stripHtmlToPlainText(res.body, 6000);
          if (hasRealDescription(plainText, row.title, row.company)) {
            const expRes = classifyExperience(row.title, plainText, row.company);
            const newFilterReason =
              expRes.expClass === "senior" ? expRes.reason || "Senior experience required" : null;
            const newSummaryLine =
              expRes.expClass === "senior"
                ? row.summary_line
                : !row.summary_line || row.summary_line === getMissingDescriptionNote(row.source)
                ? `${row.title} at ${row.company}`
                : row.summary_line;
            const newRaw = {
              ...rawObj,
              enrichAttempts: nextAttempts,
              enrichedAt: new Date().toISOString(),
              expReason: expRes.reason,
            };

            await sql`
              UPDATE jobs
              SET
                description = ${plainText},
                exp_class = ${expRes.expClass},
                exp_min_years = ${expRes.minYears},
                filter_reason = ${newFilterReason},
                summary_line = ${newSummaryLine},
                raw = ${JSON.stringify(newRaw)}::jsonb
              WHERE id = ${row.id}::uuid
            `;

            if (expRes.expClass === "senior") {
              movedToSenior++;
            } else if (["worldwide", "india_ok"].includes(row.geo_eligibility)) {
              movedToShortlist++;
            }
            enriched++;
          } else {
            const newRaw = {
              ...rawObj,
              enrichAttempts: nextAttempts,
              lastEnrichError: "extracted text too short",
            };
            const newSummaryLine =
              row.exp_class === "unclear" ? getMissingDescriptionNote(row.source) : row.summary_line;
            await sql`
              UPDATE jobs
              SET
                summary_line = ${newSummaryLine},
                raw = ${JSON.stringify(newRaw)}::jsonb
              WHERE id = ${row.id}::uuid
            `;
            failed++;
          }
        } else {
          const newRaw = {
            ...rawObj,
            enrichAttempts: nextAttempts,
            lastEnrichError: res.error || `HTTP ${res.status}`,
          };
          const newSummaryLine =
            row.exp_class === "unclear" ? getMissingDescriptionNote(row.source) : row.summary_line;
          await sql`
            UPDATE jobs
            SET
              summary_line = ${newSummaryLine},
              raw = ${JSON.stringify(newRaw)}::jsonb
            WHERE id = ${row.id}::uuid
          `;
          failed++;
        }
      }

      const remaining = Math.max(0, eligibleRows.length - attempted);
      return {
        attempted,
        enriched,
        movedToSenior,
        movedToShortlist,
        failed,
        remaining,
      };
    } catch (err: unknown) {
      console.error("[enrichMissingDescriptions] Error enriching descriptions:", err);
      return {
        attempted: 0,
        enriched: 0,
        movedToSenior: 0,
        movedToShortlist: 0,
        failed: 0,
        remaining: 0,
      };
    }
  }

  async getStats() {
    const sql = getSql();

    const counts = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '24 hours')::int AS new_today,
        COUNT(*) FILTER (WHERE status = 'applied')::int AS applied
      FROM jobs
    `;

    return {
      jobsFound: counts[0]?.total || 0,
      newToday: counts[0]?.new_today || 0,
      applied: counts[0]?.applied || 0,
      replies: 0,
      visits: 0,
    };
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean> {
    const sql = getSql();
    const res = await sql`
      UPDATE jobs SET status = ${status} WHERE id = ${id} RETURNING id
    `;
    return res.length > 0;
  }

  async createSearchRun(): Promise<string> {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO search_runs (started_at, status)
      VALUES (NOW(), 'running')
      RETURNING id
    `;
    return rows[0].id;
  }

  async updateSearchRun(id: string, updates: Partial<SearchRun>): Promise<void> {
    const sql = getSql();
    try {
      // Try updating with stats column if it exists in the schema
      await sql`
        UPDATE search_runs
        SET
          finished_at = ${updates.finished_at ? sql`NOW()` : null},
          status = ${updates.status || null},
          source_counts = ${updates.source_counts ? JSON.stringify(updates.source_counts) : null},
          new_jobs = ${updates.new_jobs ?? 0},
          filtered_out = ${updates.filtered_out ?? 0},
          error = ${updates.error || null},
          stats = ${updates.stats ? JSON.stringify(updates.stats) : null}
        WHERE id = ${id}
      `;
    } catch {
      // Fallback if stats column has not yet been migrated in production
      await sql`
        UPDATE search_runs
        SET
          finished_at = ${updates.finished_at ? sql`NOW()` : null},
          status = ${updates.status || null},
          source_counts = ${updates.source_counts ? JSON.stringify(updates.source_counts) : null},
          new_jobs = ${updates.new_jobs ?? 0},
          filtered_out = ${updates.filtered_out ?? 0},
          error = ${updates.error || null}
        WHERE id = ${id}
      `;
    }
  }

  async getSearchRun(id: string): Promise<SearchRun | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM search_runs WHERE id = ${id} LIMIT 1
    `) as SearchRun[];
    return rows[0] || null;
  }

  async getLastSearchRun(): Promise<SearchRun | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM search_runs ORDER BY started_at DESC LIMIT 1
    `) as SearchRun[];
    return rows[0] || null;
  }

  async getLastSearchRuns(limit = 10): Promise<SearchRun[]> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM search_runs ORDER BY started_at DESC LIMIT ${limit}
    `) as SearchRun[];
    return rows;
  }

  async getCustomBoards(): Promise<CustomBoard[]> {
    const sql = getSql();
    try {
      const rows = (await sql`
        SELECT id, kind, slug, label, created_at
        FROM custom_boards
        ORDER BY created_at DESC
      `) as CustomBoard[];
      return rows;
    } catch {
      return [];
    }
  }

  async addCustomBoard(board: {
    kind: "greenhouse" | "lever" | "ashby";
    slug: string;
    label?: string;
  }): Promise<CustomBoard> {
    const sql = getSql();
    const cleanSlug = board.slug.trim().toLowerCase();
    const cleanLabel = board.label?.trim() || null;
    const rows = (await sql`
      INSERT INTO custom_boards (kind, slug, label)
      VALUES (${board.kind}, ${cleanSlug}, ${cleanLabel})
      ON CONFLICT (kind, slug) DO UPDATE
        SET label = COALESCE(EXCLUDED.label, custom_boards.label)
      RETURNING id, kind, slug, label, created_at
    `) as CustomBoard[];
    return rows[0];
  }

  async deleteCustomBoard(id: string): Promise<boolean> {
    const sql = getSql();
    try {
      const rows = await sql`
        DELETE FROM custom_boards
        WHERE id = ${id}
        RETURNING id
      `;
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

let singletonRepo: JobsRepository | null = null;

export function getJobsRepository(): JobsRepository {
  if (singletonRepo) return singletonRepo;

  // Use in-memory repository if DATABASE_URL is missing or if explicitly requested by E2E_SEED or test env
  if (process.env.E2E_SEED === "1" || process.env.USE_IN_MEMORY_REPO === "1") {
    singletonRepo = new InMemoryJobsRepository();
    return singletonRepo;
  }

  if (hasDatabaseUrl()) {
    singletonRepo = new NeonJobsRepository();
  } else {
    singletonRepo = new InMemoryJobsRepository();
  }
  return singletonRepo;
}

export function setTestJobsRepository(repo: JobsRepository | null) {
  singletonRepo = repo;
}
