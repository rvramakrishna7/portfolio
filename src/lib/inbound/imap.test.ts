import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { simpleParser } from "mailparser";
import { ImapFlow } from "imapflow";
import { ingestGmailAlerts, parseEmailContent } from "./imap";
import { InMemoryJobsRepository } from "../jobs/repository";
import { isKnownAlertSender } from "../../config/alert-senders";

describe("IMAP Alert Ingestion (src/lib/inbound/imap.ts)", () => {
  const originalEnv = process.env;
  let repo: InMemoryJobsRepository;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GMAIL_IMAP_USER;
    delete process.env.GMAIL_IMAP_APP_PASSWORD;
    repo = new InMemoryJobsRepository();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails open when IMAP credentials are not configured", async () => {
    const res = await ingestGmailAlerts({ repo });
    expect(res.fetched).toBe(0);
    expect(res.added).toBe(0);
    expect(res.error).toBe("imap not configured");
  });

  it("identifies known alert senders from config/alert-senders.ts", () => {
    expect(isKnownAlertSender("jobalerts-noreply@linkedin.com", "Software Engineer Jobs")).toBe(true);
    expect(isKnownAlertSender("alert@indeed.com", "New Python Jobs")).toBe(true);
    expect(isKnownAlertSender("spam@randomsite.com", "Hello friend")).toBe(false);
  });

  it("parses LinkedIn alert email fixture and ingests job candidate", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/linkedin-alert.eml");
    const rawContent = readFileSync(fixturePath, "utf-8");
    const parsed = await simpleParser(rawContent);

    const res = await parseEmailContent(parsed, repo);
    expect(res.added).toBe(1);
    expect(res.duplicates).toBe(0);

    const view = await repo.getViewCounts();
    expect(view.all).toBe(1);
  });

  it("parses Indeed alert text email fixture and ingests job candidate", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/indeed-alert.eml");
    const rawContent = readFileSync(fixturePath, "utf-8");
    const parsed = await simpleParser(rawContent);

    const res = await parseEmailContent(parsed, repo);
    expect(res.added).toBe(1);

    const view = await repo.getViewCounts();
    expect(view.all).toBe(1);
  });

  it("returns 0 added for non-job marketing email fixture", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/non-job.eml");
    const rawContent = readFileSync(fixturePath, "utf-8");
    const parsed = await simpleParser(rawContent);

    const res = await parseEmailContent(parsed, repo);
    expect(res.added).toBe(0);
    expect(res.duplicates).toBe(0);

    const view = await repo.getViewCounts();
    expect(view.all).toBe(0);
  });

  it("connects read-only, searches last 3 days, ingests messages, and logs out cleanly", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/indeed-alert.eml");
    const emlContent = readFileSync(fixturePath);

    const mockLockRelease = vi.fn();
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const mockGetMailboxLock = vi.fn().mockResolvedValue({ release: mockLockRelease });
    const mockSearch = vi.fn().mockResolvedValue([101, 102]);
    const mockDownload = vi.fn().mockResolvedValue({ content: emlContent });

    const mockClient = {
      connect: mockConnect,
      logout: mockLogout,
      getMailboxLock: mockGetMailboxLock,
      search: mockSearch,
      download: mockDownload,
    };

    const res = await ingestGmailAlerts({
      user: "ramakrishna@example.com",
      password: "app_password_123",
      repo,
      clientFactory: () => mockClient as unknown as ImapFlow,
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockGetMailboxLock).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(mockLockRelease).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);

    expect(res.fetched).toBe(2);
    expect(res.added).toBe(1); // 1 added, 1 duplicate because same fixture was downloaded twice
    expect(res.duplicates).toBe(1);
  });
});
