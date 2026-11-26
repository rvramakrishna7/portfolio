import { ImapFlow } from "imapflow";
import { JobsRepository, getJobsRepository } from "../jobs/repository";
import { sanitizeErrorMessage } from "../jobs/sources/linkedin-apify";

export interface SentSyncResult {
  looked: number;
  marked: number;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const SENT_FOLDER_GUESSES = ["[Gmail]/Sent Mail", "[Google Mail]/Sent Mail", "Sent"];

// Finds the Gmail Sent folder. Special-use flag first, then the usual names.
async function openSentFolder(client: ImapFlow) {
  try {
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === "\\Sent");
    if (sent) return await client.getMailboxLock(sent.path, { readOnly: true });
  } catch {
    // fall through to the name guesses
  }
  for (const name of SENT_FOLDER_GUESSES) {
    try {
      return await client.getMailboxLock(name, { readOnly: true });
    } catch {
      // try the next name
    }
  }
  return null;
}

/**
 * Email drafts that have a recipient but are not marked sent: look in the Gmail Sent folder for a message to that
 * address written after the draft was created. If one is there the draft is marked sent with the real send date.
 * This covers mails you send yourself from Gmail (Copy, Copy formatted, Open in Gmail), so nothing needs to be marked sent manually.
 */
export async function syncSentFromGmail(options?: {
  repo?: JobsRepository;
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  maxDurationMs?: number;
  now?: Date;
  clientFactory?: (opts: unknown) => ImapFlow;
}): Promise<SentSyncResult> {
  const repo = options?.repo ?? getJobsRepository();
  const user = options?.user ?? process.env.GMAIL_IMAP_USER;
  const password = options?.password ?? process.env.GMAIL_IMAP_APP_PASSWORD;
  const host = options?.host ?? process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
  const port = options?.port ?? parseInt(process.env.GMAIL_IMAP_PORT || "993", 10);
  if (!user || !password) return { looked: 0, marked: 0, error: "imap not configured" };

  const now = options?.now ?? new Date();
  const cutoff = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const candidates = (await repo.listDrafts({ kind: "email", limit: 500 }))
    .filter(
      (d) =>
        !d.sent_at &&
        d.status !== "discarded" &&
        Boolean(d.recipient && d.recipient.trim()) &&
        new Date(d.created_at).getTime() >= cutoff
    )
    .slice(0, 30);
  if (candidates.length === 0) return { looked: 0, marked: 0 };

  const opts = { host, port, secure: true, auth: { user, pass: password }, logger: false as const };
  const client = options?.clientFactory ? options.clientFactory(opts) : new ImapFlow(opts);
  const deadline = Date.now() + (options?.maxDurationMs ?? 12000);
  let marked = 0;

  try {
    await client.connect();
    const lock = await openSentFolder(client);
    if (!lock) return { looked: 0, marked: 0, error: "Could not find the Gmail Sent folder" };
    try {
      for (const draft of candidates) {
        if (Date.now() >= deadline) break;
        const to = (draft.recipient as string).trim().toLowerCase();
        const createdAt = new Date(draft.created_at);
        try {
          const uids = (await client.search({ since: new Date(createdAt.getTime() - DAY_MS), to }, { uid: true })) || [];
          let sentAt: Date | null = null;
          for (const uid of uids.slice(-5).reverse()) {
            const msg = await client.fetchOne(String(uid), { envelope: true, internalDate: true }, { uid: true });
            if (!msg) continue;
            const rawWhen = msg.envelope?.date ?? msg.internalDate ?? null;
            const when = rawWhen ? new Date(rawWhen) : null;
            // Only mail written after the draft existed counts (an older mail to the same person is not this outreach)
            if (when && when.getTime() >= createdAt.getTime() - 60 * 1000) {
              if (!sentAt || when.getTime() > sentAt.getTime()) sentAt = when;
            }
          }
          if (sentAt) {
            const updated = await repo.markDraftSent(draft.id, "gmail_sent_folder", sentAt.toISOString());
            if (updated) marked++;
          }
        } catch {
          // One failed lookup must not stop the others
        }
      }
    } finally {
      lock.release();
    }
    return { looked: candidates.length, marked };
  } catch (err: unknown) {
    return { looked: candidates.length, marked, error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}
