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
  status: "new" | "shortlisted" | "skipped" | "applied" | "replied" | "interview" | "offer" | "rejected";
  raw: unknown;
  last_seen_at: string;
  triaged_at?: string | null;
  contact_email?: string | null;
  contact_url?: string | null;
  apply_url?: string | null;
  inbound_raw?: string | null;
  inbound_source?: string | null;
}

export interface JobContactInput {
  email: string;
  name?: string | null;
  linkedinUrl?: string | null;
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
  llmLastError?: string;
  llmErrorReasons?: Record<string, number>;
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
  [key: string]: unknown;
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
  stats?: Partial<SearchRunStats> | null;
}

export interface JobsQueryOptions {
  view?: "shortlist" | "maybe" | "inbox" | "all" | "hidden";
  source?: string;
  q?: string;
  status?: string;
  reason?: string;
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

export interface HiddenReasonsCounts {
  senior_title: number;
  senior_desc: number;
  onsite: number;
  restricted: number;
  geo_unclear: number;
  stale: number;
  language: number;
  skipped: number;
  low_relevance: number;
  missing_desc: number;
}

const TRACK_CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateTrackCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(Math.random() * TRACK_CODE_CHARS.length);
    code += TRACK_CODE_CHARS[idx];
  }
  return code;
}

export interface ViewCounts {
  shortlist: number;
  maybe: number;
  inbox: number;
  hidden: number;
  all: number;
  reasons?: HiddenReasonsCounts;
}

export type OutreachDraftKind = "email" | "linkedin_note" | "linkedin_dm" | "application_answer";
export type OutreachDraftStatus = "draft" | "approved" | "discarded";

export interface OutreachDraft {
  id: string;
  job_id: string;
  kind: OutreachDraftKind;
  subject: string | null;
  body: string;
  status: OutreachDraftStatus;
  model: string | null;
  edited: boolean;
  question?: string | null;
  recipient?: string | null;
  sent_at?: string | null;
  sent_channel?: string | null;
  bounced_at?: string | null;
  track_code?: string | null;
  created_at: string;
  updated_at: string;
  job_title?: string;
  job_company?: string;
  job_url?: string;
}

export interface CreateDraftInput {
  kind: OutreachDraftKind;
  subject?: string | null;
  body: string;
  model?: string | null;
  status?: OutreachDraftStatus;
  question?: string | null;
  recipient?: string | null;
  track_code?: string | null;
}

export interface ListDraftsOptions {
  status?: OutreachDraftStatus;
  jobId?: string;
  kind?: OutreachDraftKind;
  limit?: number;
  offset?: number;
}

export interface UpdateDraftInput {
  subject?: string | null;
  body?: string;
  status?: OutreachDraftStatus;
  recipient?: string | null;
}

export interface DraftCountsByStatus {
  all: number;
  draft: number;
  approved: number;
  discarded: number;
}

export interface PipelineJob {
  id: string;
  title: string;
  company: string;
  url: string;
  status: StoredJob["status"];
  channels: string[];
  sentAt: string;
  daysSinceSent: number;
  visitCount?: number;
  lastVisitAt?: string | null;
  // Filled in by the pipeline API from the job and its latest sent email draft
  contactName?: string | null;
  recipient?: string | null;
  subject?: string | null;
  bouncedAt?: string | null;
  possibleReply?: {
    id: string;
    snippet: string;
    receivedAt: string;
  } | null;
}

export interface VisitRecord {
  id: string;
  code: string;
  visited_at: string;
  is_bot: boolean;
  country: string | null;
}

export interface ReplyEvent {
  id: string;
  job_id: string;
  draft_id: string | null;
  match_kind: "exact" | "possible";
  subject_snippet: string;
  message_id: string;
  received_at: string;
  alerted_at: string | null;
  created_at: string;
}

export interface ExperienceVerdictInput {
  forFresher: "yes" | "no" | "unclear";
  minYears: number | null;
  filterReason: string | null;
}

export interface JobToJudge {
  id: string;
  title: string;
  company: string;
  description: string | null;
}

export interface JobsRepository {
  listJobsToJudge?(limit: number): Promise<JobToJudge[]>;
  countJobsToJudge?(): Promise<number>;
  applyExperienceVerdict?(id: string, verdict: ExperienceVerdictInput): Promise<boolean>;
  upsertJob(job: NormalizedJob, triaged: TriagedJobResult): Promise<"new" | "existing">;
  hasJobWithUrl?(url: string): Promise<boolean>;
  getJob(source: string, sourceId: string): Promise<StoredJob | null>;
  getJobById(id: string): Promise<StoredJob | null>;
  getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }>;
  getViewCounts(
    maxAgeDays?: number
  ): Promise<ViewCounts>;
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
    status: "new" | "shortlisted" | "skipped" | "applied" | "replied" | "interview" | "offer" | "rejected"
  ): Promise<boolean>;
  // Remembers the person chosen for a job: email, optional LinkedIn link, and name (stored in raw.contactName so drafts can greet them).
  setJobContact(id: string, contact: JobContactInput): Promise<boolean>;
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
  createDrafts(jobId: string, drafts: CreateDraftInput[]): Promise<OutreachDraft[]>;
  listDrafts(opts?: ListDraftsOptions): Promise<OutreachDraft[]>;
  updateDraft(id: string, updates: UpdateDraftInput): Promise<OutreachDraft | null>;
  // sentAt: the real send time when it is known (for example from the Gmail Sent folder). Default is now.
  markDraftSent(id: string, channel: string, sentAt?: string): Promise<OutreachDraft | null>;
  markDraftBounced(id: string): Promise<boolean>;
  getDraftById(id: string): Promise<OutreachDraft | null>;
  // Atomic: only an approved, unsent email draft can be claimed, and only once. Returns null otherwise.
  claimDraftForSend(id: string, channel: string): Promise<OutreachDraft | null>;
  // Undo a claim when the mail was definitely not sent.
  releaseDraftSend(id: string): Promise<void>;
  countEmailDraftsSentSince(sinceIso: string): Promise<number>;
  countDrafts(jobId?: string): Promise<DraftCountsByStatus>;
  countGenerationsToday(): Promise<number>;
  countAnswersToday(): Promise<number>;
  getPipelineJobs(): Promise<PipelineJob[]>;
  recordVisit(code: string, isBot: boolean, country: string | null): Promise<void>;
  visitsForJob(jobId: string): Promise<{ count: number; lastVisitAt: string | null }>;
  recordReplyEvent(event: {
    job_id: string;
    draft_id?: string | null;
    match_kind: "exact" | "possible";
    subject_snippet: string;
    message_id: string;
    received_at: string;
  }): Promise<ReplyEvent | null>;
  listUnalertedReplies(): Promise<ReplyEvent[]>;
  markReplyAlerted(id: string): Promise<boolean>;
  replyEventsForJob(jobId: string): Promise<ReplyEvent[]>;
  getDraftByTrackCode?(code: string): Promise<OutreachDraft | null>;
  listVisitsWithDrafts?(): Promise<Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }>>;
}

// Helper to determine whether a job matches a specific hidden reason filter
export function matchesHiddenReason(
  j: StoredJob,
  reason: string,
  maxAgeDays: number
): boolean {
  const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
  const filterReason = j.filter_reason || "";
  const geoReason = j.geo_reason || "";

  switch (reason) {
    case "senior_title":
      return (
        j.exp_class === "senior" &&
        (filterReason.startsWith("title level:") || filterReason.startsWith("Excluded title"))
      );
    case "senior_desc":
      return (
        j.exp_class === "senior" &&
        !(filterReason.startsWith("title level:") || filterReason.startsWith("Excluded title"))
      );
    case "onsite":
      return geoReason.startsWith("onsite:") || filterReason.startsWith("onsite:");
    case "restricted":
      return (
        j.geo_eligibility === "restricted" &&
        !(geoReason.startsWith("onsite:") || filterReason.startsWith("onsite:"))
      );
    case "geo_unclear":
      return (
        j.geo_eligibility === "unclear" &&
        !geoReason.startsWith("remote-unconfirmed:") &&
        !(geoReason.startsWith("onsite:") || filterReason.startsWith("onsite:"))
      );
    case "stale":
      return age > maxAgeDays;
    case "language":
      return (
        filterReason.startsWith("description not in English") ||
        filterReason.startsWith("Non-English")
      );
    case "skipped":
      return j.status === "skipped";
    case "low_relevance":
      return (
        filterReason === "Low relevance score" ||
        (Boolean(j.filter_reason) &&
          !filterReason.startsWith("title level:") &&
          !filterReason.startsWith("Excluded title") &&
          !filterReason.startsWith("onsite:") &&
          !filterReason.startsWith("description not in English") &&
          !filterReason.startsWith("Non-English") &&
          j.exp_class !== "senior" &&
          j.geo_eligibility !== "restricted" &&
          !(j.geo_eligibility === "unclear" && !geoReason.startsWith("remote-unconfirmed:")))
      );
    case "missing_desc":
      return (
        j.exp_class === "unclear" &&
        (j.source || "").toLowerCase() !== "linkedin" &&
        !hasRealDescription(j.description, j.title, j.company)
      );
    default:
      return true;
  }
}

// In-Memory implementation for tests or when DB is not configured
export class InMemoryJobsRepository implements JobsRepository {
  private jobs = new Map<string, StoredJob>();
  private runs = new Map<string, SearchRun>();
  private customBoards = new Map<string, CustomBoard>();
  private drafts = new Map<string, OutreachDraft>();
  private visits: Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null }> = [];
  private replyEvents: ReplyEvent[] = [];

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
      existing.last_seen_at = nowIso;

      const isIncomingTriaged = Boolean(triaged.triagedAt);
      const isExistingTriaged = Boolean(existing.triaged_at);

      if (isIncomingTriaged) {
        existing.exp_min_years = triaged.expMinYears;
        existing.exp_class = triaged.expClass;
        existing.geo_eligibility = triaged.geoEligibility;
        existing.geo_reason = triaged.geoReason;
        existing.skills = triaged.skills;
        existing.filter_reason = triaged.filterReason || null;
        existing.summary_line = triaged.summaryLine;
        existing.match_score = triaged.matchScore;
        existing.triaged_at = triaged.triagedAt;
      } else if (!isExistingTriaged) {
        // Neither was LLM-triaged: only overwrite if incoming is not inferior
        if (existing.exp_class === "unclear" || triaged.expClass !== "unclear") {
          existing.exp_class = triaged.expClass;
          existing.exp_min_years = triaged.expMinYears;
        }
        if (existing.geo_eligibility === "unclear" || triaged.geoEligibility !== "unclear") {
          existing.geo_eligibility = triaged.geoEligibility;
          existing.geo_reason = triaged.geoReason;
        }
        if (existing.exp_class === "unclear" && triaged.expClass !== "unclear") {
          existing.filter_reason = triaged.filterReason || null;
        } else if (existing.geo_eligibility === "unclear" && triaged.geoEligibility !== "unclear") {
          existing.filter_reason = triaged.filterReason || null;
        }
        existing.skills = triaged.skills;
        existing.summary_line = triaged.summaryLine;
        existing.match_score = triaged.matchScore;
      }

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

  async getJobById(id: string): Promise<StoredJob | null> {
    for (const j of this.jobs.values()) {
      if (j.id === id || j.source_id === id) return j;
    }
    return null;
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
        if (opts.reason) {
          return matchesHiddenReason(j, opts.reason, maxAgeDays);
        }
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isOlder = age > maxAgeDays;
        const isUnclearNonRemote =
          j.geo_eligibility === "unclear" && (!j.geo_reason || !j.geo_reason.startsWith("remote-unconfirmed:"));
        const isHiddenBase =
          j.exp_class === "senior" ||
          j.geo_eligibility === "restricted" ||
          isUnclearNonRemote ||
          j.status === "skipped" ||
          Boolean(j.filter_reason);
        // Default hidden view lists all hidden jobs including older ones (matching viewCounts.hidden)
        return isHiddenBase || isOlder;
      });
    } else {
      // "all" view: every non-inbox job within the selected window
      list = list.filter((j) => {
        if (isInboxJob(j)) return false;
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

  /**
   * Tab and View Counts Consistency Invariant:
   * - All = every non-inbox job within the selected "Posted within" window (age <= maxAgeDays).
   * - Shortlist, Maybe, and Hidden within the same window partition All completely:
   *     Shortlist + Maybe + Hidden === All
   * - Inbox is separate (only inbound jobs like telegram, whatsapp, pasted).
   * - Historical / Stale jobs (older than maxAgeDays) are classified under Hidden's
   *   "stale (older than window)" reason breakdown chip.
   */
  async getViewCounts(
    maxAgeDays: number = MAX_AGE_DAYS_DEFAULT
  ): Promise<ViewCounts> {
    const list = Array.from(this.jobs.values());
    let shortlist = 0;
    let maybe = 0;
    let inbox = 0;
    let hidden = 0;
    let all = 0;
    const reasons: HiddenReasonsCounts = {
      senior_title: 0,
      senior_desc: 0,
      onsite: 0,
      restricted: 0,
      geo_unclear: 0,
      stale: 0,
      language: 0,
      skipped: 0,
      low_relevance: 0,
      missing_desc: 0,
    };

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
        // Non-inbox jobs within the selected window count towards 'all'
        if (age <= maxAgeDays) {
          all++;

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

          if (isShortlistCandidate) {
            shortlist++;
          } else if (isMaybeCandidate) {
            maybe++;
          } else {
            // Every other non-inbox job within the window is Hidden
            hidden++;
          }
        } else {
          // Jobs older than window are included in Hidden by design, matching what the tab lists
          hidden++;
        }

        // Reason breakdown for all non-inbox jobs
        if (matchesHiddenReason(j, "senior_title", maxAgeDays)) reasons.senior_title++;
        if (matchesHiddenReason(j, "senior_desc", maxAgeDays)) reasons.senior_desc++;
        if (matchesHiddenReason(j, "onsite", maxAgeDays)) reasons.onsite++;
        if (matchesHiddenReason(j, "restricted", maxAgeDays)) reasons.restricted++;
        if (matchesHiddenReason(j, "geo_unclear", maxAgeDays)) reasons.geo_unclear++;
        if (matchesHiddenReason(j, "stale", maxAgeDays)) reasons.stale++;
        if (matchesHiddenReason(j, "language", maxAgeDays)) reasons.language++;
        if (matchesHiddenReason(j, "skipped", maxAgeDays)) reasons.skipped++;
        if (matchesHiddenReason(j, "low_relevance", maxAgeDays)) reasons.low_relevance++;
        if (matchesHiddenReason(j, "missing_desc", maxAgeDays)) reasons.missing_desc++;
      }
    }

    return { shortlist, maybe, inbox, hidden, all, reasons };
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
      if (job.filter_reason && job.filter_reason.startsWith("Experience too high")) continue;
      if (!job.filter_reason && job.exp_class === "senior") {
        job.filter_reason = `Experience too high: ${job.exp_min_years ? `${job.exp_min_years}+ years required` : "senior experience required"}`;
        this.jobs.set(`${job.source}:${job.source_id}`, job);
        updated++;
        continue;
      }

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
    const applied = list.filter((j) =>
      ["applied", "replied", "interview", "offer", "rejected"].includes(j.status)
    ).length;
    const replies = list.filter((j) => j.status === "replied").length;

    return {
      jobsFound,
      newToday,
      applied,
      replies,
      visits: 0,
    };
  }

  async getPipelineJobs(): Promise<PipelineJob[]> {
    const result: PipelineJob[] = [];
    const now = Date.now();

    for (const job of this.jobs.values()) {
      const jobDrafts = Array.from(this.drafts.values()).filter(
        (d) => (d.job_id === job.id || d.job_id === job.source_id) && Boolean(d.sent_at)
      );

      const hasSentDraft = jobDrafts.length > 0;
      const hasPipelineStatus = [
        "applied",
        "replied",
        "interview",
        "offer",
        "rejected",
      ].includes(job.status);

      if (!hasSentDraft && !hasPipelineStatus) {
        continue;
      }

      const channels = Array.from(
        new Set(jobDrafts.map((d) => d.sent_channel || d.kind))
      );

      let sentAt = job.fetched_at;
      if (hasSentDraft) {
        const sortedDates = jobDrafts
          .map((d) => d.sent_at!)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        sentAt = sortedDates[0];
      }

      const sentTime = new Date(sentAt).getTime();
      const daysSinceSent = isNaN(sentTime)
        ? 0
        : Math.max(0, Math.floor((now - sentTime) / (1000 * 60 * 60 * 24)));

      const visitsInfo = await this.visitsForJob(job.id);
      const possibleReplies = (await this.replyEventsForJob(job.id)).filter(
        (r) => r.match_kind === "possible"
      );
      const latestPossibleReply = possibleReplies.length > 0
        ? {
            id: possibleReplies[possibleReplies.length - 1].id,
            snippet: possibleReplies[possibleReplies.length - 1].subject_snippet,
            receivedAt: possibleReplies[possibleReplies.length - 1].received_at,
          }
        : null;

      result.push({
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.apply_url || job.url,
        status: job.status,
        channels,
        sentAt,
        daysSinceSent,
        visitCount: visitsInfo.count,
        lastVisitAt: visitsInfo.lastVisitAt,
        possibleReply: latestPossibleReply,
      });
    }

    result.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
    return result;
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied" | "replied" | "interview" | "offer" | "rejected"
  ): Promise<boolean> {
    for (const job of this.jobs.values()) {
      if (job.id === id || job.source_id === id) {
        job.status = status;
        return true;
      }
    }
    return false;
  }

  private judgeCandidates(): StoredJob[] {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return Array.from(this.jobs.values()).filter((j) => {
      const raw = (typeof j.raw === "object" && j.raw !== null ? j.raw : {}) as Record<string, unknown>;
      const when = new Date(j.posted_at || j.fetched_at).getTime();
      return (
        !j.filter_reason &&
        ["new", "shortlisted"].includes(j.status) &&
        j.exp_class !== "senior" &&
        !raw.expJudge &&
        (j.description || "").length >= 200 &&
        when >= cutoff
      );
    });
  }

  async listJobsToJudge(limit: number): Promise<JobToJudge[]> {
    return this.judgeCandidates()
      .slice(0, limit)
      .map((j) => ({ id: j.id, title: j.title, company: j.company, description: j.description }));
  }

  async countJobsToJudge(): Promise<number> {
    return this.judgeCandidates().length;
  }

  async applyExperienceVerdict(id: string, verdict: ExperienceVerdictInput): Promise<boolean> {
    for (const j of this.jobs.values()) {
      if (j.id !== id) continue;
      const raw = (typeof j.raw === "object" && j.raw !== null ? j.raw : {}) as Record<string, unknown>;
      j.raw = { ...raw, expJudge: { verdict: verdict.forFresher, at: new Date().toISOString() } };
      if (verdict.filterReason) {
        j.exp_class = "senior";
        j.exp_min_years = verdict.minYears ?? j.exp_min_years;
        j.filter_reason = verdict.filterReason;
      }
      return true;
    }
    return false;
  }

  async setJobContact(id: string, contact: JobContactInput): Promise<boolean> {
    for (const job of this.jobs.values()) {
      if (job.id === id || job.source_id === id) {
        job.contact_email = contact.email;
        if (contact.linkedinUrl) job.contact_url = contact.linkedinUrl;
        const raw = (typeof job.raw === "object" && job.raw !== null ? job.raw : {}) as Record<string, unknown>;
        job.raw = { ...raw, contactName: contact.name || null };
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

  async createDrafts(jobId: string, drafts: CreateDraftInput[]): Promise<OutreachDraft[]> {
    const nowIso = new Date().toISOString();
    const created: OutreachDraft[] = [];
    const job = await this.getJobById(jobId);

    for (const d of drafts) {
      // For email, linkedin_note, linkedin_dm: replace earlier non-approved drafts of the same job and kind.
      // For application_answer: keep individual answers (do not overwrite other questions)
      if (d.kind !== "application_answer") {
        for (const [key, existing] of this.drafts.entries()) {
          if (existing.job_id === jobId && existing.kind === d.kind && existing.status !== "approved") {
            this.drafts.delete(key);
          }
        }
      }

      const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const trackCode = d.track_code || generateTrackCode();
      const newDraft: OutreachDraft = {
        id,
        job_id: jobId,
        kind: d.kind,
        subject: d.subject || null,
        body: d.body,
        status: d.status || "draft",
        model: d.model || null,
        edited: false,
        question: d.question || null,
        recipient: d.recipient || null,
        sent_at: null,
        sent_channel: null,
        track_code: trackCode,
        created_at: nowIso,
        updated_at: nowIso,
        job_title: job?.title,
        job_company: job?.company,
      };
      this.drafts.set(id, newDraft);
      created.push(newDraft);
    }

    return created;
  }

  async listDrafts(opts?: ListDraftsOptions): Promise<OutreachDraft[]> {
    let list = Array.from(this.drafts.values());
    if (opts?.status) {
      list = list.filter((d) => d.status === opts.status);
    }
    if (opts?.jobId) {
      list = list.filter((d) => d.job_id === opts.jobId);
    }
    if (opts?.kind) {
      list = list.filter((d) => d.kind === opts.kind);
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (opts?.offset) list = list.slice(opts.offset);
    if (opts?.limit) list = list.slice(0, opts.limit);
    return list.map((d) => {
      const job = Array.from(this.jobs.values()).find((j) => j.id === d.job_id);
      return {
        ...d,
        job_title: d.job_title || job?.title,
        job_company: d.job_company || job?.company,
        job_url: d.job_url || job?.url,
      };
    });
  }

  async updateDraft(id: string, updates: UpdateDraftInput): Promise<OutreachDraft | null> {
    const draft = this.drafts.get(id);
    if (!draft) return null;

    let edited = draft.edited;
    if (updates.subject !== undefined && updates.subject !== draft.subject) {
      draft.subject = updates.subject;
      edited = true;
    }
    if (updates.body !== undefined && updates.body !== draft.body) {
      draft.body = updates.body;
      edited = true;
    }
    if (updates.status !== undefined) {
      draft.status = updates.status;
    }
    if (updates.recipient !== undefined) {
      draft.recipient = updates.recipient;
    }
    draft.edited = edited;
    draft.updated_at = new Date().toISOString();
    return { ...draft };
  }

  async markDraftSent(id: string, channel: string, sentAt?: string): Promise<OutreachDraft | null> {
    const draft = this.drafts.get(id);
    if (!draft) return null;

    draft.sent_at = sentAt || new Date().toISOString();
    draft.sent_channel = channel;
    if (draft.status === "draft") {
      draft.status = "approved";
    }
    draft.updated_at = new Date().toISOString();
    return { ...draft };
  }

  async markDraftBounced(id: string): Promise<boolean> {
    const draft = this.drafts.get(id);
    if (!draft || draft.bounced_at) return false;
    draft.bounced_at = new Date().toISOString();
    return true;
  }

  async getDraftById(id: string): Promise<OutreachDraft | null> {
    const draft = this.drafts.get(id);
    if (!draft) return null;
    const job = Array.from(this.jobs.values()).find((j) => j.id === draft.job_id);
    return { ...draft, job_title: draft.job_title || job?.title, job_company: draft.job_company || job?.company };
  }

  async claimDraftForSend(id: string, channel: string): Promise<OutreachDraft | null> {
    const draft = this.drafts.get(id);
    if (!draft || draft.sent_at || draft.kind !== "email" || draft.status !== "approved") return null;
    draft.sent_at = new Date().toISOString();
    draft.sent_channel = channel;
    draft.updated_at = new Date().toISOString();
    return { ...draft };
  }

  async releaseDraftSend(id: string): Promise<void> {
    const draft = this.drafts.get(id);
    if (!draft || draft.sent_channel !== "email") return;
    draft.sent_at = null;
    draft.sent_channel = null;
    draft.updated_at = new Date().toISOString();
  }

  async countEmailDraftsSentSince(sinceIso: string): Promise<number> {
    const since = new Date(sinceIso).getTime();
    return Array.from(this.drafts.values()).filter(
      (d) => d.sent_channel === "email" && d.sent_at && new Date(d.sent_at).getTime() >= since
    ).length;
  }

  async countDrafts(jobId?: string): Promise<DraftCountsByStatus> {
    let list = Array.from(this.drafts.values());
    if (jobId) list = list.filter((d) => d.job_id === jobId);
    const counts: DraftCountsByStatus = { all: list.length, draft: 0, approved: 0, discarded: 0 };
    for (const d of list) {
      if (d.status === "draft") counts.draft++;
      else if (d.status === "approved") counts.approved++;
      else if (d.status === "discarded") counts.discarded++;
    }
    return counts;
  }

  async countGenerationsToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const todayJobIds = new Set(
      Array.from(this.drafts.values())
        .filter((d) => d.created_at.slice(0, 10) === today && d.kind !== "application_answer")
        .map((d) => d.job_id)
    );
    return todayJobIds.size;
  }

  async countAnswersToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return Array.from(this.drafts.values()).filter(
      (d) => d.created_at.slice(0, 10) === today && d.kind === "application_answer"
    ).length;
  }

  async recordVisit(code: string, isBot: boolean, country: string | null): Promise<void> {
    this.visits.push({
      code,
      visited_at: new Date().toISOString(),
      is_bot: isBot,
      country: country ? country.slice(0, 2).toUpperCase() : null,
    });
  }

  async visitsForJob(jobId: string): Promise<{ count: number; lastVisitAt: string | null }> {
    const jobCodes = new Set(
      Array.from(this.drafts.values())
        .filter((d) => d.job_id === jobId && Boolean(d.track_code))
        .map((d) => d.track_code!)
    );
    const nonBotVisits = this.visits.filter((v) => jobCodes.has(v.code) && !v.is_bot);
    if (nonBotVisits.length === 0) {
      return { count: 0, lastVisitAt: null };
    }
    const sorted = [...nonBotVisits].sort(
      (a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
    );
    return {
      count: nonBotVisits.length,
      lastVisitAt: sorted[0].visited_at,
    };
  }

  async recordReplyEvent(event: {
    job_id: string;
    draft_id?: string | null;
    match_kind: "exact" | "possible";
    subject_snippet: string;
    message_id: string;
    received_at: string;
  }): Promise<ReplyEvent | null> {
    // Idempotent on message_id: a message that is already recorded is not a new event (null)
    const existing = this.replyEvents.find((e) => e.message_id === event.message_id);
    if (existing) {
      return null;
    }
    const newEvent: ReplyEvent = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      job_id: event.job_id,
      draft_id: event.draft_id || null,
      match_kind: event.match_kind,
      subject_snippet: event.subject_snippet.slice(0, 120),
      message_id: event.message_id,
      received_at: event.received_at,
      alerted_at: null,
      created_at: new Date().toISOString(),
    };
    this.replyEvents.push(newEvent);
    return newEvent;
  }

  async listUnalertedReplies(): Promise<ReplyEvent[]> {
    return this.replyEvents.filter((e) => e.alerted_at === null);
  }

  async markReplyAlerted(id: string): Promise<boolean> {
    const event = this.replyEvents.find((e) => e.id === id);
    if (!event) return false;
    event.alerted_at = new Date().toISOString();
    return true;
  }

  async replyEventsForJob(jobId: string): Promise<ReplyEvent[]> {
    return this.replyEvents.filter((e) => e.job_id === jobId);
  }

  async getDraftByTrackCode(code: string): Promise<OutreachDraft | null> {
    const draft = Array.from(this.drafts.values()).find((d) => d.track_code === code);
    return draft || null;
  }

  async listVisitsWithDrafts(): Promise<Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }>> {
    const result: Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }> = [];
    for (const v of [...this.visits].reverse()) {
      const draft = Array.from(this.drafts.values()).find((d) => d.track_code === v.code);
      const job = draft ? Array.from(this.jobs.values()).find((j) => j.id === draft.job_id) : undefined;
      result.push({
        code: v.code,
        visited_at: v.visited_at,
        is_bot: v.is_bot,
        country: v.country,
        job_title: job?.title,
        job_company: job?.company,
      });
    }
    return result;
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
          exp_min_years = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.exp_min_years
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.exp_min_years
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_min_years
            ELSE EXCLUDED.exp_min_years
          END,
          exp_class = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.exp_class
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.exp_class
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_class
            ELSE EXCLUDED.exp_class
          END,
          geo_eligibility = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.geo_eligibility
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.geo_eligibility
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_eligibility
            ELSE EXCLUDED.geo_eligibility
          END,
          geo_reason = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.geo_reason
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.geo_reason
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_reason
            ELSE EXCLUDED.geo_reason
          END,
          skills = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.skills
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.skills
            ELSE EXCLUDED.skills
          END,
          filter_reason = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.filter_reason
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.filter_reason
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.filter_reason
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.filter_reason
            ELSE EXCLUDED.filter_reason
          END,
          summary_line = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.summary_line
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.summary_line
            ELSE EXCLUDED.summary_line
          END,
          match_score = CASE
            WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.match_score
            WHEN jobs.triaged_at IS NOT NULL THEN jobs.match_score
            ELSE EXCLUDED.match_score
          END,
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
            exp_min_years = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.exp_min_years
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.exp_min_years
              WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_min_years
              ELSE EXCLUDED.exp_min_years
            END,
            exp_class = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.exp_class
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.exp_class
              WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_class
              ELSE EXCLUDED.exp_class
            END,
            geo_eligibility = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.geo_eligibility
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.geo_eligibility
              WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_eligibility
              ELSE EXCLUDED.geo_eligibility
            END,
            geo_reason = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.geo_reason
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.geo_reason
              WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_reason
              ELSE EXCLUDED.geo_reason
            END,
            skills = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.skills
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.skills
              ELSE EXCLUDED.skills
            END,
            filter_reason = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.filter_reason
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.filter_reason
              WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.filter_reason
              WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.filter_reason
              ELSE EXCLUDED.filter_reason
            END,
            summary_line = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.summary_line
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.summary_line
              ELSE EXCLUDED.summary_line
            END,
            match_score = CASE
              WHEN EXCLUDED.triaged_at IS NOT NULL THEN EXCLUDED.match_score
              WHEN jobs.triaged_at IS NOT NULL THEN jobs.match_score
              ELSE EXCLUDED.match_score
            END,
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
          exp_min_years = CASE
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_min_years
            ELSE EXCLUDED.exp_min_years
          END,
          exp_class = CASE
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_class
            ELSE EXCLUDED.exp_class
          END,
          geo_eligibility = CASE
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_eligibility
            ELSE EXCLUDED.geo_eligibility
          END,
          geo_reason = CASE
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_reason
            ELSE EXCLUDED.geo_reason
          END,
          skills = EXCLUDED.skills,
          filter_reason = CASE
            WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.filter_reason
            WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.filter_reason
            ELSE EXCLUDED.filter_reason
          END,
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
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT * FROM jobs
      WHERE source = ${source} AND source_id = ${sourceId}
      LIMIT 1
    `) as StoredJob[];
    return rows[0] || null;
  }

  async getJobById(id: string): Promise<StoredJob | null> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT * FROM jobs
        WHERE id = ${id}::uuid
        LIMIT 1
      `) as StoredJob[];
      return rows[0] || null;
    } catch {
      return null;
    }
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
      const reasonFilter = opts.reason?.trim() || "";
      rows = (await sql`
        SELECT * FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (${maxAgeDays} > 0)
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
          AND (
            CASE
              WHEN ${reasonFilter} = 'senior_title' THEN
                exp_class = 'senior' AND (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
              WHEN ${reasonFilter} = 'senior_desc' THEN
                exp_class = 'senior' AND NOT (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
              WHEN ${reasonFilter} = 'onsite' THEN
                (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'restricted' THEN
                geo_eligibility = 'restricted' AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'geo_unclear' THEN
                geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%' AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'stale' THEN
                COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
              WHEN ${reasonFilter} = 'language' THEN
                (COALESCE(filter_reason, '') LIKE 'description not in English%' OR COALESCE(filter_reason, '') LIKE 'Non-English%')
              WHEN ${reasonFilter} = 'skipped' THEN
                status = 'skipped'
              WHEN ${reasonFilter} = 'low_relevance' THEN
                (
                  COALESCE(filter_reason, '') = 'Low relevance score'
                  OR (
                    filter_reason IS NOT NULL
                    AND NOT (
                      COALESCE(filter_reason, '') LIKE 'title level:%'
                      OR COALESCE(filter_reason, '') LIKE 'Excluded title%'
                      OR COALESCE(filter_reason, '') LIKE 'onsite:%'
                      OR COALESCE(filter_reason, '') LIKE 'description not in English%'
                      OR COALESCE(filter_reason, '') LIKE 'Non-English%'
                    )
                    AND exp_class != 'senior'
                    AND geo_eligibility != 'restricted'
                    AND NOT (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                  )
                )
              WHEN ${reasonFilter} = 'missing_desc' THEN
                exp_class = 'unclear'
                AND LOWER(COALESCE(source, '')) != 'linkedin'
                AND (
                  LENGTH(TRIM(COALESCE(description, ''))) < 80
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
                )
              ELSE
                (
                  (
                    COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
                    AND (
                      exp_class = 'senior'
                      OR geo_eligibility = 'restricted'
                      OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                      OR status = 'skipped'
                      OR filter_reason IS NOT NULL
                    )
                  )
                  OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
                )
            END
          )
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND (${maxAgeDays} > 0)
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
          AND (
            CASE
              WHEN ${reasonFilter} = 'senior_title' THEN
                exp_class = 'senior' AND (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
              WHEN ${reasonFilter} = 'senior_desc' THEN
                exp_class = 'senior' AND NOT (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
              WHEN ${reasonFilter} = 'onsite' THEN
                (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'restricted' THEN
                geo_eligibility = 'restricted' AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'geo_unclear' THEN
                geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%' AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
              WHEN ${reasonFilter} = 'stale' THEN
                COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
              WHEN ${reasonFilter} = 'language' THEN
                (COALESCE(filter_reason, '') LIKE 'description not in English%' OR COALESCE(filter_reason, '') LIKE 'Non-English%')
              WHEN ${reasonFilter} = 'skipped' THEN
                status = 'skipped'
              WHEN ${reasonFilter} = 'low_relevance' THEN
                (
                  COALESCE(filter_reason, '') = 'Low relevance score'
                  OR (
                    filter_reason IS NOT NULL
                    AND NOT (
                      COALESCE(filter_reason, '') LIKE 'title level:%'
                      OR COALESCE(filter_reason, '') LIKE 'Excluded title%'
                      OR COALESCE(filter_reason, '') LIKE 'onsite:%'
                      OR COALESCE(filter_reason, '') LIKE 'description not in English%'
                      OR COALESCE(filter_reason, '') LIKE 'Non-English%'
                    )
                    AND exp_class != 'senior'
                    AND geo_eligibility != 'restricted'
                    AND NOT (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                  )
                )
              WHEN ${reasonFilter} = 'missing_desc' THEN
                exp_class = 'unclear'
                AND LOWER(COALESCE(source, '')) != 'linkedin'
                AND (
                  LENGTH(TRIM(COALESCE(description, ''))) < 80
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                  OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
                )
              ELSE
                (
                  (
                    COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
                    AND (
                      exp_class = 'senior'
                      OR geo_eligibility = 'restricted'
                      OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                      OR status = 'skipped'
                      OR filter_reason IS NOT NULL
                    )
                  )
                  OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
                )
            END
          )
      `) as Array<{ count?: number }>;
    } else {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
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
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];

      countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM jobs
        WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
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
    }

    const total = Number(countRows[0]?.count || 0);

    return { jobs: rows, total };
  }

  /**
   * Tab and View Counts Consistency Invariant:
   * - All = every non-inbox job within the selected "Posted within" window (age <= maxAgeDays).
   * - Shortlist, Maybe, and Hidden within the same window partition All completely:
   *     Shortlist + Maybe + Hidden === All
   * - Inbox is separate (only inbound jobs like telegram, whatsapp, pasted).
   * - Historical / Stale jobs (older than maxAgeDays) are classified under Hidden's
   *   "stale (older than window)" reason breakdown chip.
   */
  async getViewCounts(
    maxAgeDays: number = MAX_AGE_DAYS_DEFAULT
  ): Promise<ViewCounts> {
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
                (
                  COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
                  AND (
                    exp_class = 'senior'
                    OR geo_eligibility = 'restricted'
                    OR (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                    OR status = 'skipped'
                    OR filter_reason IS NOT NULL
                  )
                )
                OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
              )
          )::int AS hidden,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS all,

          -- Reason breakdown
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND exp_class = 'senior'
              AND (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
          )::int AS senior_title,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND exp_class = 'senior'
              AND NOT (COALESCE(filter_reason, '') LIKE 'title level:%' OR COALESCE(filter_reason, '') LIKE 'Excluded title%')
          )::int AS senior_desc,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
          )::int AS onsite,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND geo_eligibility = 'restricted'
              AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
          )::int AS restricted,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND geo_eligibility = 'unclear'
              AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%'
              AND NOT (COALESCE(geo_reason, '') LIKE 'onsite:%' OR COALESCE(filter_reason, '') LIKE 'onsite:%')
          )::int AS geo_unclear,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS stale,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND (COALESCE(filter_reason, '') LIKE 'description not in English%' OR COALESCE(filter_reason, '') LIKE 'Non-English%')
          )::int AS language,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND status = 'skipped'
          )::int AS skipped,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND (
                COALESCE(filter_reason, '') = 'Low relevance score'
                OR (
                  filter_reason IS NOT NULL
                  AND NOT (
                    COALESCE(filter_reason, '') LIKE 'title level:%'
                    OR COALESCE(filter_reason, '') LIKE 'Excluded title%'
                    OR COALESCE(filter_reason, '') LIKE 'onsite:%'
                    OR COALESCE(filter_reason, '') LIKE 'description not in English%'
                    OR COALESCE(filter_reason, '') LIKE 'Non-English%'
                  )
                  AND exp_class != 'senior'
                  AND geo_eligibility != 'restricted'
                  AND NOT (geo_eligibility = 'unclear' AND COALESCE(geo_reason, '') NOT LIKE 'remote-unconfirmed:%')
                )
              )
          )::int AS low_relevance,
          COUNT(*) FILTER (
            WHERE NOT (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
              AND exp_class = 'unclear'
              AND LOWER(COALESCE(source, '')) != 'linkedin'
              AND (
                LENGTH(TRIM(COALESCE(description, ''))) < 80
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' at ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(title, '') || ' - ' || COALESCE(company, '')))
                OR LOWER(TRIM(COALESCE(description, ''))) = LOWER(TRIM(COALESCE(company, '') || ' - ' || COALESCE(title, '')))
              )
          )::int AS missing_desc
        FROM jobs;
      `;
      return {
        shortlist: Number(rows[0]?.shortlist || 0),
        maybe: Number(rows[0]?.maybe || 0),
        inbox: Number(rows[0]?.inbox || 0),
        hidden: Number(rows[0]?.hidden || 0),
        all: Number(rows[0]?.all || 0),
        reasons: {
          senior_title: Number(rows[0]?.senior_title || 0),
          senior_desc: Number(rows[0]?.senior_desc || 0),
          onsite: Number(rows[0]?.onsite || 0),
          restricted: Number(rows[0]?.restricted || 0),
          geo_unclear: Number(rows[0]?.geo_unclear || 0),
          stale: Number(rows[0]?.stale || 0),
          language: Number(rows[0]?.language || 0),
          skipped: Number(rows[0]?.skipped || 0),
          low_relevance: Number(rows[0]?.low_relevance || 0),
          missing_desc: Number(rows[0]?.missing_desc || 0),
        },
      };
    } catch {
      return {
        shortlist: 0,
        maybe: 0,
        inbox: 0,
        hidden: 0,
        all: 0,
        reasons: {
          senior_title: 0,
          senior_desc: 0,
          onsite: 0,
          restricted: 0,
          geo_unclear: 0,
          stale: 0,
          language: 0,
          skipped: 0,
          low_relevance: 0,
          missing_desc: 0,
        },
      };
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
      // Saved inbox posts that need experience: hide them and say why
      await sql`
        UPDATE jobs
        SET filter_reason = 'Experience too high: ' || COALESCE(exp_min_years::text || '+ years required', 'senior experience required')
        WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND exp_class = 'senior'
          AND filter_reason IS NULL
      `;
      const rows = (await sql`
        SELECT id, title, description, filter_reason
        FROM jobs
        WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste') OR source IN ('telegram', 'whatsapp', 'pasted', 'paste'))
          AND filter_reason IS NOT NULL
          AND filter_reason NOT LIKE 'Non-English%'
          AND filter_reason NOT LIKE 'Excluded title%'
          AND filter_reason NOT LIKE 'Stale posting%'
          AND filter_reason NOT LIKE 'Experience too high%'
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
    const sql = this.resolveSql();

    const counts = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '24 hours')::int AS new_today,
        COUNT(*) FILTER (WHERE status IN ('applied', 'replied', 'interview', 'offer', 'rejected'))::int AS applied,
        COUNT(*) FILTER (WHERE status = 'replied')::int AS replies
      FROM jobs
    `;

    return {
      jobsFound: counts[0]?.total || 0,
      newToday: counts[0]?.new_today || 0,
      applied: counts[0]?.applied || 0,
      replies: counts[0]?.replies || 0,
      visits: 0,
    };
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied" | "replied" | "interview" | "offer" | "rejected"
  ): Promise<boolean> {
    const sql = getSql();
    const res = await sql`
      UPDATE jobs SET status = ${status} WHERE id = ${id} RETURNING id
    `;
    return res.length > 0;
  }

  async listJobsToJudge(limit: number): Promise<JobToJudge[]> {
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT id, title, company, description
      FROM jobs
      WHERE filter_reason IS NULL
        AND status IN ('new', 'shortlisted')
        AND exp_class <> 'senior'
        AND COALESCE(raw->>'expJudge', '') = ''
        AND LENGTH(COALESCE(description, '')) >= 200
        AND COALESCE(posted_at, fetched_at) >= NOW() - INTERVAL '14 days'
      ORDER BY CASE WHEN COALESCE(inbound_source, '') <> '' THEN 0 ELSE 1 END, match_score DESC NULLS LAST, fetched_at DESC
      LIMIT ${limit}
    `) as JobToJudge[];
    return rows;
  }

  async countJobsToJudge(): Promise<number> {
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM jobs
      WHERE filter_reason IS NULL
        AND status IN ('new', 'shortlisted')
        AND exp_class <> 'senior'
        AND COALESCE(raw->>'expJudge', '') = ''
        AND LENGTH(COALESCE(description, '')) >= 200
        AND COALESCE(posted_at, fetched_at) >= NOW() - INTERVAL '14 days'
    `) as Array<{ n: number }>;
    return Number(rows[0]?.n || 0);
  }

  async applyExperienceVerdict(id: string, verdict: ExperienceVerdictInput): Promise<boolean> {
    const sql = this.resolveSql();
    const marker = JSON.stringify({ expJudge: { verdict: verdict.forFresher, at: new Date().toISOString() } });
    const hide = verdict.filterReason ? 1 : 0;
    const res = await sql`
      UPDATE jobs
      SET raw = COALESCE(raw, '{}'::jsonb) || ${marker}::jsonb,
          exp_class = CASE WHEN ${hide} = 1 THEN 'senior' ELSE exp_class END,
          exp_min_years = CASE WHEN ${hide} = 1 THEN COALESCE(${verdict.minYears}::int, exp_min_years) ELSE exp_min_years END,
          filter_reason = CASE WHEN ${hide} = 1 THEN ${verdict.filterReason} ELSE filter_reason END
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    return res.length > 0;
  }

  async setJobContact(id: string, contact: JobContactInput): Promise<boolean> {
    const sql = this.resolveSql();
    const patch = JSON.stringify({ contactName: contact.name || null });
    const res = await sql`
      UPDATE jobs
      SET contact_email = ${contact.email},
          contact_url = COALESCE(${contact.linkedinUrl || null}, contact_url),
          raw = COALESCE(raw, '{}'::jsonb) || ${patch}::jsonb
      WHERE id = ${id}::uuid
      RETURNING id
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

  async createDrafts(jobId: string, drafts: CreateDraftInput[]): Promise<OutreachDraft[]> {
    const sql = this.resolveSql();
    const created: OutreachDraft[] = [];

    for (const d of drafts) {
      // For email, linkedin_note, linkedin_dm: replace earlier non-approved drafts of the same job and kind.
      // For application_answer: keep individual answers (do not overwrite other questions)
      if (d.kind !== "application_answer") {
        await sql`
          DELETE FROM outreach_drafts
          WHERE job_id = ${jobId}::uuid
            AND kind = ${d.kind}
            AND status != 'approved'
        `;
      }

      const trackCode = d.track_code || generateTrackCode();
      const rows = (await sql`
        INSERT INTO outreach_drafts (
          job_id, kind, subject, body, status, model, edited, question, recipient, track_code, created_at, updated_at
        ) VALUES (
          ${jobId}::uuid,
          ${d.kind},
          ${d.subject || null},
          ${d.body},
          ${d.status || "draft"},
          ${d.model || null},
          false,
          ${d.question || null},
          ${d.recipient || null},
          ${trackCode},
          NOW(),
          NOW()
        )
        RETURNING *
      `) as OutreachDraft[];

      if (rows[0]) {
        created.push(rows[0]);
      }
    }

    return created;
  }

  async listDrafts(opts?: ListDraftsOptions): Promise<OutreachDraft[]> {
    const sql = this.resolveSql();
    const statusFilter = opts?.status || "";
    const jobIdFilter = opts?.jobId || "";
    const kindFilter = opts?.kind || "";
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const rows = (await sql`
      SELECT d.*, j.title AS job_title, j.company AS job_company, j.url AS job_url
      FROM outreach_drafts d
      LEFT JOIN jobs j ON d.job_id = j.id
      WHERE (${statusFilter} = '' OR d.status = ${statusFilter})
        AND (${jobIdFilter} = '' OR d.job_id = NULLIF(${jobIdFilter}, '')::uuid)
        AND (${kindFilter} = '' OR d.kind = ${kindFilter})
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as OutreachDraft[];

    return rows;
  }

  async updateDraft(id: string, updates: UpdateDraftInput): Promise<OutreachDraft | null> {
    const sql = this.resolveSql();
    try {
      const currentRows = (await sql`
        SELECT * FROM outreach_drafts WHERE id = ${id}::uuid LIMIT 1
      `) as OutreachDraft[];
      const current = currentRows[0];
      if (!current) return null;

      const newSubject = updates.subject !== undefined ? updates.subject : current.subject;
      const newBody = updates.body !== undefined ? updates.body : current.body;
      const newStatus = updates.status !== undefined ? updates.status : current.status;
      const newRecipient = updates.recipient !== undefined ? updates.recipient : current.recipient;
      const isEdited =
        current.edited ||
        (updates.subject !== undefined && updates.subject !== current.subject) ||
        (updates.body !== undefined && updates.body !== current.body);

      const rows = (await sql`
        UPDATE outreach_drafts
        SET
          subject = ${newSubject},
          body = ${newBody},
          status = ${newStatus},
          recipient = ${newRecipient},
          edited = ${isEdited},
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `) as OutreachDraft[];

      return rows[0] || null;
    } catch {
      return null;
    }
  }

  async markDraftBounced(id: string): Promise<boolean> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        UPDATE outreach_drafts
        SET bounced_at = NOW(), updated_at = NOW()
        WHERE id = ${id}::uuid AND bounced_at IS NULL
        RETURNING id
      `) as { id: string }[];
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async markDraftSent(id: string, channel: string, sentAt?: string): Promise<OutreachDraft | null> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        UPDATE outreach_drafts
        SET
          sent_at = COALESCE(${sentAt || null}::timestamptz, NOW()),
          sent_channel = ${channel},
          status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END,
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `) as OutreachDraft[];

      return rows[0] || null;
    } catch {
      return null;
    }
  }

  async getDraftById(id: string): Promise<OutreachDraft | null> {
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT d.*, j.title AS job_title, j.company AS job_company, j.url AS job_url
      FROM outreach_drafts d
      LEFT JOIN jobs j ON d.job_id = j.id
      WHERE d.id = ${id}::uuid
      LIMIT 1
    `) as OutreachDraft[];
    return rows[0] || null;
  }

  // One statement, so two clicks or two requests cannot both claim the same draft.
  // Errors are NOT swallowed here: the caller must know the claim did not happen because of the database.
  async claimDraftForSend(id: string, channel: string): Promise<OutreachDraft | null> {
    const sql = this.resolveSql();
    const rows = (await sql`
      UPDATE outreach_drafts
      SET sent_at = NOW(), sent_channel = ${channel}, updated_at = NOW()
      WHERE id = ${id}::uuid
        AND sent_at IS NULL
        AND kind = 'email'
        AND status = 'approved'
      RETURNING *
    `) as OutreachDraft[];
    return rows[0] || null;
  }

  async releaseDraftSend(id: string): Promise<void> {
    const sql = this.resolveSql();
    await sql`
      UPDATE outreach_drafts
      SET sent_at = NULL, sent_channel = NULL, updated_at = NOW()
      WHERE id = ${id}::uuid AND sent_channel = 'email'
    `;
  }

  async countEmailDraftsSentSince(sinceIso: string): Promise<number> {
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM outreach_drafts
      WHERE sent_channel = 'email' AND sent_at >= ${sinceIso}::timestamptz
    `) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  async countDrafts(jobId?: string): Promise<DraftCountsByStatus> {
    const sql = this.resolveSql();
    const jobIdFilter = jobId || "";
    try {
      const rows = (await sql`
        SELECT
          COUNT(*)::int AS all,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'discarded')::int AS discarded
        FROM outreach_drafts
        WHERE (${jobIdFilter} = '' OR job_id = ${jobIdFilter}::uuid)
      `) as Array<DraftCountsByStatus>;

      return (
        rows[0] || {
          all: 0,
          draft: 0,
          approved: 0,
          discarded: 0,
        }
      );
    } catch {
      return { all: 0, draft: 0, approved: 0, discarded: 0 };
    }
  }

  async countGenerationsToday(): Promise<number> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT COUNT(DISTINCT job_id)::int AS count
        FROM outreach_drafts
        WHERE created_at >= CURRENT_DATE
          AND kind != 'application_answer'
      `) as Array<{ count?: number }>;
      return Number(rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async countAnswersToday(): Promise<number> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT COUNT(*)::int AS count
        FROM outreach_drafts
        WHERE created_at >= CURRENT_DATE
          AND kind = 'application_answer'
      `) as Array<{ count?: number }>;
      return Number(rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async getPipelineJobs(): Promise<PipelineJob[]> {
    const sql = this.resolveSql();
    const rows = (await sql`
      SELECT
        j.id,
        j.title,
        j.company,
        COALESCE(j.apply_url, j.url) AS url,
        j.status,
        COALESCE(
          ARRAY_AGG(DISTINCT COALESCE(d.sent_channel, d.kind)) FILTER (WHERE d.sent_at IS NOT NULL),
          ARRAY[]::text[]
        ) AS channels,
        COALESCE(MAX(d.sent_at), j.fetched_at) AS sent_at
      FROM jobs j
      LEFT JOIN outreach_drafts d ON d.job_id = j.id
      WHERE j.status IN ('applied', 'replied', 'interview', 'offer', 'rejected')
         OR d.sent_at IS NOT NULL
      GROUP BY j.id, j.title, j.company, j.apply_url, j.url, j.status, j.fetched_at
      ORDER BY sent_at DESC
    `) as Array<{
      id: string;
      title: string;
      company: string;
      url: string;
      status: StoredJob["status"];
      channels: string[] | null;
      sent_at: string | Date;
    }>;

    const now = Date.now();
    return rows.map((r) => {
      const sentAtIso =
        r.sent_at instanceof Date
          ? r.sent_at.toISOString()
          : typeof r.sent_at === "string"
          ? r.sent_at
          : new Date().toISOString();
      const sentTime = new Date(sentAtIso).getTime();
      const daysSinceSent = isNaN(sentTime)
        ? 0
        : Math.max(0, Math.floor((now - sentTime) / (1000 * 60 * 60 * 24)));

      return {
        id: r.id,
        title: r.title,
        company: r.company,
        url: r.url,
        status: r.status,
        channels: Array.isArray(r.channels) ? r.channels : [],
        sentAt: sentAtIso,
        daysSinceSent,
      };
    });
  }

  async recordVisit(code: string, isBot: boolean, country: string | null): Promise<void> {
    const sql = this.resolveSql();
    const cleanCountry = country ? country.slice(0, 2).toUpperCase() : null;
    await sql`
      INSERT INTO visits (
        tracking_code, path, is_bot, country, at
      ) VALUES (
        ${code},
        ${`/r/${code}`},
        ${isBot},
        ${cleanCountry},
        NOW()
      )
    `;
  }

  async visitsForJob(jobId: string): Promise<{ count: number; lastVisitAt: string | null }> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT
          COUNT(v.id)::int AS count,
          MAX(v.at) AS last_visit_at
        FROM visits v
        JOIN outreach_drafts d ON d.track_code = v.tracking_code
        WHERE d.job_id = ${jobId}::uuid
          AND v.is_bot = false
      `) as Array<{ count: number; last_visit_at: string | Date | null }>;

      const first = rows[0];
      if (!first) return { count: 0, lastVisitAt: null };
      const lastVisitIso = first.last_visit_at
        ? first.last_visit_at instanceof Date
          ? first.last_visit_at.toISOString()
          : String(first.last_visit_at)
        : null;

      return {
        count: first.count || 0,
        lastVisitAt: lastVisitIso,
      };
    } catch {
      return { count: 0, lastVisitAt: null };
    }
  }

  async recordReplyEvent(event: {
    job_id: string;
    draft_id?: string | null;
    match_kind: "exact" | "possible";
    subject_snippet: string;
    message_id: string;
    received_at: string;
  }): Promise<ReplyEvent | null> {
    const sql = this.resolveSql();
    try {
      const draftIdVal = event.draft_id ? event.draft_id : null;
      const snippet = event.subject_snippet.slice(0, 120);
      const rows = (await sql`
        INSERT INTO reply_events (
          job_id, draft_id, match_kind, subject_snippet, message_id, received_at, alerted_at, created_at
        ) VALUES (
          ${event.job_id}::uuid,
          ${draftIdVal}::uuid,
          ${event.match_kind},
          ${snippet},
          ${event.message_id},
          ${event.received_at}::timestamptz,
          NULL,
          NOW()
        )
        ON CONFLICT (message_id) DO NOTHING
        RETURNING *
      `) as ReplyEvent[];

      return rows[0] || null;
    } catch {
      return null;
    }
  }

  async listUnalertedReplies(): Promise<ReplyEvent[]> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT *
        FROM reply_events
        WHERE alerted_at IS NULL
        ORDER BY received_at ASC
      `) as ReplyEvent[];
      return rows;
    } catch {
      return [];
    }
  }

  async markReplyAlerted(id: string): Promise<boolean> {
    const sql = this.resolveSql();
    try {
      await sql`
        UPDATE reply_events
        SET alerted_at = NOW()
        WHERE id = ${id}::uuid
      `;
      return true;
    } catch {
      return false;
    }
  }

  async replyEventsForJob(jobId: string): Promise<ReplyEvent[]> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT *
        FROM reply_events
        WHERE job_id = ${jobId}::uuid
        ORDER BY received_at DESC
      `) as ReplyEvent[];
      return rows;
    } catch {
      return [];
    }
  }

  async getDraftByTrackCode(code: string): Promise<OutreachDraft | null> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT *
        FROM outreach_drafts
        WHERE track_code = ${code}
        LIMIT 1
      `) as OutreachDraft[];
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  async listVisitsWithDrafts(): Promise<Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }>> {
    const sql = this.resolveSql();
    try {
      const rows = (await sql`
        SELECT
          v.tracking_code AS code,
          v.at AS visited_at,
          v.is_bot,
          v.country,
          j.title AS job_title,
          j.company AS job_company
        FROM visits v
        LEFT JOIN outreach_drafts d ON d.track_code = v.tracking_code
        LEFT JOIN jobs j ON d.job_id = j.id
        ORDER BY v.at DESC
        LIMIT 100
      `) as Array<{ code: string; visited_at: string | Date; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }>;

      return rows.map((r) => ({
        code: r.code,
        visited_at: r.visited_at instanceof Date ? r.visited_at.toISOString() : String(r.visited_at),
        is_bot: r.is_bot,
        country: r.country,
        job_title: r.job_title,
        job_company: r.job_company,
      }));
    } catch {
      return [];
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
