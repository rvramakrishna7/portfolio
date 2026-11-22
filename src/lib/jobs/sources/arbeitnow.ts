import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";

export interface ArbeitnowRawItem {
  slug?: string;
  title?: string;
  company_name?: string;
  remote?: boolean;
  location?: string;
  description?: string;
  tags?: string[];
  created_at?: number | string;
  url?: string;
}

export function parseArbeitnowJobs(data: unknown): NormalizedJob[] {
  if (!data || typeof data !== "object") return [];
  const rawList = (data as { data?: ArbeitnowRawItem[] }).data;
  if (!Array.isArray(rawList)) return [];

  const jobs: NormalizedJob[] = [];

  for (const item of rawList) {
    // Only accept remote jobs
    if (!item.slug || !item.title || item.remote !== true) continue;

    const sourceId = String(item.slug);
    const title = String(item.title).trim();
    const company = String(item.company_name || "Unknown Company").trim();
    const location = String(item.location || "Remote").trim();
    const remoteScope = location;
    const url = item.url || `https://www.arbeitnow.com/view/${sourceId}`;
    const description = stripHtml(item.description || "");
    let postedAt = new Date().toISOString();
    if (typeof item.created_at === "number") {
      postedAt = new Date(item.created_at * 1000).toISOString();
    } else if (item.created_at) {
      postedAt = new Date(item.created_at).toISOString();
    }
    const tags = Array.isArray(item.tags)
      ? item.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
      : [];

    jobs.push({
      source: "arbeitnow",
      sourceId,
      url,
      title,
      company,
      location,
      remoteScope,
      description,
      postedAt,
      tags,
    });
  }

  return jobs;
}

export async function fetchArbeitnow(
  fetchFn: typeof fetch = fetch
): Promise<AdapterResult> {
  const url = "https://www.arbeitnow.com/api/job-board-api";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetchFn(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status >= 500 && attempt === 1) {
        continue;
      }

      if (!res.ok) {
        return {
          jobs: [],
          error: `Arbeitnow returned HTTP ${res.status}`,
        };
      }

      const json = await res.json();
      return { jobs: parseArbeitnowJobs(json) };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (attempt === 1) {
        continue;
      }
      return {
        jobs: [],
        error: `Arbeitnow fetch error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { jobs: [], error: "Arbeitnow failed after retries" };
}
