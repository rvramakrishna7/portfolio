import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _getRateLimitMapSizeForTesting,
  _resetRateLimitsForTesting,
  _setRateLimitEntryForTesting,
  GET,
  MAX_RATE_LIMIT_ENTRIES,
  POST,
  pruneRateLimitMap,
} from "./route";

describe("Contact API route (/api/contact)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    _resetRateLimitsForTesting();
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_test_fake_key_for_unit_test",
      CONTACT_TO_EMAIL: "owner@example.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("valid request forwards once with the right body and returns success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-msg-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Alice Tester",
        email: "alice@example.com",
        message: "Hello Ramakrishna, interested in your work!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe(
      "Thanks. Your message is on its way, and I'll reply soon."
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [targetUrl, options] = fetchMock.mock.calls[0];
    expect(targetUrl).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer re_test_fake_key_for_unit_test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(options.body)).toEqual({
      from: "Portfolio <onboarding@resend.dev>",
      to: ["owner@example.com"],
      reply_to: "alice@example.com",
      subject: "Portfolio message from Alice Tester",
      text: "Name: Alice Tester\nEmail: alice@example.com\n\nMessage:\nHello Ramakrishna, interested in your work!",
    });
  });

  it("invalid name, email, and message give 400 with field errors", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        email: "not-an-email",
        message: "short",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe("Validation failed");
    expect(data.errors).toBeDefined();
    expect(data.errors.name).toBeDefined();
    expect(data.errors.email).toBeDefined();
    expect(data.errors.message).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filled honeypot returns success and does NOT call fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Spam Bot",
        email: "bot@example.com",
        message: "Buy our random service right now please",
        website: "https://spam.example.com",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("oversized body gives 413", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const bigString = "a".repeat(11 * 1024);
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bigString.length),
      },
      body: bigString,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wrong content type gives 415 or 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "plain text body",
    });

    const res = await POST(req);
    expect([400, 415]).toContain(res.status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wrong Origin gives 403", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://malicious-site.example.com",
      },
      body: JSON.stringify({
        name: "Test",
        email: "test@example.com",
        message: "Valid message content here",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sixth request in the window gives 429", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const clientIp = "192.0.2.1";

    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost:3000/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": clientIp,
        },
        body: JSON.stringify({
          name: "Person",
          email: "person@example.com",
          message: "A good valid message for testing",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // 6th request
    const req6 = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp,
      },
      body: JSON.stringify({
        name: "Person",
        email: "person@example.com",
        message: "A good valid message for testing",
      }),
    });

    const res6 = await POST(req6);
    expect(res6.status).toBe(429);
    expect(res6.headers.get("Retry-After")).toBe("600");
  });

  it("Resend non-2xx failure gives 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@example.com",
        message: "Hello Ramakrishna, interested in your work!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBe(
      "That did not send. Please try again, or message me on LinkedIn."
    );
  });

  it("Resend timeout gives 502", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("The operation was aborted"));
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@example.com",
        message: "Hello Ramakrishna, interested in your work!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBe(
      "That did not send. Please try again, or message me on LinkedIn."
    );
  });

  it("missing env var gives 502 with content.md error text and never leaks key or message", async () => {
    delete process.env.RESEND_API_KEY;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@example.com",
        message: "Hello Ramakrishna, interested in your work!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBe(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    expect(JSON.stringify(data)).not.toContain("RESEND_API_KEY");
    expect(JSON.stringify(data)).not.toContain("Alice");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("missing CONTACT_TO_EMAIL gives 502", async () => {
    delete process.env.CONTACT_TO_EMAIL;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@example.com",
        message: "Hello Ramakrishna, interested in your work!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBe(
      "That did not send. Please try again, or message me on LinkedIn."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips CR and LF from name in email subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-msg-crlf" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Alice\r\nTester",
        email: "alice@example.com",
        message: "Testing CRLF stripping in subject",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const [, options] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.subject).toBe("Portfolio message from Alice Tester");
    expect(parsedBody.subject).not.toContain("\r");
    expect(parsedBody.subject).not.toContain("\n");
  });

  it("pruneRateLimitMap removes expired timestamps and drops oldest when capping at MAX_RATE_LIMIT_ENTRIES", () => {
    const now = 1000000;
    const windowMs = 10 * 60 * 1000;

    // 1. Expired timestamps entry
    _setRateLimitEntryForTesting("192.168.1.1", [now - windowMs - 1000]);
    // 2. Active timestamps entry
    _setRateLimitEntryForTesting("192.168.1.2", [now - 5000]);

    pruneRateLimitMap(now);

    expect(_getRateLimitMapSizeForTesting()).toBe(1);

    // 3. Test capping when map exceeds MAX_RATE_LIMIT_ENTRIES
    _resetRateLimitsForTesting();
    for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES + 10; i++) {
      _setRateLimitEntryForTesting(`10.0.0.${i}`, [now]);
    }
    expect(_getRateLimitMapSizeForTesting()).toBe(MAX_RATE_LIMIT_ENTRIES + 10);

    pruneRateLimitMap(now);

    expect(_getRateLimitMapSizeForTesting()).toBe(MAX_RATE_LIMIT_ENTRIES);
  });

  it("GET gives 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});
