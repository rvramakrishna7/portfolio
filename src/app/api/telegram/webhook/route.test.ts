import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("../../../../lib/jobs/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/jobs/repository")>();
  const testRepo = new actual.InMemoryJobsRepository();
  return {
    ...actual,
    getJobsRepository: () => testRepo,
  };
});

describe("POST /api/telegram/webhook", () => {
  const originalEnv = process.env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct_secret_xyz";
    process.env.TELEGRAM_BOT_TOKEN = "bot_token_123";
    process.env.TELEGRAM_CHAT_ID = "99887766";

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when secret header is missing or incorrect", async () => {
    const req1 = makeRequest({ message: { text: "hello" } });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);
    expect(res1.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const req2 = makeRequest(
      { message: { text: "hello" } },
      { "x-telegram-bot-api-secret-token": "wrong_secret" }
    );
    const res2 = await POST(req2);
    expect(res2.status).toBe(401);
  });

  it("responds to /whoami with the sender's chat ID", async () => {
    const req = makeRequest(
      {
        message: {
          chat: { id: 55443322 },
          text: "/whoami",
        },
      },
      { "x-telegram-bot-api-secret-token": "correct_secret_xyz" }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.handled).toBe("whoami");
    expect(data.chatId).toBe("55443322");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.chat_id).toBe("55443322");
    expect(payload.text).toContain("55443322");
  });

  it("ignores messages from unauthorized chat IDs silently (200 OK)", async () => {
    const req = makeRequest(
      {
        message: {
          chat: { id: 11111111 }, // Not matching TELEGRAM_CHAT_ID (99887766)
          text: "Hiring: React Dev at Acme https://acme.com/jobs/1",
        },
      },
      { "x-telegram-bot-api-secret-token": "correct_secret_xyz" }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ignored).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses job forwarded by owner, saves to repo, and sends confirmation reply", async () => {
    const req = makeRequest(
      {
        message: {
          chat: { id: 99887766 },
          text: "Role: Junior Frontend Developer\nCompany: Stripe\nLocation: Remote (India)\nhttps://stripe.com/jobs/frontend-jr\nSkills: React, TypeScript, 0-1 years exp.",
        },
      },
      { "x-telegram-bot-api-secret-token": "correct_secret_xyz" }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.added).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const replyBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(replyBody.chat_id).toBe("99887766");
    expect(replyBody.text).toContain("Added: Junior Frontend Developer at Stripe");
  });

  it("replies with duplicate notice when job already exists", async () => {
    // Send same job twice
    const msg = {
      message: {
        chat: { id: 99887766 },
        text: "Role: Junior Frontend Developer\nCompany: Stripe\nLocation: Remote (India)\nhttps://stripe.com/jobs/frontend-jr\nReact engineer",
      },
    };
    const headers = { "x-telegram-bot-api-secret-token": "correct_secret_xyz" };

    const res1 = await POST(makeRequest(msg, headers));
    expect(res1.status).toBe(200);

    fetchMock.mockClear();

    const res2 = await POST(makeRequest(msg, headers));
    expect(res2.status).toBe(200);
    const data = await res2.json();
    expect(data.duplicates).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const replyBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(replyBody.text).toContain("Duplicate: already stored");
  });

  it("replies 'No job found in message' for non-job chats from owner", async () => {
    const req = makeRequest(
      {
        message: {
          chat: { id: 99887766 },
          text: "What time are we meeting today?",
        },
      },
      { "x-telegram-bot-api-secret-token": "correct_secret_xyz" }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidates).toBe(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const replyBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(replyBody.text).toContain("No job found in message");
  });
});
