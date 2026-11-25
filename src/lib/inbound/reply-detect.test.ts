import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchRepliesAndAlert, isLinkedInMessagingOrAccepted, checkRepliesAndAlert } from "./reply-detect";
import { InMemoryJobsRepository } from "../jobs/repository";

describe("Reply Detection and Alerts (src/lib/inbound/reply-detect.ts)", () => {
  let repo: InMemoryJobsRepository;

  beforeEach(async () => {
    repo = new InMemoryJobsRepository();
    // Seed job
    await repo.upsertJob(
      {
        source: "test",
        sourceId: "job-apple-1",
        title: "Staff Engineer",
        company: "Acme Corp",
        url: "https://example.com",
        location: "Remote",
        remoteScope: "Worldwide",
        tags: [],
        description: "Test description",
        postedAt: new Date().toISOString(),
      },
      {
        expMinYears: 3,
        expClass: "junior",
        geoEligibility: "worldwide",
        geoReason: "ok",
        skills: ["TypeScript"],
        summaryLine: "Great role",
        matchScore: 95,
      }
    );

    // Create a sent draft with recipient
    const drafts = await repo.createDrafts("job-apple-1", [
      {
        kind: "email",
        body: "Hello",
        recipient: "recruiter@acmecorp.com",
      },
    ]);
    await repo.markDraftSent(drafts[0].id, "email");
  });

  it("isLinkedInMessagingOrAccepted correctly identifies messaging notification and excludes job alerts", () => {
    expect(
      isLinkedInMessagingOrAccepted(
        "messages-noreply@linkedin.com",
        "John Doe sent you a message",
        "Hi Ramakrishna, saw your profile"
      )
    ).toBe(true);

    expect(
      isLinkedInMessagingOrAccepted(
        "invitations@linkedin.com",
        "Jane Doe accepted your invitation to connect",
        ""
      )
    ).toBe(true);

    expect(
      isLinkedInMessagingOrAccepted(
        "jobalerts-noreply@linkedin.com",
        "30+ new jobs for Software Engineer",
        "Apply to Acme Corp"
      )
    ).toBe(false);
  });

  it("exact match: sender address matches drafts.recipient -> records exact event and sets job status to replied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
    process.env.TELEGRAM_CHAT_ID = "12345678";

    const res = await matchRepliesAndAlert(
      [
        {
          messageId: "msg-exact-1",
          fromAddress: "recruiter@acmecorp.com",
          subject: "Re: Full-Stack AI Engineering - Ramakrishna",
          textSnippet: "We loved your projects, let's schedule an interview.",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo,
      { telegramFetchFn: fetchMock as unknown as typeof fetch }
    );

    expect(res.exactMatches).toBe(1);
    expect(res.alertsSent).toBe(1);

    const job = await repo.getJobById("job-apple-1");
    expect(job?.status).toBe("replied");

    const events = await repo.replyEventsForJob("job-apple-1");
    expect(events).toHaveLength(1);
    expect(events[0].match_kind).toBe("exact");
    expect(events[0].alerted_at).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.telegram.org"),
      expect.objectContaining({
        body: expect.stringContaining("Reply from Acme Corp:"),
      })
    );
  });

  it("possible match: LinkedIn messaging containing company name -> records possible event, does NOT change status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
    process.env.TELEGRAM_CHAT_ID = "12345678";

    const res = await matchRepliesAndAlert(
      [
        {
          messageId: "msg-li-1",
          fromAddress: "messages-noreply@linkedin.com",
          subject: "Sarah from Acme Corp messaged you",
          textSnippet: "Thanks for reaching out regarding our developer opening at Acme Corp",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo,
      { telegramFetchFn: fetchMock as unknown as typeof fetch }
    );

    expect(res.possibleMatches).toBe(1);
    expect(res.alertsSent).toBe(1);

    const job = await repo.getJobById("job-apple-1");
    expect(job?.status).not.toBe("replied"); // Does NOT change status automatically

    const events = await repo.replyEventsForJob("job-apple-1");
    expect(events).toHaveLength(1);
    expect(events[0].match_kind).toBe("possible");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.telegram.org"),
      expect.objectContaining({
        body: expect.stringContaining("Possible reply: Acme Corp"),
      })
    );
  });

  it("no match: unrelated email does not create events or alerts", async () => {
    const fetchMock = vi.fn();
    const res = await matchRepliesAndAlert(
      [
        {
          messageId: "msg-random-1",
          fromAddress: "newsletter@substack.com",
          subject: "Weekly AI Digest",
          textSnippet: "Latest updates in tech",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo,
      { telegramFetchFn: fetchMock as unknown as typeof fetch }
    );

    expect(res.exactMatches).toBe(0);
    expect(res.possibleMatches).toBe(0);
    expect(res.alertsSent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("duplicate message id: idempotent and does not create duplicate event or alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
    process.env.TELEGRAM_CHAT_ID = "12345678";

    await matchRepliesAndAlert(
      [
        {
          messageId: "msg-dup-1",
          fromAddress: "recruiter@acmecorp.com",
          subject: "Hello",
          textSnippet: "Body",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo,
      { telegramFetchFn: fetchMock as unknown as typeof fetch }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Run again with identical messageId
    const res2 = await matchRepliesAndAlert(
      [
        {
          messageId: "msg-dup-1",
          fromAddress: "recruiter@acmecorp.com",
          subject: "Hello duplicate",
          textSnippet: "Body duplicate",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo,
      { telegramFetchFn: fetchMock as unknown as typeof fetch }
    );

    expect(res2.exactMatches).toBe(0); // a repeated message is not counted as a new reply
    expect(res2.alertsSent).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not called again
  });

  it("a repeated or later reply never moves a job back from interview to replied", async () => {
    const message = {
      messageId: "msg-keep-status-1",
      fromAddress: "recruiter@acmecorp.com",
      subject: "Hello",
      textSnippet: "Body",
      receivedAt: new Date().toISOString(),
    };
    await matchRepliesAndAlert([message], repo);
    expect((await repo.getJobById("job-apple-1"))?.status).toBe("replied");

    await repo.updateJobStatus("job-apple-1", "interview");

    // the same mail is read again on the next run
    await matchRepliesAndAlert([message], repo);
    expect((await repo.getJobById("job-apple-1"))?.status).toBe("interview");

    // a different, later mail from the same recruiter also keeps the status
    await matchRepliesAndAlert([{ ...message, messageId: "msg-keep-status-2" }], repo);
    expect((await repo.getJobById("job-apple-1"))?.status).toBe("interview");
  });

  it("skips Telegram alert silently when env vars are missing and leaves reply unalerted", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const res = await matchRepliesAndAlert(
      [
        {
          messageId: "msg-no-env-1",
          fromAddress: "recruiter@acmecorp.com",
          subject: "Hello",
          textSnippet: "Body",
          receivedAt: new Date().toISOString(),
        },
      ],
      repo
    );

    expect(res.exactMatches).toBe(1);
    expect(res.alertsSent).toBe(0);

    const unalerted = await repo.listUnalertedReplies();
    expect(unalerted).toHaveLength(1);
    expect(unalerted[0].message_id).toBe("msg-no-env-1");
  });

  it("checkRepliesAndAlert reads GMAIL_IMAP_APP_PASSWORD, the same variable as the alert email reader", async () => {
    const saved = { user: process.env.GMAIL_IMAP_USER, pass: process.env.GMAIL_IMAP_APP_PASSWORD, legacy: process.env.GMAIL_IMAP_PASS };
    try {
      delete process.env.GMAIL_IMAP_PASS;
      process.env.GMAIL_IMAP_USER = "owner@example.com";

      // Not configured: no password means no connection attempt
      delete process.env.GMAIL_IMAP_APP_PASSWORD;
      const missing = await checkRepliesAndAlert({ repo });
      expect(missing.error).toBe("imap not configured");

      // Configured: the app password reaches the IMAP client
      process.env.GMAIL_IMAP_APP_PASSWORD = "app-pass-value";
      let seenAuth: { user?: string; pass?: string } | undefined;
      const fakeClient = {
        connect: async () => {
          throw new Error("stop after connect");
        },
        logout: async () => {},
      };
      const res = await checkRepliesAndAlert({
        repo,
        clientFactory: (opts) => {
          seenAuth = (opts as { auth: { user?: string; pass?: string } }).auth;
          return fakeClient as never;
        },
      });
      expect(seenAuth).toEqual({ user: "owner@example.com", pass: "app-pass-value" });
      expect(res.error).not.toBe("imap not configured");
    } finally {
      for (const [key, value] of [
        ["GMAIL_IMAP_USER", saved.user],
        ["GMAIL_IMAP_APP_PASSWORD", saved.pass],
        ["GMAIL_IMAP_PASS", saved.legacy],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
