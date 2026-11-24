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
    return {
      fetched,
      added,
      duplicates,
      filtered,
      seen,
      fromKnownSender,
      fromFallbackSubject,
      parsedJobs,
      error: `imap error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore disconnect errors
    }
  }
}
