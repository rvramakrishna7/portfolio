import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { calculateJobAgeDays } from "../freshness";
import { isExcludedTitle } from "../../../config/job-profile";

export interface AshbyJobItem {
  id: string;
  title: string;
  department?: string;
  team?: string;
  location?: string;
  secondaryLocations?: string[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

export interface AshbyApiResponse {
  jobs?: AshbyJobItem[];
}

export function parseAshbyJobs(data: unknown, name: string): NormalizedJob[] {
  if (!data || typeof data !== "object") return [];
  const resp = data as AshbyApiResponse;
  const list = Array.isArray(resp.jobs)
    ? resp.jobs
    : Array.isArray(data)
    ? (data as AshbyJobItem[])
    : [];

  const normalized: NormalizedJob[] = [];
  const companyName = name.charAt(0).toUpperCase() + name.slice(1);

  for (const item of list) {
    if (!item.id || !item.title) continue;

    const title = String(item.title).trim();
    // Pre-filter: skip senior/management and non-engineering roles
    if (isExcludedTitle(title)) {
      continue;
    }

    const postedAt = item.publishedAt
      ? new Date(item.publishedAt).toISOString()
      : new Date().toISOString();

    // Pre-filter: skip jobs older than 10 days
    if (calculateJobAgeDays(postedAt) > 10) {
      continue;
    }

    const location = item.location?.trim() || (item.isRemote ? "Remote" : "Unknown");
    const descText = item.descriptionPlain || stripHtml(item.descriptionHtml || "");
    const description = descText.slice(0, 8000);
    const sourceId = `${name}_${item.id}`;
    const url = item.jobUrl || `https://jobs.ashbyhq.com/${name}/${item.id}`;
    const applyUrl = item.applyUrl || `${url}/application`;

    normalized.push({
      source: "ashby",
      sourceId,
      url,
      applyUrl,
      title,
      company: companyName,
      location,
      remoteScope: location,
      description,
      postedAt,
      tags: [name.toLowerCase()],
    });
  }

  return normalized;
}

export async function fetchAshbyBoard(name: string): Promise<AdapterResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${name}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return { jobs: [], error: `Ashby (${name}) returned HTTP ${res.status}` };
    }

    const json = await res.json();
    const jobs = parseAshbyJobs(json, name);
    return { jobs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { jobs: [], error: `Ashby (${name}) network error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
