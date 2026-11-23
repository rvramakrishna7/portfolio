import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { calculateJobAgeDays } from "../freshness";
import { isExcludedTitle } from "../../../config/job-profile";

export interface GreenhouseJobItem {
  id: number | string;
  title: string;
  updated_at?: string;
  absolute_url: string;
  location?: {
    name?: string;
  };
  content?: string;
}

export interface GreenhouseApiResponse {
  jobs?: GreenhouseJobItem[];
}

export function parseGreenhouseJobs(data: unknown, token: string): NormalizedJob[] {
  if (!data || typeof data !== "object") return [];
  const resp = data as GreenhouseApiResponse;
  if (!Array.isArray(resp.jobs)) return [];

  const normalized: NormalizedJob[] = [];
  const companyName = token.charAt(0).toUpperCase() + token.slice(1);

  for (const item of resp.jobs) {
    if (!item.id || !item.title) continue;

    const title = String(item.title).trim();
    // Pre-filter: skip senior/management and non-engineering roles
    if (isExcludedTitle(title)) {
      continue;
    }

    const postedAt = item.updated_at
      ? new Date(item.updated_at).toISOString()
      : new Date().toISOString();

    // Pre-filter: skip jobs older than 10 days
    if (calculateJobAgeDays(postedAt) > 10) {
      continue;
    }

    const rawLoc = item.location?.name?.trim();
    const location = rawLoc || "Unknown";
    const workplaceType = (item as { workplace_type?: string }).workplace_type?.trim();
    const isRemote =
      workplaceType?.toLowerCase() === "remote" ||
      (rawLoc ? /\bremote\b/i.test(rawLoc) : false);

    const description = stripHtml(item.content || "").slice(0, 8000);
    const sourceId = `${token}_${item.id}`;
    const url = item.absolute_url || `https://boards.greenhouse.io/${token}/jobs/${item.id}`;

    normalized.push({
      source: "greenhouse",
      sourceId,
      url,
      applyUrl: `${url}#app`,
      title,
      company: companyName,
      location,
      remoteScope: location,
      description,
      postedAt,
      tags: [token.toLowerCase()],
      isRemote,
      workplaceType,
    });
  }

  return normalized;
}

export async function fetchGreenhouseBoard(token: string): Promise<AdapterResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
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
      return { jobs: [], error: `Greenhouse (${token}) returned HTTP ${res.status}` };
    }

    const json = await res.json();
    const jobs = parseGreenhouseJobs(json, token);
    return { jobs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { jobs: [], error: `Greenhouse (${token}) network error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
