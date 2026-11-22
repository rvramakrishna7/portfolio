import { NormalizedJob, AdapterResult, USER_AGENT, REQUEST_TIMEOUT_MS } from "../types";
import { stripHtml, parseRssItems } from "../clean";

export function parseWeWorkRemotelyRss(xml: string): NormalizedJob[] {
  const items = parseRssItems(xml);
  const jobs: NormalizedJob[] = [];

  for (const item of items) {
    if (!item.title || !item.link) continue;

    // WeWorkRemotely RSS title format is typically "Company: Position Title"
    let company = "WeWorkRemotely Listing";
    let title = item.title;

    if (item.title.includes(":")) {
      const parts = item.title.split(":");
      company = parts[0].trim();
      title = parts.slice(1).join(":").trim();
    }

    const sourceId =
      item.guid ||
      item.link.replace(/https?:\/\/weworkremotely\.com\/remote-jobs\//i, "").replace(/\/$/, "") ||
      item.link;

    const url = item.link;
    const location = "Remote";
    const remoteScope = "Remote (WeWorkRemotely)";
    const description = stripHtml(item.description || "");
    const postedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();
    const tags = Array.isArray(item.category)
      ? item.category.map((c) => String(c).toLowerCase().trim()).filter(Boolean)
      : [];

    jobs.push({
      source: "weworkremotely",
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

export async function fetchWeWorkRemotely(
  fetchFn: typeof fetch = fetch
): Promise<AdapterResult> {
  const feeds = [
    "https://weworkremotely.com/remote-jobs.rss",
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  ];

  const allJobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  const errors: string[] = [];

  for (let i = 0; i < feeds.length; i++) {
    const feedUrl = feeds[i];
    if (i > 0) {
      // 1s delay between multiple page/feed requests
      await new Promise((r) => setTimeout(r, 1000));
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetchFn(feedUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/rss+xml, application/xml, text/xml",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status >= 500 && attempt === 1) {
          continue;
        }

        if (!res.ok) {
          errors.push(`${feedUrl} returned HTTP ${res.status}`);
          break;
        }

        const xml = await res.text();
        const parsed = parseWeWorkRemotelyRss(xml);
        for (const job of parsed) {
          if (!seenIds.has(job.sourceId)) {
            seenIds.add(job.sourceId);
            allJobs.push(job);
          }
        }
        break; // Success on this feed
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (attempt === 1) {
          continue;
        }
        errors.push(
          `${feedUrl} error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return {
    jobs: allJobs,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}
