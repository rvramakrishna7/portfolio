import { NormalizedJob, AdapterResult, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { parseInboundCandidates } from "../../inbound/parse";

export const DEFAULT_LINKEDIN_ACTOR_ID = "automly~linkedin-jobs-scraper";

export interface ApifyLinkedInInput {
  keywords: string;
  location?: string;
  geoId?: string;
  workplaceType?: "on-site" | "remote" | "hybrid" | "remote,hybrid" | string;
  jobType?: string;
  experienceLevel?: "internship" | "entry" | "associate" | "mid-senior" | "director" | "executive" | string;
  timePosted?: "past-hour" | "past-24h" | "past-week" | "past-month" | string;
  sortBy?: "relevance" | "date" | string;
  maxResults?: number;
  fetchDetails?: boolean;
  scrapeCompany?: boolean;
  proxyConfiguration?: {
    useApifyProxy: boolean;
    [key: string]: unknown;
  };
}

export function buildApifyLinkedInInput(overrides?: Partial<ApifyLinkedInInput>): ApifyLinkedInInput {
  return {
    keywords: overrides?.keywords ?? "software engineer",
    location: overrides?.location ?? "India",
    workplaceType: overrides?.workplaceType ?? "remote",
    experienceLevel: overrides?.experienceLevel ?? "entry",
    timePosted: overrides?.timePosted ?? "past-week",
    sortBy: overrides?.sortBy ?? "date",
    maxResults: overrides?.maxResults ?? 100,
    fetchDetails: overrides?.fetchDetails ?? false,
    scrapeCompany: overrides?.scrapeCompany ?? false,
    proxyConfiguration: overrides?.proxyConfiguration ?? { useApifyProxy: true },
  };
}

export interface ApifyLinkedInItem {
  id?: string | number;
  urn?: string;
  jobId?: string | number;
  title?: string;
  position?: string;
  company?: string;
  companyName?: string;
  companyUrl?: string;
  companyLogo?: string;
  location?: string;
  url?: string;
  jobUrl?: string;
  postUrl?: string;
  link?: string;
  description?: string;
  text?: string;
  content?: string;
  benefits?: string;
  postedAt?: string;
  postedDate?: string;
  postedTimeAgo?: string;
  date?: string;
  createdAt?: string;
  isRemote?: boolean;
  workplaceType?: string;
  [key: string]: unknown;
}

/**
 * Parses raw items returned by Apify LinkedIn actor dataset into NormalizedJob array.
 */
export function parseApifyLinkedInItems(data: unknown): NormalizedJob[] {
  if (!Array.isArray(data)) return [];

  const jobs: NormalizedJob[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const raw = item as ApifyLinkedInItem;

    const sourceId = String(
      raw.jobId ||
      raw.id ||
      raw.urn ||
      raw.jobUrl ||
      raw.url ||
      raw.postUrl ||
      `li-${jobs.length + 1}`
    );

    let title = String(raw.title || raw.position || "").trim();
    let company = String(raw.company || raw.companyName || "").trim();
    let location = String(raw.location || "").trim();
    const url = String(raw.jobUrl || raw.url || raw.postUrl || raw.link || "").trim();
    const rawDescription = String(raw.description || raw.text || raw.content || raw.benefits || "");
    const description = stripHtml(rawDescription);

    // If title or company is missing (typical for LinkedIn post scrapers),
    // extract candidate info using our shared inbound parser heuristics
    if ((!title || !company) && (description || title)) {
      const parsedCandidates = parseInboundCandidates(`${title}\n${description}`, {
        source: "linkedin",
      });
      if (parsedCandidates.length > 0) {
        if (!title) title = parsedCandidates[0].title;
        if (!company) company = parsedCandidates[0].company;
        if (!location && parsedCandidates[0].location) location = parsedCandidates[0].location;
      }
    }

    if (!title) {
      title = "Software Engineer";
    }

    if (!company) {
      company = "LinkedIn Job";
    }

    if (!location) {
      location = "India";
    }

    let postedAt = new Date().toISOString();
    const rawDate = raw.postedDate || raw.postedAt || raw.date || raw.createdAt;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        postedAt = parsed.toISOString();
      }
    }

    const jobUrl = url || (raw.urn ? `https://www.linkedin.com/feed/update/${raw.urn}` : `https://www.linkedin.com/jobs/view/${sourceId}`);

    // The Apify LinkedIn search is configured as remote-only (workplaceType: "remote"),
    // so items default to remote unless explicitly overridden.
    const isRemote =
      raw.isRemote === true ||
      raw.workplaceType === "remote" ||
      /remote/i.test(String(raw.workplaceType || "")) ||
      /remote/i.test(location) ||
      /remote/i.test(description) ||
      true;

    jobs.push({
      source: "linkedin",
      sourceId,
      url: jobUrl,
      title,
      company,
      location,
      remoteScope: isRemote ? "Remote" : location,
      description,
      postedAt,
      tags: ["linkedin"],
      isRemote,
      workplaceType: raw.workplaceType || (isRemote ? "remote" : undefined),
    });
  }

  return jobs;
}

export interface FetchLinkedInApifyOptions {
  actorId?: string;
  token?: string;
  input?: ApifyLinkedInInput;
  fetchFn?: typeof fetch;
}

export interface StartApifyRunResult {
  started: boolean;
  apifyRunId?: string;
  apifyDatasetId?: string;
  startedAt?: string;
  status?: string;
  error?: string;
}

export interface ApifyRunStatusResult {
  status: "RUNNING" | "READY" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | string;
  defaultDatasetId?: string;
  error?: string;
}

export const APIFY_MIN_INTERVAL_HOURS = 20;
export const APIFY_MIN_INTERVAL_MS = APIFY_MIN_INTERVAL_HOURS * 60 * 60 * 1000;

/**
 * Sanitizes error messages by stripping query parameters from URLs (e.g. ?token=...)
 * and masking potential credential substrings.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return "unknown error";
  const msg = err instanceof Error ? err.message : String(err);
  // Strip query parameters from any URLs (e.g. https://...?... -> https://...)
  const stripped = msg.replace(/\?[^ \t\r\n'"]*/g, "");
  // Mask anything resembling a token or password
  return stripped.replace(/(?:key|token|secret|password|bearer|auth)[=:\s]+[A-Za-z0-9_\-\.]{8,}/gi, (m) => m.slice(0, 8) + "[MASKED]");
}

/**
 * Evaluates whether a new Apify actor run is allowed:
 * 1. Must have no pending run.
 * 2. Total cost guard: Refuses to start if more than 0 runs started in the last 20 hours (one per day).
 * A failed start does not count as a started run (only a successful start with a run id does).
 */
export function canStartNewApifyRun(
  recentRuns: Array<{ stats?: { apifyStartedAt?: string; apifyRunId?: string; apifyStatus?: string } | null }>,
  clock: () => number = Date.now
): { allowed: boolean; reason?: string } {
  const now = clock();
  let apifyRunsInLast20h = 0;
  let lastStartedTime: number | null = null;

  for (const run of recentRuns) {
    const stats = run.stats;
    if (!stats) continue;

    // Only successful starts with a real run id count as started runs
    if (!stats.apifyRunId || stats.apifyStatus === "FAILED") continue;

    const startedAtStr = stats.apifyStartedAt;
    if (!startedAtStr) continue;

    const startedTime = new Date(startedAtStr).getTime();
    if (isNaN(startedTime)) continue;

    if (lastStartedTime === null || startedTime > lastStartedTime) {
      lastStartedTime = startedTime;
    }

    if (now - startedTime < APIFY_MIN_INTERVAL_MS) {
      apifyRunsInLast20h++;
    }
  }

  // Cost guard: strictly refuse if 1 or more runs were started in the last 20 hours
  if (apifyRunsInLast20h >= 1) {
    const hoursAgo = lastStartedTime !== null ? ((now - lastStartedTime) / (1000 * 60 * 60)).toFixed(1) : "?";
    return {
      allowed: false,
      reason: `apify rate limit: last run was ${hoursAgo}h ago (minimum interval is 20h)`,
    };
  }

  return { allowed: true };
}

/**
 * Starts an asynchronous LinkedIn Apify actor run.
 * Never waits for completion. Returns run id and default dataset id immediately.
 */
export async function startApifyLinkedInRun(
  options?: FetchLinkedInApifyOptions
): Promise<StartApifyRunResult> {
  const token = options?.token ?? process.env.APIFY_API_TOKEN;
  const rawActorId =
    options?.actorId ??
    process.env.APIFY_LINKEDIN_ACTOR_ID ??
    DEFAULT_LINKEDIN_ACTOR_ID;

  if (!token) {
    return {
      started: false,
      error: "apify not configured",
    };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const rawInput = options?.input ?? buildApifyLinkedInInput();
  const input = { ...rawInput };
  // automly/linkedin-jobs-scraper actor requires a single enum value for experienceLevel
  // ("", "internship", "entry", "associate", "mid-senior", "director", "executive").
  // If comma-separated (e.g. "internship,entry"), normalize to "entry".
  if (input.experienceLevel && input.experienceLevel.includes(",")) {
    input.experienceLevel = input.experienceLevel.includes("entry") ? "entry" : "internship";
  }

  const formattedActorId = encodeURIComponent(rawActorId.replace("/", "~"));
  const url = `https://api.apify.com/v2/acts/${formattedActorId}/runs?maxTotalChargeUsd=0.25`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      let detail = "";
      try {
        const text = await res.text();
        try {
          const errJson = JSON.parse(text) as {
            error?: { message?: string; type?: string } | string;
            message?: string;
          };
          if (typeof errJson.error === "object" && errJson.error?.message) {
            detail = errJson.error.message;
            if (errJson.error.type) {
              detail = `${errJson.error.type}: ${detail}`;
            }
          } else if (typeof errJson.error === "string") {
            detail = errJson.error;
          } else if (errJson.message) {
            detail = errJson.message;
          } else {
            detail = text;
          }
        } catch {
          detail = text;
        }
      } catch {
        // failed to read body
      }

      const sanitizedDetail = sanitizeErrorMessage(detail).trim();
      const truncated = sanitizedDetail.length > 200 ? sanitizedDetail.slice(0, 200) + "..." : sanitizedDetail;
      const errorMsg = truncated
        ? `Apify start returned HTTP ${res.status}: ${truncated}`
        : `Apify start returned HTTP ${res.status}`;

      return {
        started: false,
        error: errorMsg,
      };
    }

    const json = (await res.json()) as { data?: { id?: string; defaultDatasetId?: string; status?: string } };
    const apifyRunId = json.data?.id;
    const apifyDatasetId = json.data?.defaultDatasetId;

    if (!apifyRunId || !apifyDatasetId) {
      return {
        started: false,
        error: "Apify start response missing run or dataset id",
      };
    }

    return {
      started: true,
      apifyRunId,
      apifyDatasetId,
      startedAt: new Date().toISOString(),
      status: json.data?.status || "RUNNING",
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      started: false,
      error: `Apify start request failed: ${sanitizeErrorMessage(err)}`,
    };
  }
}

/**
 * Checks the execution status of an active or past Apify actor run.
 */
export async function checkApifyRunStatus(
  runId: string,
  options?: { token?: string; fetchFn?: typeof fetch }
): Promise<ApifyRunStatusResult> {
  const token = options?.token ?? process.env.APIFY_API_TOKEN;
  if (!token) {
    return { status: "FAILED", error: "apify not configured" };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const url = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        status: "FAILED",
        error: `Apify run check returned HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    return {
      status: json.data?.status || "RUNNING",
      defaultDatasetId: json.data?.defaultDatasetId,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      status: "RUNNING",
      error: `Apify status check failed: ${sanitizeErrorMessage(err)}`,
    };
  }
}

/**
 * Fetches items from a completed Apify dataset (up to limit).
 */
export async function fetchApifyDatasetItems(
  datasetId: string,
  options?: { token?: string; limit?: number; fetchFn?: typeof fetch }
): Promise<AdapterResult> {
  const token = options?.token ?? process.env.APIFY_API_TOKEN;
  if (!token) {
    return { jobs: [], error: "apify not configured" };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const limit = options?.limit ?? 200;
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?limit=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        jobs: [],
        error: `Apify dataset fetch returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const jobs = parseApifyLinkedInItems(data);
    return { jobs };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      jobs: [],
      error: `Apify dataset fetch failed: ${sanitizeErrorMessage(err)}`,
    };
  }
}

/**
 * Backward compatibility adapter: fetches or checks Apify LinkedIn jobs.
 */
export async function fetchLinkedInApify(
  options?: FetchLinkedInApifyOptions
): Promise<AdapterResult> {
  const startRes = await startApifyLinkedInRun(options);
  if (!startRes.started) {
    return {
      jobs: [],
      error: startRes.error,
    };
  }
  // If run started, we don't block waiting. Results will be collected when SUCCEEDED.
  return {
    jobs: [],
  };
}
