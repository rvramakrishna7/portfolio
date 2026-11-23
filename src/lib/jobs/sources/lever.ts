import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { calculateJobAgeDays } from "../freshness";
import { isExcludedTitle } from "../../../config/job-profile";

export interface LeverJobItem {
  id: string;
  text: string;
  createdAt?: number | string;
  hostedUrl: string;
  applyUrl?: string;
  workplaceType?: string;
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
    workplaceType?: string;
  };
  description?: string;
  descriptionPlain?: string;
}

export function parseLeverJobs(data: unknown, site: string): NormalizedJob[] {
  if (!Array.isArray(data)) return [];

  const normalized: NormalizedJob[] = [];
  const companyName = site.charAt(0).toUpperCase() + site.slice(1);

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const raw = item as LeverJobItem;
    if (!raw.id || !raw.text) continue;

    const title = String(raw.text).trim();
    // Pre-filter: skip senior/management and non-engineering roles
    if (isExcludedTitle(title)) {
      continue;
    }

    const postedAt = raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString();

    // Pre-filter: skip jobs older than 10 days
    if (calculateJobAgeDays(postedAt) > 10) {
      continue;
    }

    const rawLoc = raw.categories?.location?.trim();
    const workplaceType = raw.workplaceType?.trim() || raw.categories?.workplaceType?.trim();
    const isRemote =
      workplaceType?.toLowerCase() === "remote" ||
      (rawLoc ? /\bremote\b/i.test(rawLoc) : false);
    const location = rawLoc || (isRemote ? "Remote" : "Unknown");
    const descText = raw.descriptionPlain || stripHtml(raw.description || "");
    const description = descText.slice(0, 8000);
    const sourceId = `${site}_${raw.id}`;
    const url = raw.hostedUrl || `https://jobs.lever.co/${site}/${raw.id}`;
    const applyUrl = raw.applyUrl || `${url}/apply`;

    normalized.push({
      source: "lever",
      sourceId,
      url,
      applyUrl,
      title,
      company: companyName,
      location,
      remoteScope: location,
      description,
      postedAt,
      tags: [site.toLowerCase()],
      isRemote,
      workplaceType,
    });
  }

  return normalized;
}

export async function fetchLeverBoard(site: string): Promise<AdapterResult> {
  const url = `https://api.lever.co/v0/postings/${site}?mode=json`;
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
      return { jobs: [], error: `Lever (${site}) returned HTTP ${res.status}` };
    }

    const json = await res.json();
    const jobs = parseLeverJobs(json, site);
    return { jobs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { jobs: [], error: `Lever (${site}) network error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
