import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { zipSync, strToU8 } from "fflate";
import {
  POST,
  stripPhoneNumbers,
  parseWhatsAppExport,
} from "./route";
import { createSessionToken } from "../../../../../lib/admin/session";
import { getSessionCookieName } from "../../../../../lib/admin/cookie";

vi.mock("../../../../../lib/jobs/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/jobs/repository")>();
  const testRepo = new actual.InMemoryJobsRepository();
  return {
    ...actual,
    getJobsRepository: () => testRepo,
  };
});

describe("POST /api/admin/inbound/whatsapp", () => {
  const originalEnv = process.env;
  const SECRET = "secret_must_be_at_least_32_characters_long_123456";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function getValidCookie(): string {
    const token = createSessionToken(SECRET);
    return `${getSessionCookieName()}=${token}`;
  }

  describe("Helper: stripPhoneNumbers", () => {
    it("redacts phone numbers while preserving other text", () => {
      const text = "Contact John at +91 98765 43210 or 9876543210 for details.";
      const stripped = stripPhoneNumbers(text);
      expect(stripped).not.toContain("98765");
      expect(stripped).toContain("[REDACTED PHONE]");
    });
  });

  describe("Helper: parseWhatsAppExport", () => {
    it("parses Android format and drops sender name completely", () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = String(now.getFullYear()).slice(-2);

      const raw = `${day}/${month}/${year}, 14:30 - Priya Sharma: Hiring Alert: Junior Backend Engineer at Razorpay
Location: Remote (India)
Tech: Python, FastAPI
Link: https://jobs.lever.co/razorpay/101
Call +91 98765 12345`;

      const { totalMessages, recentMessages } = parseWhatsAppExport(raw, 10);
      expect(totalMessages).toBe(1);
      expect(recentMessages).toHaveLength(1);
      expect(recentMessages[0].text).not.toContain("Priya Sharma");
      expect(recentMessages[0].text).not.toContain("98765 12345");
      expect(recentMessages[0].text).toContain("Junior Backend Engineer");
      expect(recentMessages[0].text).toContain("[REDACTED PHONE]");
    });

    it("parses iOS format and filters messages older than 10 days", () => {
      const today = new Date();
      const dayToday = String(today.getDate()).padStart(2, "0");
      const monthToday = String(today.getMonth() + 1).padStart(2, "0");
      const yearToday = String(today.getFullYear()).slice(-2);

      const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
      const dayOld = String(oldDate.getDate()).padStart(2, "0");
      const monthOld = String(oldDate.getMonth() + 1).padStart(2, "0");
      const yearOld = String(oldDate.getFullYear()).slice(-2);

      const raw = `[${dayOld}/${monthOld}/${yearOld}, 10:00:00] Alice: Old role: Senior Engineer at Google https://google.com/jobs/old
[${dayToday}/${monthToday}/${yearToday}, 11:00:00] Bob: Fresh role: Frontend Developer at Acme https://acme.com/jobs/fresh`;

      const { totalMessages, recentMessages } = parseWhatsAppExport(raw, 10);
      expect(totalMessages).toBe(2);
      expect(recentMessages).toHaveLength(1); // Only today's message
      expect(recentMessages[0].text).toContain("Frontend Developer at Acme");
      expect(recentMessages[0].text).not.toContain("Bob");
    });
  });

  describe("API Route Handler", () => {
    it("returns 401 when unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/inbound/whatsapp", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
        },
        body: "some text",
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("returns 403 when origin header is invalid", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/inbound/whatsapp", {
        method: "POST",
        headers: {
          Cookie: getValidCookie(),
          Origin: "https://malicious.com",
        },
        body: "some text",
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("ingests WhatsApp text upload directly", async () => {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = String(today.getFullYear()).slice(-2);

      const rawChat = `${day}/${month}/${year}, 14:00 - HR Lead: Role: Full Stack Developer
Company: Swiggy
Location: Bengaluru / Remote
Apply: https://swiggy.com/jobs/fullstack-jr
Skills: React, Node.js, TypeScript`;

      const req = new NextRequest("http://localhost:3000/api/admin/inbound/whatsapp", {
        method: "POST",
        headers: {
          Cookie: getValidCookie(),
          Origin: "http://localhost:3000",
          "Content-Type": "text/plain",
        },
        body: rawChat,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalMessages).toBe(1);
      expect(data.parsedJobs).toBe(1);
      expect(data.added).toBe(1);
    });

    it("unzips .zip archive using fflate and ingests messages", async () => {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = String(today.getFullYear()).slice(-2);

      const chatText = `${day}/${month}/${year}, 15:30 - Recruiter: Junior Python Developer at Zepto
Location: Remote
Link: https://zepto.com/jobs/py-dev-1
Python and Django experience`;

      const zipped = zipSync({
        "_chat.txt": strToU8(chatText),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/inbound/whatsapp", {
        method: "POST",
        headers: {
          Cookie: getValidCookie(),
          Origin: "http://localhost:3000",
          "Content-Type": "application/zip",
        },
        body: zipped,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalMessages).toBe(1);
      expect(data.parsedJobs).toBe(1);
      expect(data.added).toBe(1);
    });
  });
});
