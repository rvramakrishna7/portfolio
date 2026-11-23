import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml } from "../clean";
import { calculateJobAgeDays } from "../freshness";
import { isExcludedTitle } from "../../../config/job-profile";

export interface HnCommentItem {
  id: number | string;
  author?: string;
  created_at?: string;
  text?: string;
  children?: HnCommentItem[];
}

export interface HnStoryItem {
  id: number | string;
  title?: string;
  created_at?: string;
  children?: HnCommentItem[];
}

const REMOTE_REGEX = /\b(remote|worldwide|anywhere|wfh)\b/i;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_REGEX = /https?:\/\/[^\s<>"'()]+/;

export function parseHnComments(
  storyId: string | number,
  comments: HnCommentItem[]
): NormalizedJob[] {
  if (!Array.isArray(comments)) return [];

  const normalized: NormalizedJob[] = [];

  for (const item of comments) {
    if (!item.id || !item.text) continue;

    // Check freshness: comments older than 10 days are skipped
    const postedAt = item.created_at
      ? new Date(item.created_at).toISOString()
      : new Date().toISOString();

    if (calculateJobAgeDays(postedAt) > 10) {
      continue;
    }

    const plainText = stripHtml(item.text).trim();

    // Must mention remote (skip on-site only)
    if (!REMOTE_REGEX.test(plainText)) {
      continue;
    }

    // Extract email and apply URL
    const emailMatch = plainText.match(EMAIL_REGEX);
    const contactEmail = emailMatch ? emailMatch[0] : undefined;

    const urlMatch = plainText.match(URL_REGEX);
    const itemUrl = `https://news.ycombinator.com/item?id=${item.id}`;
    const applyUrl = urlMatch ? urlMatch[0] : undefined;

    // Parse header line: "Company | Role | Location | REMOTE"
    const lines = plainText.split("\n").map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || "";

    let company = "Hacker News Startup";
    let title = "Software Engineer (HN Who is Hiring)";
    let location = "Remote";

    if (firstLine.includes("|")) {
      const parts = firstLine.split("|").map((p) => p.trim());
      if (parts[0]) company = parts[0];
      if (parts[1]) title = parts[1];
      if (parts.length > 2) location = parts.slice(2).join(", ");
    } else if (firstLine.includes(" - ")) {
      const parts = firstLine.split(" - ").map((p) => p.trim());
      if (parts[0]) company = parts[0];
      if (parts[1]) title = parts[1];
      if (parts.length > 2) location = parts.slice(2).join(", ");
    }

    // Pre-filter: skip senior/management and non-engineering titles
    if (isExcludedTitle(title)) {
      continue;
    }

    normalized.push({
      source: "hn",
      sourceId: `hn_${item.id}`,
      url: itemUrl,
      applyUrl: applyUrl || itemUrl,
      contactEmail,
      title,
      company,
      location,
      remoteScope: location,
      description: plainText.slice(0, 8000),
      postedAt,
      tags: ["hacker-news", "who-is-hiring"],
    });
  }

  return normalized;
}

export async function fetchHackerNews(): Promise<AdapterResult> {
  const searchUrl =
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const searchRes = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (!searchRes.ok) {
      return { jobs: [], error: `HN Algolia search returned HTTP ${searchRes.status}` };
    }

    const searchData = (await searchRes.json()) as {
      hits?: Array<{ objectID: string; title: string }>;
    };

    const latestStory = searchData.hits?.[0];
    if (!latestStory?.objectID) {
      return { jobs: [], error: "No 'Who is hiring' story found on HN" };
    }

    const storyUrl = `https://hn.algolia.com/api/v1/items/${latestStory.objectID}`;
    const storyRes = await fetch(storyUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (!storyRes.ok) {
      return { jobs: [], error: `HN Algolia story returned HTTP ${storyRes.status}` };
    }

    const storyData = (await storyRes.json()) as HnStoryItem;
    const comments = Array.isArray(storyData.children) ? storyData.children : [];
    const jobs = parseHnComments(latestStory.objectID, comments);

    return { jobs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { jobs: [], error: `HN network error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
