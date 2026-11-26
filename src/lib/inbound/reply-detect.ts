import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { JobsRepository, getJobsRepository, OutreachDraft } from "../jobs/repository";
import { sendTelegramAlert } from "../alerts/telegram";
import { sanitizeErrorMessage } from "../jobs/sources/linkedin-apify";

export interface CheckRepliesResult {
  checked: number;
  exactMatches: number;
  possibleMatches: number;
  alertsSent: number;
  error?: string;
}

export interface InboundReplyMessage {
  messageId: string;
  fromAddress: string;
  subject: string;
  textSnippet: string;
  receivedAt: string;
}

const LINKEDIN_SENDER_PATTERN = /^[^@\s]+@(?:[a-z0-9-]+\.)*linkedin\.com$/i;

// Messaging or invitation-accepted notification types (NOT job alerts)
export function isLinkedInMessagingOrAccepted(fromAddress: string, subject: string, bodyText: string): boolean {
  if (!LINKEDIN_SENDER_PATTERN.test(fromAddress)) {
    return false;
  }
  // Exclude job alerts or search digests
  if (/job alert|new jobs|jobs you may be interested in|recommended jobs/i.test(subject)) {
    return false;
  }
  const combined = `${subject} ${bodyText}`.toLowerCase();
  return (
    /invitation accepted|accepted your invitation|sent you a message|messaged you|message from|inmail/i.test(combined)
  );
}

/**
 * Core reply detection logic given a stream/list of inbound messages and existing sent drafts.
 */
export async function matchRepliesAndAlert(
  messages: InboundReplyMessage[],
  repo: JobsRepository,
  options?: {
    telegramFetchFn?: typeof fetch;
  }
): Promise<{ exactMatches: number; possibleMatches: number; alertsSent: number }> {
  let exactMatches = 0;
  let possibleMatches = 0;

  // 1. Fetch all sent drafts
  // The Neon repository returns only the newest 100 drafts by default, which would hide replies to older mail
  const allDrafts = await repo.listDrafts({ limit: 1000 });
  const sentDrafts = allDrafts.filter((d) => Boolean(d.sent_at));
  if (sentDrafts.length === 0) {
    return { exactMatches: 0, possibleMatches: 0, alertsSent: 0 };
  }

  // Map of recipient address (lowercased) -> sentDraft
  const sentByRecipient = new Map<string, OutreachDraft>();
  for (const d of sentDrafts) {
    if (d.recipient) {
      sentByRecipient.set(d.recipient.trim().toLowerCase(), d);
    }
  }

  // Distinct jobs with sent drafts
  const jobsWithSentDrafts = new Map<string, { jobId: string; company: string; draftId?: string }>();
  for (const d of sentDrafts) {
    if (!jobsWithSentDrafts.has(d.job_id)) {
      const job = await repo.getJobById(d.job_id);
      const company = (d.job_company || job?.company || "").trim();
      jobsWithSentDrafts.set(d.job_id, {
        jobId: d.job_id,
        company,
        draftId: d.id,
      });
    }
  }

  for (const msg of messages) {
    const cleanFrom = msg.fromAddress.trim().toLowerCase();
    const snippet = (msg.subject || "").trim().slice(0, 120);

    // (a) Exact match: sender address equals a stored drafts.recipient
    const exactDraft = sentByRecipient.get(cleanFrom);
    if (exactDraft) {
      const event = await repo.recordReplyEvent({
        job_id: exactDraft.job_id,
        draft_id: exactDraft.id,
        match_kind: "exact",
        subject_snippet: snippet || "Direct reply",
        message_id: msg.messageId,
        received_at: msg.receivedAt,
      });
      // Only a newly recorded message counts. A message seen on an earlier run returns null.
      if (event) {
        exactMatches++;
        // Never move a job backwards: only jobs still before the reply stage become "replied"
        const matchedJob = await repo.getJobById(exactDraft.job_id);
        if (matchedJob && ["new", "shortlisted", "applied"].includes(matchedJob.status)) {
          await repo.updateJobStatus(exactDraft.job_id, "replied");
        }
      }
      continue;
    }

    // (b) Possible match: LinkedIn messaging or invitation-accepted notification emails
    if (isLinkedInMessagingOrAccepted(cleanFrom, msg.subject, msg.textSnippet)) {
      const combinedText = `${msg.subject} ${msg.textSnippet}`.toLowerCase();
      for (const [jobId, info] of jobsWithSentDrafts.entries()) {
        if (!info.company || info.company.length < 2) continue;
        const companyLower = info.company.toLowerCase();
        // Check if subject or body contains company name
        if (combinedText.includes(companyLower)) {
          const event = await repo.recordReplyEvent({
            job_id: jobId,
            draft_id: info.draftId || null,
            match_kind: "possible",
            subject_snippet: snippet || `LinkedIn notification for ${info.company}`,
            message_id: msg.messageId,
            received_at: msg.receivedAt,
          });
          if (event) {
            possibleMatches++;
          }
          break;
        }
      }
    }
  }

  // 2. Alert unalerted replies via Telegram
  const unalerted = await repo.listUnalertedReplies();
  let alertsSent = 0;
  for (const event of unalerted) {
    const job = await repo.getJobById(event.job_id);
    const companyName = job?.company || "Company";
    const text =
      event.match_kind === "exact"
        ? `Reply from ${companyName}: ${event.subject_snippet}`
        : `Possible reply: ${companyName}`;

    const sent = await sendTelegramAlert(text, options?.telegramFetchFn);
    if (sent) {
      await repo.markReplyAlerted(event.id);
      alertsSent++;
    }
  }

  return { exactMatches, possibleMatches, alertsSent };
}

/**
 * Checks IMAP INBOX for replies (last 14 days) and processes matches & Telegram alerts.
 */
export async function checkRepliesAndAlert(
  options?: {
    repo?: JobsRepository;
    user?: string;
    password?: string;
    host?: string;
    port?: number;
    maxMessages?: number;
    maxDurationMs?: number;
    clientFactory?: (opts: unknown) => ImapFlow;
    telegramFetchFn?: typeof fetch;
  }
): Promise<CheckRepliesResult> {
  const repo = options?.repo ?? getJobsRepository();
  const user = options?.user ?? process.env.GMAIL_IMAP_USER;
  const password = options?.password ?? process.env.GMAIL_IMAP_APP_PASSWORD;
  const host = options?.host ?? process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
  const port = options?.port ?? parseInt(process.env.GMAIL_IMAP_PORT || "993", 10);

  if (!user || !password) {
    return {
      checked: 0,
      exactMatches: 0,
      possibleMatches: 0,
      alertsSent: 0,
      error: "imap not configured",
    };
  }

  const maxMessages = options?.maxMessages ?? 50;
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

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });

    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const messages = await client.search({ since: fourteenDaysAgo }, { uid: true });

      if (!messages || messages.length === 0) {
        return {
          checked: 0,
          exactMatches: 0,
          possibleMatches: 0,
          alertsSent: 0,
        };
      }

      const uidsToFetch = messages.slice(-maxMessages).reverse();
      const extracted: InboundReplyMessage[] = [];

      for (const uid of uidsToFetch) {
        if (Date.now() >= deadline - 800) break;
        try {
          const download = await client.download(String(uid), undefined, { uid: true });
          if (!download?.content) continue;

          const parsed: ParsedMail = await simpleParser(download.content);
          const fromAddress = parsed.from?.value?.[0]?.address || "";
          const subject = parsed.subject || "";
          const textSnippet = (parsed.text || "").slice(0, 500);
          const messageId = parsed.messageId || `imap-msg-${uid}`;
          const receivedAt = parsed.date ? parsed.date.toISOString() : new Date().toISOString();

          extracted.push({
            messageId,
            fromAddress,
            subject,
            textSnippet,
            receivedAt,
          });
        } catch {
          // Skip unparsable email
        }
      }

      const matchRes = await matchRepliesAndAlert(extracted, repo, {
        telegramFetchFn: options?.telegramFetchFn,
      });

      return {
        checked: extracted.length,
        exactMatches: matchRes.exactMatches,
        possibleMatches: matchRes.possibleMatches,
        alertsSent: matchRes.alertsSent,
      };
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    return {
      checked: 0,
      exactMatches: 0,
      possibleMatches: 0,
      alertsSent: 0,
      error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore
    }
  }
}
