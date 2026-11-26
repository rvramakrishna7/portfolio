// Turns a stored job description or original message into readable text for the "Read full description" box.

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "with", "in", "on", "at", "by", "our", "your", "as"]);

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Removes HTML tags, style blocks, attribute leftovers and CSS lines from an email body. */
export function stripMarkup(input: string): string {
  let text = input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  // Tags cut in half leave attribute text behind: name="value" pairs and a stray ">"
  text = text.replace(/[\w:-]+\s*=\s*"[^"]*"/g, " ").replace(/\s>\s?/g, " ");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && !/^[a-z-]+\s*:\s*[^;]+;?\s*$/i.test(line) && !/^[{}]+$/.test(line))
    .join("\n");
}

function endsSentence(line: string): boolean {
  return /[.!?:;)\]]$/.test(line);
}

/** Joins lines that a scraper broke in the middle of a sentence (bold text, links) and keeps real headings and bullets apart. */
export function joinBrokenLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    const prev = out[out.length - 1];
    if (prev) {
      const lastWord = prev.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      const prevWords = prev.split(/\s+/).length;
      const lineWords = line.split(/\s+/).length;
      const startsLower = /^[a-z]/.test(line);
      const midSentence = prevWords >= 4 && /^[A-Z]/.test(prev) && !endsSentence(prev) && lineWords <= 3;
      if (!endsSentence(prev) && (startsLower || STOPWORDS.has(lastWord) || midSentence)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function readableDescription(input: string | null | undefined): string {
  if (!input) return "";
  const stripped = /<[a-z!/][^>]*>/i.test(input) || /\b(?:style|href|width|cellpadding)\s*=\s*"/i.test(input) ? stripMarkup(input) : input;
  return joinBrokenLines(stripped.replace(/\r\n/g, "\n")).trim();
}

/** Short label for a long tracking link: the site name only. */
export function shortLinkLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 || u.search ? `${u.host}${u.pathname.length > 30 ? u.pathname.slice(0, 30) + "..." : u.pathname}` : u.host;
  } catch {
    return url.slice(0, 60);
  }
}

/** True when a post has no real description: only a title, a link or a contact line. Experience cannot be read from it. */
export function isThinDescription(text: string | null | undefined): boolean {
  const bare = (text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return bare.length < 160;
}

/** Sites that need a login. They cannot be read from the server and are not scraped. */
export function needsLogin(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in";
  } catch {
    return false;
  }
}
