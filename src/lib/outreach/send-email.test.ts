import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { InMemoryJobsRepository } from "../jobs/repository";
import {
  sendDraftEmail,
  sendAllApproved,
  startOfTodayIst,
  sendableProblem,
  getDailySendCap,
  type MailMessage,
  type MailSetup,
} from "./send-email";

function makeSetup(behaviour: (message: MailMessage, call: number) => Promise<unknown> | unknown = () => ({})) {
  const sent: MailMessage[] = [];
  let calls = 0;
  const setup: MailSetup = {
    from: "owner@example.com",
    transport: {
      sendMail: async (message) => {
        calls++;
        const result = await behaviour(message, calls);
        sent.push(message);
        return result;
      },
    },
  };
  return { setup, sent, calls: () => calls };
}

describe("Send approved email drafts from Gmail (src/lib/outreach/send-email.ts)", () => {
  let repo: InMemoryJobsRepository;
  let n = 0;

  async function seedDraft(overrides: { recipient?: string | null; subject?: string | null; approve?: boolean; kind?: "email" | "linkedin_dm" } = {}) {
    n++;
    const sourceId = `send-job-${n}`;
    await repo.upsertJob(
      {
        source: "test",
        sourceId,
        title: "Junior Engineer",
        company: `Company ${n}`,
        url: "https://example.com",
        location: "Remote",
        remoteScope: "Worldwide",
        tags: [],
        description: "Test description",
        postedAt: new Date().toISOString(),
      },
      { expMinYears: 0, expClass: "fresher", geoEligibility: "worldwide", geoReason: "ok", skills: [], summaryLine: "ok", matchScore: 90 }
    );
    const [draft] = await repo.createDrafts(sourceId, [
      {
        kind: overrides.kind ?? "email",
        subject: overrides.subject === undefined ? `Hello ${n}` : overrides.subject,
        body: `Body ${n}`,
        recipient: overrides.recipient === undefined ? `hr${n}@company${n}.com` : overrides.recipient,
      },
    ]);
    if (overrides.approve !== false) {
      await repo.updateDraft(draft.id, { status: "approved" });
    }
    return draft.id;
  }

  beforeEach(() => {
    repo = new InMemoryJobsRepository();
  });

  it("sends an approved email draft once, from the owner's address, and marks it sent as email", async () => {
    const id = await seedDraft();
    const { setup, sent } = makeSetup();

    const result = await sendDraftEmail(repo, id, { setup });

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "owner@example.com", subject: expect.stringContaining("Hello"), text: expect.stringContaining("Body") });
    const stored = await repo.getDraftById(id);
    expect(stored?.sent_channel).toBe("email");
    expect(stored?.sent_at).toBeTruthy();
  });

  it("refuses drafts that are not sendable and never calls the mail transport", async () => {
    const { setup, calls } = makeSetup();
    const notApproved = await seedDraft({ approve: false });
    const noRecipient = await seedDraft({ recipient: null });
    const badRecipient = await seedDraft({ recipient: "not-an-email" });
    const injectedRecipient = await seedDraft({ recipient: "a@b.com\r\nBcc: victim@c.com" });
    const injectedSubject = await seedDraft({ subject: "Hi\r\nBcc: victim@c.com" });
    const noSubject = await seedDraft({ subject: "  " });
    const notEmail = await seedDraft({ kind: "linkedin_dm" });

    for (const id of [notApproved, noRecipient, badRecipient, injectedRecipient, injectedSubject, noSubject, notEmail]) {
      const result = await sendDraftEmail(repo, id, { setup });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_sendable");
    }
    expect(calls()).toBe(0);
  });

  it("is not configured without a mail setup, and nothing is claimed", async () => {
    const id = await seedDraft();
    const result = await sendDraftEmail(repo, id, { setup: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
    expect((await repo.getDraftById(id))?.sent_at).toBeFalsy();
  });

  it("a double click sends exactly one mail", async () => {
    const id = await seedDraft();
    const { setup, calls } = makeSetup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {};
    });

    const [a, b] = await Promise.all([sendDraftEmail(repo, id, { setup }), sendDraftEmail(repo, id, { setup })]);

    expect(calls()).toBe(1);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const failed = [a, b].find((r) => !r.ok);
    expect(failed && !failed.ok && failed.code).toBe("already_sent");
  });

  it("a draft that was already sent is never sent again", async () => {
    const id = await seedDraft();
    const { setup, calls } = makeSetup();
    await sendDraftEmail(repo, id, { setup });
    const again = await sendDraftEmail(repo, id, { setup });
    expect(again.ok).toBe(false);
    expect(calls()).toBe(1);
  });

  it("a login refused by Gmail undoes the claim, so the draft can be sent after the fix", async () => {
    const id = await seedDraft();
    const failing = makeSetup(() => {
      throw Object.assign(new Error("Invalid login: 535 secret-provider-text"), { code: "EAUTH" });
    });

    const result = await sendDraftEmail(repo, id, { setup: failing.setup });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("send_failed");
      expect(result.message).not.toContain("secret-provider-text");
    }
    expect((await repo.getDraftById(id))?.sent_at).toBeFalsy();

    const working = makeSetup();
    const retry = await sendDraftEmail(repo, id, { setup: working.setup });
    expect(retry.ok).toBe(true);
  });

  it("an unknown outcome (timeout while sending) stays marked sent and is never retried by itself", async () => {
    const id = await seedDraft();
    const timeout = makeSetup(() => {
      throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT", command: "DATA" });
    });

    const result = await sendDraftEmail(repo, id, { setup: timeout.setup });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unconfirmed");
    expect((await repo.getDraftById(id))?.sent_at).toBeTruthy();

    const working = makeSetup();
    const again = await sendDraftEmail(repo, id, { setup: working.setup });
    expect(again.ok).toBe(false);
    expect(working.calls()).toBe(0);
  });

  it("the daily cap counts mail sent today in India time and blocks the next one", async () => {
    const { setup, calls } = makeSetup();
    const ids = [await seedDraft(), await seedDraft(), await seedDraft()];

    const first = await sendDraftEmail(repo, ids[0], { setup, cap: 2 });
    const second = await sendDraftEmail(repo, ids[1], { setup, cap: 2 });
    const third = await sendDraftEmail(repo, ids[2], { setup, cap: 2 });

    expect(first.ok && second.ok).toBe(true);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.code).toBe("daily_cap");
    expect(calls()).toBe(2);
    expect((await repo.getDraftById(ids[2]))?.sent_at).toBeFalsy();
  });

  it("startOfTodayIst is midnight in India time and mail from yesterday does not count", async () => {
    // 2026-11-25 20:00 UTC = 2026-11-26 01:30 IST, so "today" in India started at 2026-11-25 18:30 UTC
    const now = new Date("2026-11-25T20:00:00Z");
    expect(startOfTodayIst(now).toISOString()).toBe("2026-11-25T18:30:00.000Z");
    // 2026-11-25 18:29 UTC = 23:59 IST on the 25th, still the previous India day
    expect(startOfTodayIst(new Date("2026-11-25T18:29:00Z")).toISOString()).toBe("2026-11-24T18:30:00.000Z");

    const id = await seedDraft();
    const yesterday = await repo.claimDraftForSend(id, "email");
    expect(yesterday).not.toBeNull();
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(await repo.countEmailDraftsSentSince(startOfTodayIst(future).toISOString())).toBe(0);
    expect(await repo.countEmailDraftsSentSince(startOfTodayIst(new Date()).toISOString())).toBe(1);
  });

  it("send all: sends oldest first up to the cap, then reports the cap and leaves the rest approved", async () => {
    const { setup, sent } = makeSetup();
    const ids = [await seedDraft(), await seedDraft(), await seedDraft()];

    const summary = await sendAllApproved(repo, { setup, cap: 2, delayMs: 0 });

    expect(summary.sent).toBe(2);
    expect(summary.stoppedBecause).toBe("daily_cap");
    const firstTwo = [(await repo.getDraftById(ids[0]))?.recipient, (await repo.getDraftById(ids[1]))?.recipient];
    expect(sent.map((m) => m.to)).toEqual(firstTwo);
    expect((await repo.getDraftById(ids[2]))?.sent_at).toBeFalsy();
  });

  it("send all: stops at the first login failure instead of trying every draft", async () => {
    const failing = makeSetup(() => {
      throw Object.assign(new Error("bad login"), { code: "EAUTH" });
    });
    await seedDraft();
    await seedDraft();
    await seedDraft();

    const summary = await sendAllApproved(repo, { setup: failing.setup, cap: 20, delayMs: 0 });

    expect(summary.sent).toBe(0);
    expect(failing.calls()).toBe(1);
    expect(summary.stoppedBecause).toBe("send_failed");
  });

  it("send all: never sends more than the per-request limit and skips drafts that are not sendable", async () => {
    const { setup, sent } = makeSetup();
    for (let i = 0; i < 4; i++) await seedDraft();
    await seedDraft({ recipient: null });
    await seedDraft({ approve: false });

    const summary = await sendAllApproved(repo, { setup, cap: 50, delayMs: 0, maxPerRequest: 3 });

    expect(summary.sent).toBe(3);
    expect(sent).toHaveLength(3);
    expect(summary.eligibleLeft).toBe(1);
  });

  it("send all without a mail setup sends nothing", async () => {
    await seedDraft();
    const summary = await sendAllApproved(repo, { setup: null, delayMs: 0 });
    expect(summary.sent).toBe(0);
    expect(summary.stoppedBecause).toBe("not_configured");
  });

  it("sendableProblem and the cap setting behave", () => {
    expect(sendableProblem({ kind: "email", status: "approved", recipient: "a@b.co", subject: "s", body: "b" } as never)).toBeNull();
    const saved = process.env.OUTREACH_DAILY_SEND_CAP;
    try {
      delete process.env.OUTREACH_DAILY_SEND_CAP;
      expect(getDailySendCap()).toBe(20);
      process.env.OUTREACH_DAILY_SEND_CAP = "5";
      expect(getDailySendCap()).toBe(5);
      process.env.OUTREACH_DAILY_SEND_CAP = "9999";
      expect(getDailySendCap()).toBe(100);
      process.env.OUTREACH_DAILY_SEND_CAP = "abc";
      expect(getDailySendCap()).toBe(20);
    } finally {
      if (saved === undefined) delete process.env.OUTREACH_DAILY_SEND_CAP;
      else process.env.OUTREACH_DAILY_SEND_CAP = saved;
    }
  });

  it("the database claim is one conditional statement (unsent, email, approved) and the release only touches email claims", () => {
    const source = readFileSync("src/lib/jobs/repository.ts", "utf8").replace(/\r\n/g, "\n");
    const claim = source.slice(source.indexOf("async claimDraftForSend(id: string, channel: string): Promise<OutreachDraft | null> {\n    const sql"));
    expect(claim).toContain("AND sent_at IS NULL");
    expect(claim).toContain("AND kind = 'email'");
    expect(claim).toContain("AND status = 'approved'");
    expect(source).toContain("WHERE id = ${id}::uuid AND sent_channel = 'email'");
  });
});

describe("email formatting", async () => {
  const { buildEmailParts } = await import("./email-format");

  it("keeps the approved body and adds work links and a signature", () => {
    const parts = buildEmailParts("Hi Asha,\n\nI built a thing. See https://example.test/r/abc23456.\n\nThanks");
    expect(parts.text).toContain("I built a thing. See https://example.test/r/abc23456.");
    expect(parts.text).toContain("Selected work:");
    expect(parts.text).toContain("https://github.com/rvramakrishna7/vouch");
    expect(parts.html).toContain('href="https://example.test/r/abc23456"');
    expect(parts.html).toContain("Selected work");
    expect(parts.html).not.toContain("<img");
  });

  it("escapes html in the body", () => {
    const parts = buildEmailParts('Hi <script>alert("x")</script>');
    expect(parts.html).not.toContain("<script>");
    expect(parts.html).toContain("&lt;script&gt;");
  });
});
