import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";

export interface RemoteOkRawItem {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  tags?: string[];
  date?: string;
  url?: string;
  salary_min?: number;
  salary_max?: number;
  legal?: string;
}

export function parseRemoteOkJobs(data: unknown): NormalizedJob[] {
  if (!Array.isArray(data)) return [];

  const jobs: NormalizedJob[] = [];

  for (const item of data) {
    // First item or any item with "legal" notice must be skipped
    if (!item || typeof item !== "object" || "legal" in item) {
      continue;
    }

    const raw = item as RemoteOkRawItem;
    if (!raw.id || !raw.position) {
      continue;
    }

    const sourceId = String(raw.id);
    const title = String(raw.position).trim();
    const company = String(raw.company || "Unknown Company").trim();
    const location = String(raw.location || "Remote").trim();
    const remoteScope = location;
    const url = raw.url || `https://remoteok.com/remote-jobs/${sourceId}`;
    const description = stripHtml(raw.description || "");
    const postedAt = raw.date
      ? new Date(raw.date).toISOString()
      : new Date().toISOString();
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
      : [];

    let salaryText: string | undefined;
    if (raw.salary_min && raw.salary_max) {
      salaryText = `$${raw.salary_min.toLocaleString()} - $${raw.salary_max.toLocaleString()}`;
    }

    jobs.push({
      source: "remoteok",
      sourceId,
      url,
      title,
      company,
      location,
      remoteScope,
      description,
      postedAt,
      tags,
      salaryText,
    });
  }

  return jobs;
}

export async function fetchRemoteOk(
  fetchFn: typeof fetch = fetch
): Promise<AdapterResult> {
  const url = "https://remoteok.com/api";

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
          error: `RemoteOK returned HTTP ${res.status}`,
        };
      }

      const json = await res.json();
      return { jobs: parseRemoteOkJobs(json) };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (attempt === 1) {
        continue;
      }
      return {
        jobs: [],
        error: `RemoteOK fetch error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { jobs: [], error: "RemoteOK failed after retries" };
}
