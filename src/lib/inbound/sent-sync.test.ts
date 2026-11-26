import { describe, it, expect } from "vitest";
import { InMemoryJobsRepository } from "../jobs/repository";
import { syncSentFromGmail } from "./sent-sync";

async function seed(repo: InMemoryJobsRepository, recipient: string | null, n: number) {
  await repo.upsertJob(
    {
      source: "t", sourceId: `s${n}`, url: `https://e.test/${n}`, title: "Dev", company: "Acme", location: "Remote",
      remoteScope: "", description: "d", postedAt: new Date().toISOString(), tags: [],
    },
    {} as never
  );
  const job = await repo.getJob("t", `s${n}`);
  const [draft] = await repo.createDrafts(job!.id, [{ kind: "email", subject: "Hi", body: "Hello", recipient }]);
  return draft;
}

function fakeClient(sentByRecipient: Record<string, Date[]>) {
  let lastTo = "";
  const lock = { release() {} };
  return {
    async connect() {},
    async logout() {},
    async list() {
      return [{ path: "[Gmail]/Sent Mail", specialUse: "\\Sent" }];
    },
    async getMailboxLock() {
      return lock;
    },
    async search(q: { to?: string }) {
      lastTo = q.to || "";
      return (sentByRecipient[lastTo] || []).map((_, i) => i + 1);
    },
    async fetchOne(uid: string) {
      const when = (sentByRecipient[lastTo] || [])[Number(uid) - 1];
      return { envelope: { date: when } };
    },
  };
}

describe("syncSentFromGmail (src/lib/inbound/sent-sync.ts)", () => {
  it("does nothing when IMAP is not configured", async () => {
    const repo = new InMemoryJobsRepository();
    const r = await syncSentFromGmail({ repo, user: "", password: "" });
    expect(r.error).toBe("imap not configured");
  });

  it("marks a draft sent with the real send date when Gmail Sent has a newer mail to that address", async () => {
    const repo = new InMemoryJobsRepository();
    const draft = await seed(repo, "jane@acme.com", 1);
    const sentWhen = new Date(Date.now() + 60 * 60 * 1000);
    const r = await syncSentFromGmail({
      repo,
      user: "me@gmail.com",
      password: "x",
      clientFactory: () => fakeClient({ "jane@acme.com": [sentWhen] }) as never,
    });
    expect(r).toEqual({ looked: 1, marked: 1 });
    const after = await repo.getDraftById(draft.id);
    expect(after?.sent_channel).toBe("gmail_sent_folder");
    expect(new Date(after!.sent_at!).toISOString()).toBe(sentWhen.toISOString());
  });

  it("ignores an older mail to the same person and drafts without a recipient", async () => {
    const repo = new InMemoryJobsRepository();
    const draft = await seed(repo, "old@acme.com", 2);
    await seed(repo, null, 3);
    const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const r = await syncSentFromGmail({
      repo,
      user: "me@gmail.com",
      password: "x",
      clientFactory: () => fakeClient({ "old@acme.com": [older] }) as never,
    });
    expect(r.marked).toBe(0);
    expect(r.looked).toBe(1);
    expect((await repo.getDraftById(draft.id))?.sent_at).toBeNull();
  });

  it("does not touch drafts that are already sent", async () => {
    const repo = new InMemoryJobsRepository();
    const draft = await seed(repo, "done@acme.com", 4);
    await repo.markDraftSent(draft.id, "email");
    const r = await syncSentFromGmail({ repo, user: "me@gmail.com", password: "x", clientFactory: () => fakeClient({}) as never });
    expect(r.looked).toBe(0);
  });
});
