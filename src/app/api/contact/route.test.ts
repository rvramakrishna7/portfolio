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
      WEB3FORMS_ACCESS_KEY: "test-fake-key-for-unit-test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("valid request forwards once with the right body and returns success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
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
    expect(targetUrl).toBe("https://api.web3forms.com/submit");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      access_key: "test-fake-key-for-unit-test",
      name: "Alice Tester",
      email: "alice@example.com",
      message: "Hello Ramakrishna, interested in your work!",
      subject: "Portfolio message from Alice Tester",
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

  it("Web3Forms failure gives 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limited" }), {
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

  it("Web3Forms timeout gives 502", async () => {
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

  it("missing key gives 500 and the key value never appears in any response", async () => {
    delete process.env.WEB3FORMS_ACCESS_KEY;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

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
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe("Server configuration error");
    expect(JSON.stringify(data)).not.toContain("WEB3FORMS_ACCESS_KEY");
    expect(consoleError).toHaveBeenCalledWith(
      "WEB3FORMS_ACCESS_KEY is not configured"
    );

    consoleError.mockRestore();
  });

  it("Web3Forms answering HTTP 200 with success: false gives 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: "Invalid key" }), {
        status: 200,
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
