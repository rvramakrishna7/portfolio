import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";

export interface JobicyRawItem {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobGeo?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  jobIndustry?: string[];
  annualSalaryMin?: string;
  annualSalaryMax?: string;
  salaryCurrency?: string;
}

export function parseJobicyJobs(data: unknown): NormalizedJob[] {
  if (!data || typeof data !== "object") return [];
  const rawList = (data as { jobs?: JobicyRawItem[] }).jobs;
  if (!Array.isArray(rawList)) return [];

  const jobs: NormalizedJob[] = [];

  for (const item of rawList) {
    if (!item.id || !item.jobTitle) continue;

    const sourceId = String(item.id);
    const title = String(item.jobTitle).trim();
    const company = String(item.companyName || "Unknown Company").trim();
    const location = String(item.jobGeo || "Remote").trim();
    const remoteScope = location;
    const url = item.url || `https://jobicy.com/jobs/${sourceId}`;
    const descContent = item.jobDescription || item.jobExcerpt || "";
    const description = stripHtml(descContent);
    const postedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();
    const tags = Array.isArray(item.jobIndustry)
      ? item.jobIndustry.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
      : [];

    let salaryText: string | undefined;
    if (item.annualSalaryMin && item.annualSalaryMax) {
      salaryText = `${item.salaryCurrency || "USD"} ${item.annualSalaryMin} - ${item.annualSalaryMax}`;
    }

    jobs.push({
      source: "jobicy",
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

export async function fetchJobicy(
  fetchFn: typeof fetch = fetch
): Promise<AdapterResult> {
  const url = "https://jobicy.com/api/v2/remote-jobs?count=50";

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
          error: `Jobicy returned HTTP ${res.status}`,
        };
      }

      const json = await res.json();
      return { jobs: parseJobicyJobs(json) };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (attempt === 1) {
        continue;
      }
      return {
        jobs: [],
        error: `Jobicy fetch error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { jobs: [], error: "Jobicy failed after retries" };
}
