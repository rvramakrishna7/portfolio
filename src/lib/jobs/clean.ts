/**
 * Strips HTML tags and entities, normalizing whitespace.
 * Truncates to maxChars (default 8000).
 */
export function stripHtml(html: string, maxChars = 8000): string {
  if (!html) return "";

  // Replace common block breaks with newline
  let text = html
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode basic HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"');

  // Collapse consecutive whitespaces within lines
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  if (text.length > maxChars) {
    return text.slice(0, maxChars);
  }

  return text;
}

/**
 * Hand-written lightweight XML item parser for RSS feeds.
 * Parses <item>...</item> blocks without external dependencies.
 */
export interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  category?: string[];
  [key: string]: unknown;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item(?:>|\s[^>]*>)([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    const item: RssItem = {};

    // Helper to extract tag text (including CDATA)
    const extractTag = (tag: string): string => {
      const tagRegex = new RegExp(
        `<${tag}(?:>|\\s[^>]*>)([\\s\\S]*?)<\\/${tag}>`,
        "i"
      );
      const tagMatch = tagRegex.exec(itemContent);
      if (!tagMatch) return "";
      let val = tagMatch[1].trim();
      const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(val);
      if (cdataMatch) {
        val = cdataMatch[1].trim();
      }
      return val;
    };

    item.title = extractTag("title");
    item.link = extractTag("link");
    item.description = extractTag("description") || extractTag("content:encoded");
    item.pubDate = extractTag("pubDate");
    item.guid = extractTag("guid");

    // Extract categories
    const catRegex = /<category(?:>|\s[^>]*>)([\s\S]*?)<\/category>/gi;
    let catMatch: RegExpExecArray | null;
    const categories: string[] = [];
    while ((catMatch = catRegex.exec(itemContent)) !== null) {
      let val = catMatch[1].trim();
      const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(val);
      if (cdataMatch) {
        val = cdataMatch[1].trim();
      }
      if (val) categories.push(val);
    }
    if (categories.length > 0) {
      item.category = categories;
    }

    items.push(item);
  }

  return items;
}
