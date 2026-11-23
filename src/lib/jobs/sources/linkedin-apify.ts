import { NormalizedJob, AdapterResult, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { parseInboundCandidates } from "../../inbound/parse";

export const DEFAULT_LINKEDIN_ACTOR_ID = "curious_coder~linkedin-post-search-scraper";

export interface ApifyLinkedInItem {
  id?: string | number;
  urn?: string;
  jobId?: string | number;
  title?: string;
  position?: string;
  company?: string;
  companyName?: string;
  location?: string;
  url?: string;
  jobUrl?: string;
  postUrl?: string;
  link?: string;
  description?: string;
  text?: string;
  content?: string;
  postedAt?: string;
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
      raw.id ||
      raw.urn ||
      raw.jobId ||
      raw.url ||
      raw.jobUrl ||
      raw.postUrl ||
      `li-${jobs.length + 1}`
    );

    let title = String(raw.title || raw.position || "").trim();
    let company = String(raw.company || raw.companyName || "").trim();
    let location = String(raw.location || "").trim();
    const url = String(raw.url || raw.jobUrl || raw.postUrl || raw.link || "").trim();
    const rawDescription = String(raw.description || raw.text || raw.content || "");
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
      company = "LinkedIn Post";
    }

    if (!location) {
      location = raw.isRemote ? "Remote" : "India";
    }

    let postedAt = new Date().toISOString();
    const rawDate = raw.postedAt || raw.date || raw.createdAt;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        postedAt = parsed.toISOString();
      }
    }

    const jobUrl = url || (raw.urn ? `https://www.linkedin.com/feed/update/${raw.urn}` : `https://www.linkedin.com/jobs/view/${sourceId}`);

    jobs.push({
      source: "linkedin",
      sourceId,
      url: jobUrl,
      title,
      company,
      location,
      remoteScope: raw.isRemote || /remote/i.test(location) ? "Remote" : location,
      description,
      postedAt,
      tags: ["linkedin"],
      isRemote: raw.isRemote || /remote/i.test(location) || /remote/i.test(description),
      workplaceType: raw.workplaceType,
    });
  }

  return jobs;
}

export interface FetchLinkedInApifyOptions {
  actorId?: string;
  token?: string;
  keywords?: string[];
  limit?: number;
  postedWithin?: string;
  fetchFn?: typeof fetch;
}

/**
 * Fetches LinkedIn jobs/posts via Apify actor.
 * If APIFY_API_TOKEN is missing, fails open by returning { jobs: [], error: "apify not configured" }.
 */
export async function fetchLinkedInApify(
  options?: FetchLinkedInApifyOptions
): Promise<AdapterResult> {
  const token = options?.token ?? process.env.APIFY_API_TOKEN;
  const actorId =
    options?.actorId ??
    process.env.APIFY_LINKEDIN_ACTOR_ID ??
    DEFAULT_LINKEDIN_ACTOR_ID;

  if (!token) {
    return {
      jobs: [],
      error: "apify not configured",
    };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const limit = options?.limit ?? 25;
  const postedWithin = options?.postedWithin ?? "3d";

  const defaultKeywords = [
    "fresher software engineer",
    "junior software engineer",
    "early career software engineer",
    "junior developer react python",
    "remote india",
  ];
  const query = options?.keywords?.join(" OR ") ?? defaultKeywords.join(" OR ");

  const encodedActorId = encodeURIComponent(actorId);
  const url = `https://api.apify.com/v2/acts/${encodedActorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        maxItems: limit,
        postedWithin,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        jobs: [],
        error: `Apify returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const jobs = parseApifyLinkedInItems(data);
    return { jobs };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      jobs: [],
      error: `Apify request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
