import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { parseInboundCandidates, processAndIngestInboundCandidates } from "./parse";
import { isKnownAlertSender } from "../../config/alert-senders";
import { JobsRepository, getJobsRepository } from "../jobs/repository";

export interface ImapIngestionResult {
  fetched: number;
  added: number;
  duplicates: number;
  filtered: number;
  seen: number;
  fromKnownSender: number;
  fromFallbackSubject: number;
  parsedJobs: number;
  error?: string;
}

export interface ImapOptions {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  maxMessages?: number;
  maxDurationMs?: number;
  repo?: JobsRepository;
  clientFactory?: (opts: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    logger: boolean;
  }) => ImapFlow;
}

/**
 * Sanitizes strings from IMAP operations to avoid leaking credentials or email addresses.
 */
export function sanitizeImapText(text: string, secrets: string[] = []): string {
  if (!text) return "";
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 3) {
      out = out.split(s).join("[MASKED]");
    }
  }
  // Strip URLs with userinfo: http://user:pass@host -> http://host
  out = out.replace(/https?:\/\/[^\s@]+@/gi, "https://");
  // Strip query parameters from any URLs (e.g. ?token=...)
  out = out.replace(/\?[^ \t\r\n'"]*/g, "");
  // Mask email addresses
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]");
  // Mask anything resembling password/secret/token
  out = out.replace(/(?:key|token|secret|password|bearer|auth|pass)[=:\s]+[A-Za-z0-9_\-\.]{4,}/gi, (m) => m.slice(0, 5) + "[MASKED]");
  return out;
}

/**
 * Builds a short, sanitized error string from an IMAP error.
 */
export function formatImapError(err: unknown, secrets: string[] = []): string {
  if (!err) return "imap error: unknown error";

  const e = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};

  // 1. authenticationFailed
  if (e.authenticationFailed) {
    let tag = "";
    if (typeof e.responseText === "string" && e.responseText.trim()) {
      const match = e.responseText.match(/\[([A-Z0-9_-]+)\]/i);
      if (match) {
        tag = match[1].toUpperCase();
      } else if (/^[A-Z0-9_-]+$/i.test(e.responseText.trim())) {
        tag = e.responseText.trim().toUpperCase();
      }
    }
    if (!tag && typeof e.responseStatus === "string" && e.responseStatus.trim()) {
      tag = e.responseStatus.trim().toUpperCase();
    }

    if (tag) {
      return `imap error: login rejected by Gmail (${tag})`;
    }
    return "imap error: login rejected by Gmail (check app password / security alert)";
  }

  // 2. Network / Socket codes (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, etc.)
  if (e.code) {
    const code = String(e.code).toUpperCase();
    if (code === "ETIMEDOUT" || code === "TIMEOUT") {
      return "imap error: timeout";
    }
    if (code === "ECONNREFUSED") {
      return "imap error: connection refused (ECONNREFUSED)";
    }
    if (code === "ENOTFOUND") {
      return "imap error: host not found (ENOTFOUND)";
    }
    return `imap error: ${code.toLowerCase()}`;
  }

  if (typeof e.message === "string" && /\bETIMEDOUT\b/i.test(e.message)) {
    return "imap error: timeout";
  }

  // 3. Response text / status (e.g. IMAP Command failed with responseText)
  if (e.responseText) {
    const cleanText = sanitizeImapText(String(e.responseText), secrets);
    const msg = e.message ? sanitizeImapText(String(e.message), secrets) : "";
    const statusPart = e.responseStatus ? ` (${sanitizeImapText(String(e.responseStatus), secrets)})` : "";
    if (msg && !cleanText.includes(msg)) {
      return `imap error: ${msg}: ${cleanText}${statusPart}`.trim();
    }
    return `imap error: ${cleanText}${statusPart}`.trim();
  }

  if (e.responseStatus) {
    const status = sanitizeImapText(String(e.responseStatus), secrets);
    const msg = e.message ? sanitizeImapText(String(e.message), secrets) : "";
    return `imap error: ${msg ? `${msg} (${status})` : status}`;
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const sanitized = sanitizeImapText(rawMsg, secrets);
  return `imap error: ${sanitized}`;
}

/**
 * Extracts and parses job candidates from a single parsed email object.
 */
export async function parseEmailContent(
  mail: ParsedMail,
  repo: JobsRepository
): Promise<{ added: number; duplicates: number; filtered: number }> {
  const content = mail.html || mail.text || "";
  if (!content) {
    return { added: 0, duplicates: 0, filtered: 0 };
  }

  const candidates = parseInboundCandidates(content, {
    source: "email",
  });

  if (candidates.length === 0) {
    return { added: 0, duplicates: 0, filtered: 0 };
  }

  const result = await processAndIngestInboundCandidates(candidates, repo);
  return {
    added: result.added,
    duplicates: result.duplicates,
    filtered: result.filtered,
  };
}

/**
 * Ingests job alert emails from Gmail via read-only IMAP.
 * Fails open if credentials are not configured.
 */
export async function ingestGmailAlerts(
  options?: ImapOptions
): Promise<ImapIngestionResult> {
  const user = options?.user ?? process.env.GMAIL_IMAP_USER;
  const password = options?.password ?? process.env.GMAIL_IMAP_APP_PASSWORD;
  const host = options?.host ?? process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
  const port = options?.port ?? parseInt(process.env.GMAIL_IMAP_PORT || "993", 10);

  if (!user || !password) {
    return {
      fetched: 0,
      added: 0,
      duplicates: 0,
      filtered: 0,
      seen: 0,
      fromKnownSender: 0,
      fromFallbackSubject: 0,
      parsedJobs: 0,
      error: "imap not configured",
    };
  }

  const repo = options?.repo ?? getJobsRepository();
  const maxMessages = options?.maxMessages ?? 30;
  const maxDurationMs = options?.maxDurationMs ?? 10000;
  const deadline = Date.now() + maxDurationMs;

  const client = options?.clientFactory
    ? options.clientFactory({
        host,
        port,
        secure: true,
        auth: { user, pass: password },
        logger: false,
      })
    : new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass: password },
        logger: false,
      });

  let fetched = 0;
  let added = 0;
  let duplicates = 0;
  let filtered = 0;
  let seen = 0;
  let fromKnownSender = 0;
  let fromFallbackSubject = 0;
  let parsedJobs = 0;

  try {
    await client.connect();

    // Open INBOX strictly read-only
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });

    try {
      // Search for messages received within the last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // Search sequence numbers
      const messages = await client.search(
        { since: threeDaysAgo },
        { uid: true }
      );

      seen = messages ? messages.length : 0;

      if (!messages || messages.length === 0) {
        return {
          fetched: 0,
          added: 0,
          duplicates: 0,
          filtered: 0,
          seen: 0,
          fromKnownSender: 0,
          fromFallbackSubject: 0,
          parsedJobs: 0,
        };
      }

      // Process up to maxMessages, newest first
      const uidsToFetch = messages.slice(-maxMessages).reverse();

      for (const uid of uidsToFetch) {
        if (Date.now() >= deadline - 800) {
          break;
        }

        try {
          const download = await client.download(String(uid), undefined, { uid: true });
          if (!download?.content) continue;

          fetched++;
          const parsed = await simpleParser(download.content);

          const fromAddress = parsed.from?.value?.[0]?.address || "";
          const subject = parsed.subject || "";

          const isKnown = isKnownAlertSender(fromAddress, subject);
          const isFallback = !isKnown && /job|hiring|opening|alert|recommended|opportunities|roles?/i.test(subject);

          if (isKnown) {
            fromKnownSender++;
          } else if (isFallback) {
            fromFallbackSubject++;
          }

          if (isKnown || isFallback) {
            const ingestRes = await parseEmailContent(parsed, repo);
            added += ingestRes.added;
            duplicates += ingestRes.duplicates;
            filtered += ingestRes.filtered;
            parsedJobs += (ingestRes.added + ingestRes.duplicates + ingestRes.filtered);
          }
        } catch (msgErr) {
          console.warn(`[imap] Failed to process message UID ${uid}:`, msgErr);
        }
      }
    } finally {
      lock.release();
    }

    return {
      fetched,
      added,
      duplicates,
      filtered,
      seen,
      fromKnownSender,
      fromFallbackSubject,
      parsedJobs,
    };
  } catch (err: unknown) {
    const secrets: string[] = [];
    if (user) secrets.push(user);
    if (password) secrets.push(password);
    return {
      fetched,
      added,
      duplicates,
      filtered,
      seen,
      fromKnownSender,
      fromFallbackSubject,
      parsedJobs,
      error: formatImapError(err, secrets),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore disconnect errors
    }
  }
}
