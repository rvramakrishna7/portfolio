import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { simpleParser } from "mailparser";
import { ImapFlow } from "imapflow";
import { ingestGmailAlerts, parseEmailContent, formatImapError } from "./imap";
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
    expect(isKnownAlertSender("jobs-listings@sub.linkedin.com", "New roles matching your alert")).toBe(true);
    expect(isKnownAlertSender("recommendations@naukrimail.com", "Handpicked New Jobs for you")).toBe(true);
    expect(isKnownAlertSender("alerts@naukri.com", "Job recommendations")).toBe(true);
    expect(isKnownAlertSender("talent@wellfound.com", "Matches for Junior Developer")).toBe(true);
    expect(isKnownAlertSender("matches@sub.angel.co", "Startup Jobs")).toBe(true);
    expect(isKnownAlertSender("alert@indeed.com", "New Python Jobs")).toBe(true);
    expect(isKnownAlertSender("spam@randomsite.com", "Hello friend")).toBe(false);
  });

  it("parses Naukri newsletter fixture, extracts multiple jobs, and resolves tracking redirects without network calls", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/naukri-newsletter.eml");
    const rawContent = readFileSync(fixturePath, "utf-8");
    const parsed = await simpleParser(rawContent);

    const res = await parseEmailContent(parsed, repo);
    expect(res.added).toBe(2);

    const jobs = await repo.getJobs({ view: "all" });
    expect(jobs.jobs).toHaveLength(2);

    // Verify tracking redirect was resolved by reading href only (no tracking params or mailclick host)
    const job1 = jobs.jobs.find((j) => j.title === "Software Engineer Intern");
    expect(job1).toBeDefined();
    expect(job1?.company).toBe("Tata Consultancy Services");
    expect(job1?.url).toBe("https://www.naukri.com/job-listings-software-engineer-intern-1001");

    const job2 = jobs.jobs.find((j) => j.title === "Junior Backend Developer");
    expect(job2).toBeDefined();
    expect(job2?.company).toBe("Infosys");
    expect(job2?.url).toBe("https://www.naukri.com/job-listings-junior-backend-developer-1002");
  });

  it("parses Wellfound digest fixture and extracts startup jobs", async () => {
    const fixturePath = join(process.cwd(), "test/fixtures/emails/wellfound-digest.eml");
    const rawContent = readFileSync(fixturePath, "utf-8");
    const parsed = await simpleParser(rawContent);

    const res = await parseEmailContent(parsed, repo);
    expect(res.added).toBe(2);

    const jobs = await repo.getJobs({ view: "all" });
    const wfJob = jobs.jobs.find((j) => j.title === "Junior Full Stack Engineer");
    expect(wfJob).toBeDefined();
    expect(wfJob?.company).toBe("SuperSeed AI");
    expect(wfJob?.url).toBe("https://wellfound.com/jobs/888777-junior-full-stack-engineer");
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
    expect(res.seen).toBe(2);
    expect(res.fromKnownSender).toBe(2);
    expect(res.fromFallbackSubject).toBe(0);
    expect(res.parsedJobs).toBe(2);
    expect(res.added).toBe(1); // 1 added, 1 duplicate because same fixture was downloaded twice
    expect(res.duplicates).toBe(1);
  });

  describe("IMAP error formatting and sanitization", () => {
    it("handles authenticationFailed errors and surfaces clean guidance", async () => {
      // With responseText code
      const authErrWithTag = Object.assign(new Error("Authentication failed"), {
        authenticationFailed: true,
        responseText: "[AUTHENTICATIONFAILED] Invalid credentials (Failure)",
        responseStatus: "NO",
      });
      const formattedWithTag = formatImapError(authErrWithTag);
      expect(formattedWithTag).toBe("imap error: login rejected by Gmail (AUTHENTICATIONFAILED)");

      // Without responseText (pure boolean flag)
      const authErrSimple = Object.assign(new Error("Auth failed"), {
        authenticationFailed: true,
      });
      const formattedSimple = formatImapError(authErrSimple);
      expect(formattedSimple).toBe("imap error: login rejected by Gmail (check app password / security alert)");

      // In ingestGmailAlerts
      const mockClient = {
        connect: vi.fn().mockRejectedValue(authErrWithTag),
        logout: vi.fn().mockResolvedValue(undefined),
      };
      const res = await ingestGmailAlerts({
        user: "testuser@gmail.com",
        password: "secret_app_password",
        repo,
        clientFactory: () => mockClient as unknown as ImapFlow,
      });
      expect(res.error).toBe("imap error: login rejected by Gmail (AUTHENTICATIONFAILED)");
    });

    it("handles ETIMEDOUT connection errors with timeout message", async () => {
      const timeoutErr = Object.assign(new Error("connect ETIMEDOUT 142.250.185.109:993"), {
        code: "ETIMEDOUT",
      });
      const formatted = formatImapError(timeoutErr);
      expect(formatted).toBe("imap error: timeout");

      // In ingestGmailAlerts
      const mockClient = {
        connect: vi.fn().mockRejectedValue(timeoutErr),
        logout: vi.fn().mockResolvedValue(undefined),
      };
      const res = await ingestGmailAlerts({
        user: "testuser@gmail.com",
        password: "secret_app_password",
        repo,
        clientFactory: () => mockClient as unknown as ImapFlow,
      });
      expect(res.error).toBe("imap error: timeout");
    });

    it("handles generic Command failed with responseText and status", async () => {
      const cmdErr = Object.assign(new Error("Command failed"), {
        responseStatus: "NO",
        responseText: "Mailbox does not exist",
      });
      const formatted = formatImapError(cmdErr);
      expect(formatted).toBe("imap error: Command failed: Mailbox does not exist (NO)");

      // In ingestGmailAlerts
      const mockClient = {
        connect: vi.fn().mockRejectedValue(cmdErr),
        logout: vi.fn().mockResolvedValue(undefined),
      };
      const res = await ingestGmailAlerts({
        user: "testuser@gmail.com",
        password: "secret_app_password",
        repo,
        clientFactory: () => mockClient as unknown as ImapFlow,
      });
      expect(res.error).toBe("imap error: Command failed: Mailbox does not exist (NO)");
    });

    it("strictly sanitizes user email, password, and URLs with credentials", () => {
      const leakErr = new Error("Failed connecting to https://user:super_secret@imap.gmail.com?token=xyz123 for ramakrishna@example.com (cc alerts@othercompany.com) with password my_secret_pass");
      const formatted = formatImapError(leakErr, ["ramakrishna@example.com", "my_secret_pass"]);
      expect(formatted).not.toContain("ramakrishna@example.com");
      expect(formatted).not.toContain("my_secret_pass");
      expect(formatted).not.toContain("super_secret");
      expect(formatted).not.toContain("token=xyz123");
      expect(formatted).not.toContain("alerts@othercompany.com");
      expect(formatted).toContain("[email]");
      expect(formatted).toContain("[MASKED]");
    });
  });

  describe("Additional job alert senders (strict domain matching and look-alike rejection)", () => {
    it("matches unstop (emails.unstop.com, unstop.com) and rejects look-alikes", () => {
      expect(isKnownAlertSender("noreply@emails.unstop.com", "New SDE Challenge")).toBe(true);
      expect(isKnownAlertSender("alerts@unstop.com", "Hiring Now")).toBe(true);
      expect(isKnownAlertSender("noreply@unstop.com.evil.io", "Hiring Now")).toBe(false);
      expect(isKnownAlertSender("noreply@fakeunstop.com", "Hiring Now")).toBe(false);
    });

    it("matches flexjobs (mg.flexjobs.com, flexjobs.com) and rejects look-alikes", () => {
      expect(isKnownAlertSender("alerts@mg.flexjobs.com", "New Remote Jobs")).toBe(true);
      expect(isKnownAlertSender("newsletter@flexjobs.com", "Weekly Digest")).toBe(true);
      expect(isKnownAlertSender("alerts@flexjobs.com.evil.io", "New Remote Jobs")).toBe(false);
      expect(isKnownAlertSender("alerts@myflexjobs.com", "New Remote Jobs")).toBe(false);
    });

    it("matches workindia (workindia.info, workindia.in) and rejects look-alikes", () => {
      expect(isKnownAlertSender("jobs@workindia.info", "Developer Role")).toBe(true);
      expect(isKnownAlertSender("noreply@mail.workindia.in", "New Opening")).toBe(true);
      expect(isKnownAlertSender("jobs@workindia.info.evil.io", "Developer Role")).toBe(false);
      expect(isKnownAlertSender("jobs@workindia.org", "Developer Role")).toBe(false);
    });

    it("matches jobhai (jobhai.com) and rejects look-alikes", () => {
      expect(isKnownAlertSender("alerts@jobhai.com", "Software Engineer")).toBe(true);
      expect(isKnownAlertSender("noreply@mail.jobhai.com", "New Matches")).toBe(true);
      expect(isKnownAlertSender("alerts@jobhai.com.evil.io", "Software Engineer")).toBe(false);
      expect(isKnownAlertSender("alerts@fakejobhai.com", "Software Engineer")).toBe(false);
    });

    it("matches micro1 (micro1.io, micro1.ai) and rejects look-alikes", () => {
      expect(isKnownAlertSender("talent@micro1.io", "AI Engineer Opportunity")).toBe(true);
      expect(isKnownAlertSender("jobs@mail.micro1.ai", "Remote Role")).toBe(true);
      expect(isKnownAlertSender("talent@micro1.io.evil.io", "AI Engineer Opportunity")).toBe(false);
      expect(isKnownAlertSender("talent@micro1.com", "AI Engineer Opportunity")).toBe(false);
    });

    it("matches internshala (internshala.com) and rejects look-alikes", () => {
      expect(isKnownAlertSender("student@internshala.com", "Fresher Jobs")).toBe(true);
      expect(isKnownAlertSender("noreply@mail.internshala.com", "New Internship")).toBe(true);
      expect(isKnownAlertSender("student@internshala.com.evil.io", "Fresher Jobs")).toBe(false);
      expect(isKnownAlertSender("student@fakeinternshala.com", "Fresher Jobs")).toBe(false);
    });

    it("matches shine (shine.com) and rejects look-alikes", () => {
      expect(isKnownAlertSender("jobalerts@shine.com", "Matching Jobs")).toBe(true);
      expect(isKnownAlertSender("noreply@ alerts.shine.com".replace(" ", ""), "New Jobs")).toBe(true);
      expect(isKnownAlertSender("jobalerts@shine.com.evil.io", "Matching Jobs")).toBe(false);
      expect(isKnownAlertSender("jobalerts@myshine.com", "Matching Jobs")).toBe(false);
    });

    it("matches cuvette (cuvette.tech) and rejects look-alikes", () => {
      expect(isKnownAlertSender("team@cuvette.tech", "Full Stack Role")).toBe(true);
      expect(isKnownAlertSender("alerts@mail.cuvette.tech", "New Job Posted")).toBe(true);
      expect(isKnownAlertSender("team@cuvette.tech.evil.io", "Full Stack Role")).toBe(false);
      expect(isKnownAlertSender("team@cuvette.com", "Full Stack Role")).toBe(false);
    });

    it("matches indeed.com subdomains and rejects non-alert services (google.com, adobe, sbi, tradingview, railway, openai, resend.dev, uptimerobot)", () => {
      expect(isKnownAlertSender("alert@indeed.com", "New Software Engineer Jobs")).toBe(true);
      expect(isKnownAlertSender("donotreply@match.indeed.com", "New Job Matches")).toBe(true);
      expect(isKnownAlertSender("alert@indeed.com.evil.io", "New Jobs")).toBe(false);

      // Must NOT match excluded non-alert domains
      expect(isKnownAlertSender("no-reply@accounts.google.com", "Security alert")).toBe(false);
      expect(isKnownAlertSender("mail@adobe.com", "Creative Cloud")).toBe(false);
      expect(isKnownAlertSender("alerts@sbi.co.in", "Account Statement")).toBe(false);
      expect(isKnownAlertSender("noreply@tradingview.com", "Alert Triggered")).toBe(false);
      expect(isKnownAlertSender("notify@railway.app", "Deployment Succeeded")).toBe(false);
      expect(isKnownAlertSender("noreply@openai.com", "API Usage")).toBe(false);
      expect(isKnownAlertSender("onboarding@resend.dev", "Test Email")).toBe(false);
      expect(isKnownAlertSender("alert@uptimerobot.com", "Monitor Down")).toBe(false);
    });

    it("handles unknown email format from a known sender without crashing and records 0 job alerts", async () => {
      const rawEml = [
        'From: "Unstop Alerts" <noreply@emails.unstop.com>',
        "To: <candidate@example.com>",
        "Subject: Weekly digest update",
        "Date: Tue, 24 Nov 2026 10:00:00 +0000",
        "Content-Type: text/html; charset=UTF-8",
        "",
        "<html><body><div>Welcome to your Unstop weekly account summary! You have 3 profile views this week.</div></body></html>",
      ].join("\r\n");

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
        search: vi.fn().mockResolvedValue([201]),
        download: vi.fn().mockResolvedValue({ content: Buffer.from(rawEml, "utf-8") }),
      };

      const res = await ingestGmailAlerts({
        user: "ramakrishna@example.com",
        password: "app_password_123",
        repo,
        clientFactory: () => mockClient as unknown as ImapFlow,
      });

      expect(res.error).toBeUndefined();
      expect(res.seen).toBe(1);
      expect(res.fromKnownSender).toBe(1);
      expect(res.added).toBe(0);
      expect(res.parsedJobs).toBe(0);
    });
  });
});
