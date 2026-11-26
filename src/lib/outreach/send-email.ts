import nodemailer from "nodemailer";
import type { JobsRepository, OutreachDraft } from "../jobs/repository";
import { buildEmailParts, type EmailMode } from "./email-format";

// Sending outreach email from the owner's own Gmail, one draft at a time, only when the owner clicks.
// Safety rules, all enforced here and covered by tests:
// - only an approved email draft with a valid recipient is sent, and never twice (atomic claim in the repository)
// - a daily cap (default 20) counted from the drafts already sent today (India time)
// - a draft is marked sent BEFORE the mail leaves, so a crash or a double click can never send it twice.
//   If the mail definitely did not leave (login refused, no connection, recipient refused) the claim is undone.
//   If the outcome is unknown (timeout while sending) it stays marked sent and the owner is told to check Gmail Sent.
// - the mail never contains the password, and error messages shown to the owner never contain provider text.

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export interface MailSetup {
  transport: MailTransport;
  from: string;
  fromName?: string;
}

export type SendCode =
  | "not_found"
  | "not_sendable"
  | "already_sent"
  | "daily_cap"
  | "not_configured"
  | "send_failed"
  | "unconfirmed"
  | "db_error";

export type SendResult =
  | { ok: true; draft: OutreachDraft }
  | { ok: false; code: SendCode; message: string };

export const DEFAULT_DAILY_SEND_CAP = 20;
export const MAX_DAILY_SEND_CAP = 100;
export const MAX_SENDS_PER_REQUEST = 10;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const HEADER_BREAK = /[\r\n]/;

// Errors that happen before any message data is sent: the mail definitely did not leave.
const NOT_SENT_CODES = new Set(["EAUTH", "EENVELOPE", "ENOTFOUND", "EDNS", "ECONNREFUSED"]);
const NOT_SENT_COMMANDS = new Set(["CONN", "EHLO", "HELO", "STARTTLS", "AUTH PLAIN", "AUTH LOGIN", "MAIL FROM", "RCPT TO"]);

export function getDailySendCap(): number {
  const raw = Number.parseInt(process.env.OUTREACH_DAILY_SEND_CAP ?? "", 10);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_DAILY_SEND_CAP;
  return Math.min(raw, MAX_DAILY_SEND_CAP);
}

// Midnight today in India time (UTC+05:30), as a UTC Date.
export function startOfTodayIst(now: Date = new Date()): Date {
  const istMs = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(istMs / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

export function sendableProblem(draft: OutreachDraft): string | null {
  if (draft.kind !== "email") return "Only email drafts can be sent from here.";
  if (draft.status !== "approved") return "Approve the draft before sending it.";
  const recipient = (draft.recipient ?? "").trim();
  if (!recipient) return "Add a recipient email address first.";
  if (HEADER_BREAK.test(recipient) || !EMAIL_PATTERN.test(recipient)) return "The recipient is not a valid email address.";
  const subject = (draft.subject ?? "").trim();
  if (!subject) return "Add a subject first.";
  if (HEADER_BREAK.test(subject)) return "The subject must be a single line.";
  if (!draft.body || !draft.body.trim()) return "The draft body is empty.";
  return null;
}

// The mail setup from environment variables. In the e2e run (E2E_SEED=1) a fake transport is used, so tests never send real mail.
export function getMailSetup(): MailSetup | null {
  if (process.env.E2E_SEED === "1") {
    return { transport: { sendMail: async () => ({ accepted: [] }) }, from: "e2e-sender@example.test" };
  }
  const user = process.env.GMAIL_IMAP_USER?.trim();
  const pass = process.env.GMAIL_IMAP_APP_PASSWORD?.trim();
  if (!user || !pass) return null;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return { transport, from: user, fromName: "Ramakrishna" };
}

function wasDefinitelyNotSent(error: unknown): boolean {
  const e = error as { code?: unknown; command?: unknown } | null;
  if (typeof e?.code === "string" && NOT_SENT_CODES.has(e.code)) return true;
  if (typeof e?.command === "string" && NOT_SENT_COMMANDS.has(e.command)) return true;
  return false;
}

function safeFailureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "EAUTH") return "Gmail refused the login. Check GMAIL_IMAP_USER and the app password.";
  if (code === "EENVELOPE") return "Gmail refused the recipient address.";
  if (code === "ENOTFOUND" || code === "EDNS" || code === "ECONNREFUSED" || code === "ECONNECTION") {
    return "Could not reach Gmail. Try again in a moment.";
  }
  return "Sending failed.";
}

export interface SendOptions {
  setup?: MailSetup | null;
  now?: Date;
  cap?: number;
  // How the email looks. Plain by default: the safest choice for a first message to a company.
  mode?: EmailMode;
  // Keep the tracked portfolio link (default true).
  track?: boolean;
}

export async function sendDraftEmail(repo: JobsRepository, draftId: string, options: SendOptions = {}): Promise<SendResult> {
  const now = options.now ?? new Date();
  const cap = options.cap ?? getDailySendCap();
  const setup = options.setup === undefined ? getMailSetup() : options.setup;

  let draft: OutreachDraft | null;
  try {
    draft = await repo.getDraftById(draftId);
  } catch {
    return { ok: false, code: "db_error", message: "The database could not be read." };
  }
  if (!draft) return { ok: false, code: "not_found", message: "Draft not found." };
  if (draft.sent_at) return { ok: false, code: "already_sent", message: "This draft was already sent." };

  const problem = sendableProblem(draft);
  if (problem) return { ok: false, code: "not_sendable", message: problem };

  if (!setup) {
    return { ok: false, code: "not_configured", message: "Email sending is not configured (GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD)." };
  }

  try {
    const sentToday = await repo.countEmailDraftsSentSince(startOfTodayIst(now).toISOString());
    if (sentToday >= cap) {
      return { ok: false, code: "daily_cap", message: `Daily limit reached (${sentToday} of ${cap} sent today). Try again tomorrow.` };
    }
  } catch {
    return { ok: false, code: "db_error", message: "The database could not be read." };
  }

  // Claim first. If two requests race, exactly one gets the draft.
  let claimed: OutreachDraft | null;
  try {
    claimed = await repo.claimDraftForSend(draftId, "email");
  } catch {
    return { ok: false, code: "db_error", message: "The draft could not be reserved for sending." };
  }
  if (!claimed) return { ok: false, code: "already_sent", message: "This draft was already sent." };

  try {
    const parts = buildEmailParts(draft.body, options.mode ?? "plain", { track: options.track !== false });
    await setup.transport.sendMail({
      from: setup.fromName ? `"${setup.fromName}" <${setup.from}>` : setup.from,
      replyTo: setup.from,
      to: (draft.recipient ?? "").trim(),
      subject: (draft.subject ?? "").trim(),
      text: parts.text,
      html: parts.html,
    });
  } catch (error) {
    if (wasDefinitelyNotSent(error)) {
      try {
        await repo.releaseDraftSend(draftId);
      } catch {
        return {
          ok: false,
          code: "unconfirmed",
          message: "Sending failed and the draft could not be reset. Check it before trying again.",
        };
      }
      return { ok: false, code: "send_failed", message: safeFailureMessage(error) };
    }
    return {
      ok: false,
      code: "unconfirmed",
      message: "Gmail did not confirm the send. The draft is marked sent. Check your Gmail Sent folder before sending again.",
    };
  }

  return { ok: true, draft: claimed };
}

export interface SendAllSummary {
  sent: number;
  failed: number;
  skipped: Array<{ id: string; code: SendCode; message: string }>;
  stoppedBecause: SendCode | null;
  remainingToday: number;
  eligibleLeft: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Sends the approved, unsent email drafts (oldest first), at most MAX_SENDS_PER_REQUEST per call, one after another.
// Stops at the first problem that would hit every draft (not configured, daily cap, login refused, database).
export async function sendAllApproved(
  repo: JobsRepository,
  options: SendOptions & { delayMs?: number; maxPerRequest?: number } = {}
): Promise<SendAllSummary> {
  const now = options.now ?? new Date();
  const cap = options.cap ?? getDailySendCap();
  const setup = options.setup === undefined ? getMailSetup() : options.setup;
  const delayMs = options.delayMs ?? 1500;
  const maxPerRequest = options.maxPerRequest ?? MAX_SENDS_PER_REQUEST;

  const approved = await repo.listDrafts({ status: "approved", kind: "email", limit: 500 });
  const queue = approved
    .filter((d) => !d.sent_at && sendableProblem(d) === null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const summary: SendAllSummary = { sent: 0, failed: 0, skipped: [], stoppedBecause: null, remainingToday: 0, eligibleLeft: queue.length };

  const sentBefore = setup ? await repo.countEmailDraftsSentSince(startOfTodayIst(now).toISOString()) : 0;
  summary.remainingToday = Math.max(0, cap - sentBefore);

  for (const draft of queue) {
    if (summary.sent + summary.failed >= maxPerRequest) break;
    const result = await sendDraftEmail(repo, draft.id, { setup, now, cap, mode: options.mode, track: options.track });
    if (result.ok) {
      summary.sent++;
      summary.eligibleLeft--;
      summary.remainingToday = Math.max(0, summary.remainingToday - 1);
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }
    summary.skipped.push({ id: draft.id, code: result.code, message: result.message });
    if (result.code === "already_sent") {
      summary.eligibleLeft--;
      continue;
    }
    summary.failed++;
    if (result.code === "unconfirmed") summary.eligibleLeft--;
    if (["not_configured", "daily_cap", "db_error", "unconfirmed"].includes(result.code) || result.message.includes("refused the login")) {
      summary.stoppedBecause = result.code;
      break;
    }
  }
  return summary;
}
