import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { createSessionToken, verifySessionToken } from "./session";
import { verifyAdminOrigin } from "./origin";
import {
  hashIp,
  isLoginRateLimited,
  recordLoginAttempt,
  _resetRateLimitsForTesting,
} from "./ratelimit";
import { requireAdminApi } from "./require-admin";

const TEST_SECRET = "this-is-a-super-secret-key-that-is-at-least-32-chars-long";

describe("Password verification (scrypt)", () => {
  it("verifies matching password correctly", async () => {
    const plain = "CorrectHorseBatteryStaple!";
    const hash = await hashPassword(plain);
    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);

    const ok = await verifyPassword(plain, hash);
    expect(ok).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("MySecret123");
    const ok = await verifyPassword("WrongSecret123", hash);
    expect(ok).toBe(false);
  });

  it("rejects malformed hashes safely without throwing", async () => {
    expect(await verifyPassword("test", "")).toBe(false);
    expect(await verifyPassword("test", "bcrypt$invalid")).toBe(false);
    expect(await verifyPassword("test", "scrypt$16384$8$1$bad")).toBe(false);
    expect(await verifyPassword("test", "scrypt$abc$8$1$salt$hash")).toBe(false);
    expect(await verifyPassword("test", "scrypt$16384$8$1$$")).toBe(false);
  });
});

describe("Session token HMAC verification", () => {
  it("creates and verifies a valid session token", () => {
    const token = createSessionToken(TEST_SECRET);
    const session = verifySessionToken(token, TEST_SECRET);

    expect(session).not.toBeNull();
    expect(session?.sub).toBe("owner");
    expect(session?.exp).toBeGreaterThan(session?.iat || 0);
  });

  it("rejects tampered payload or signature", () => {
    const token = createSessionToken(TEST_SECRET);
    const [payloadB64, sigB64] = token.split(".");

    // Tampered signature
    const tamperedSig = sigB64.slice(0, -2) + "aa";
    expect(verifySessionToken(`${payloadB64}.${tamperedSig}`, TEST_SECRET)).toBeNull();

    // Tampered payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", iat: 100, exp: 200 })
    ).toString("base64url");
    expect(verifySessionToken(`${tamperedPayload}.${sigB64}`, TEST_SECRET)).toBeNull();
  });

  it("rejects expired token", () => {
    const now = 1000000;
    const token = createSessionToken(TEST_SECRET, now);

    // 12 hours + 1 second later
    const futureTime = now + 12 * 60 * 60 + 1;
    expect(verifySessionToken(token, TEST_SECRET, futureTime)).toBeNull();
  });

  it("throws if ADMIN_SESSION_SECRET is shorter than 32 characters", () => {
    const shortSecret = "too-short";
    expect(() => createSessionToken(shortSecret)).toThrow(
      "ADMIN_SESSION_SECRET must be at least 32 characters long"
    );
    expect(() => verifySessionToken("some.token", shortSecret)).toThrow(
      "ADMIN_SESSION_SECRET must be at least 32 characters long"
    );
  });
});

describe("Origin verification", () => {
  it("allows safe GET/HEAD methods without origin headers", () => {
    const getReq = new Request("http://localhost:3000/api/admin/jobs", {
      method: "GET",
    });
    expect(verifyAdminOrigin(getReq)).toBe(true);
  });

  it("allows matching Origin or Referer on state-changing requests", () => {
    const postReqWithOrigin = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });
    expect(verifyAdminOrigin(postReqWithOrigin)).toBe(true);

    const postReqWithReferer = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        referer: "http://localhost:3000/admin/login",
      },
    });
    expect(verifyAdminOrigin(postReqWithReferer)).toBe(true);
  });

  it("rejects mismatched Origin or missing headers on state-changing requests", () => {
    const crossOriginReq = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://evil-site.com",
      },
    });
    expect(verifyAdminOrigin(crossOriginReq)).toBe(false);

    const noHeaderReq = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
      },
    });
    expect(verifyAdminOrigin(noHeaderReq)).toBe(false);
  });
});

describe("Login rate limiter (in-memory test)", () => {
  const ip = "192.168.1.100";
  const ipHash = hashIp(ip, TEST_SECRET);

  beforeEach(() => {
    _resetRateLimitsForTesting();
  });

  it("locks after 5 failed attempts within 15 minutes, then unlocks after window", async () => {
    const baseTime = 1000000000;

    // 4 failed attempts: not locked
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt(ipHash, false, baseTime + i * 1000);
      const status = await isLoginRateLimited(ipHash, baseTime + (i + 1) * 1000);
      expect(status.locked).toBe(false);
    }

    // 5th failed attempt: locked!
    await recordLoginAttempt(ipHash, false, baseTime + 4000);
    const lockedStatus = await isLoginRateLimited(ipHash, baseTime + 5000);
    expect(lockedStatus.locked).toBe(true);
    expect(lockedStatus.retryAfterSeconds).toBeGreaterThan(0);

    // 15 minutes later: unlocked
    const futureTime = baseTime + 4000 + 15 * 60 * 1000 + 1000;
    const unlockedStatus = await isLoginRateLimited(ipHash, futureTime);
    expect(unlockedStatus.locked).toBe(false);
  });

  it("successful attempts do not increment failed count", async () => {
    const baseTime = 1000000000;
    for (let i = 0; i < 10; i++) {
      await recordLoginAttempt(ipHash, true, baseTime + i * 1000);
    }
    const status = await isLoginRateLimited(ipHash, baseTime + 11000);
    expect(status.locked).toBe(false);
  });

  it("global rate limiter locks after 30 failed attempts across different IPs in 60 min", async () => {
    const baseTime = 1000000000;

    // 29 failed attempts from distinct IPs: not locked
    for (let i = 0; i < 29; i++) {
      const distinctIpHash = hashIp(`10.0.0.${i}`, TEST_SECRET);
      await recordLoginAttempt(distinctIpHash, false, baseTime + i * 1000);
    }
    const freshIpHash = hashIp("10.0.0.254", TEST_SECRET);
    expect((await isLoginRateLimited(freshIpHash, baseTime + 30000)).locked).toBe(false);

    // 30th failed attempt from distinct IP: global lock triggers
    const ip30Hash = hashIp("10.0.0.30", TEST_SECRET);
    await recordLoginAttempt(ip30Hash, false, baseTime + 31000);

    const lockedStatus = await isLoginRateLimited(freshIpHash, baseTime + 32000);
    expect(lockedStatus.locked).toBe(true);
    expect(lockedStatus.retryAfterSeconds).toBeGreaterThan(0);

    // After 60 minutes + 1 second: global lock expires
    const futureTime = baseTime + 31000 + 60 * 60 * 1000 + 1000;
    const expiredStatus = await isLoginRateLimited(freshIpHash, futureTime);
    expect(expiredStatus.locked).toBe(false);
  });

  it("warns and falls back to in-memory rate limiting when database fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.DATABASE_URL = "postgres://invalid-host:5432/bad_db";

    try {
      await recordLoginAttempt("fallback-test-ip", false);
      expect(warnSpy).toHaveBeenCalledWith(
        "rate limiter: database unavailable, using in-memory fallback"
      );
    } finally {
      delete process.env.DATABASE_URL;
      warnSpy.mockRestore();
    }
  });
});

describe("requireAdminApi helper", () => {
  it("returns 401 when session cookie is missing or invalid", () => {
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;

    const reqWithoutCookie = new Request("http://localhost:3000/api/admin/jobs");
    const res1 = requireAdminApi(reqWithoutCookie);
    expect(res1.session).toBeNull();
    expect(res1.errorResponse?.status).toBe(401);
    expect(res1.errorResponse?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    const reqWithBadCookie = new Request("http://localhost:3000/api/admin/jobs", {
      headers: {
        cookie: "admin=invalid.token",
      },
    });
    const res2 = requireAdminApi(reqWithBadCookie);
    expect(res2.session).toBeNull();
    expect(res2.errorResponse?.status).toBe(401);
  });

  it("returns session when valid cookie is provided", () => {
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;
    const token = createSessionToken(TEST_SECRET);

    const req = new Request("http://localhost:3000/api/admin/jobs", {
      headers: {
        cookie: `admin=${token}`,
      },
    });
    const res = requireAdminApi(req);
    expect(res.session?.sub).toBe("owner");
    expect(res.errorResponse).toBeNull();
  });

  it("returns 401 when cookie contains malformed URI encoding, never throws 500", () => {
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;
    const reqWithMalformedCookie = new Request("http://localhost:3000/api/admin/jobs", {
      headers: {
        cookie: "admin=%E0%A4%A",
      },
    });
    const res = requireAdminApi(reqWithMalformedCookie);
    expect(res.session).toBeNull();
    expect(res.errorResponse?.status).toBe(401);
    expect(res.errorResponse?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
