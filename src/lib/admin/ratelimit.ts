import { createHmac } from "node:crypto";
import { getSql, hasDatabaseUrl } from "../db";

export const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const IP_MAX_FAILED_ATTEMPTS = 5;

export const GLOBAL_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
export const GLOBAL_MAX_FAILED_ATTEMPTS = 30;

// In-memory store for dev/testing or when DB is not configured
interface InMemAttempt {
  timestamp: number;
  ok: boolean;
}
const inMemoryAttempts = new Map<string, InMemAttempt[]>();

export function hashIp(ip: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(ip).digest("hex");
}

export function _resetRateLimitsForTesting(): void {
  inMemoryAttempts.clear();
}

function warnDatabaseFallback(): void {
  console.warn("rate limiter: database unavailable, using in-memory fallback");
}

export async function isLoginRateLimited(
  ipHash: string,
  now: number = Date.now()
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const ipWindowStart = new Date(now - IP_WINDOW_MS);
  const globalWindowStart = new Date(now - GLOBAL_WINDOW_MS);

  if (hasDatabaseUrl()) {
    try {
      const sql = getSql();

      // 1. Global limit check (last 60 min, max 30 failed attempts across all IPs)
      const globalRows = (await sql`
        SELECT at FROM login_attempts 
        WHERE ok = false AND at >= ${globalWindowStart.toISOString()} 
        ORDER BY at DESC
      `) as Array<{ at: string }>;

      if (globalRows.length >= GLOBAL_MAX_FAILED_ATTEMPTS) {
        const latestTime = new Date(globalRows[0].at).getTime();
        const unlockTime = latestTime + GLOBAL_WINDOW_MS;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((unlockTime - now) / 1000)
        );
        return { locked: true, retryAfterSeconds };
      }

      // 2. Per-IP limit check (last 15 min, max 5 failed attempts for this IP)
      const ipRows = (await sql`
        SELECT at FROM login_attempts 
        WHERE ip_hash = ${ipHash} AND ok = false AND at >= ${ipWindowStart.toISOString()} 
        ORDER BY at DESC
      `) as Array<{ at: string }>;

      if (ipRows.length >= IP_MAX_FAILED_ATTEMPTS) {
        const latestTime = new Date(ipRows[0].at).getTime();
        const unlockTime = latestTime + IP_WINDOW_MS;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((unlockTime - now) / 1000)
        );
        return { locked: true, retryAfterSeconds };
      }

      return { locked: false, retryAfterSeconds: 0 };
    } catch {
      warnDatabaseFallback();
    }
  }

  // In-memory fallback
  // 1. Global limit check across all IPs
  const allRecentFailed: number[] = [];
  for (const attempts of inMemoryAttempts.values()) {
    for (const a of attempts) {
      if (!a.ok && a.timestamp >= now - GLOBAL_WINDOW_MS) {
        allRecentFailed.push(a.timestamp);
      }
    }
  }

  if (allRecentFailed.length >= GLOBAL_MAX_FAILED_ATTEMPTS) {
    const latestTime = Math.max(...allRecentFailed);
    const unlockTime = latestTime + GLOBAL_WINDOW_MS;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((unlockTime - now) / 1000)
    );
    return { locked: true, retryAfterSeconds };
  }

  // 2. Per-IP limit check
  const ipAttempts = inMemoryAttempts.get(ipHash) || [];
  const recentIpFailed = ipAttempts.filter(
    (a) => !a.ok && a.timestamp >= now - IP_WINDOW_MS
  );

  if (recentIpFailed.length >= IP_MAX_FAILED_ATTEMPTS) {
    const latestTime = Math.max(...recentIpFailed.map((a) => a.timestamp));
    const unlockTime = latestTime + IP_WINDOW_MS;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((unlockTime - now) / 1000)
    );
    return { locked: true, retryAfterSeconds };
  }

  return { locked: false, retryAfterSeconds: 0 };
}

export async function recordLoginAttempt(
  ipHash: string,
  ok: boolean,
  now: number = Date.now()
): Promise<void> {
  if (hasDatabaseUrl()) {
    try {
      const sql = getSql();
      await sql`
        INSERT INTO login_attempts (ip_hash, ok, at) 
        VALUES (${ipHash}, ${ok}, ${new Date(now).toISOString()})
      `;
      return;
    } catch {
      warnDatabaseFallback();
    }
  }

  // In-memory fallback
  const attempts = inMemoryAttempts.get(ipHash) || [];
  // Prune attempts older than GLOBAL_WINDOW_MS
  const valid = attempts.filter((a) => a.timestamp >= now - GLOBAL_WINDOW_MS);
  valid.push({ timestamp: now, ok });
  inMemoryAttempts.set(ipHash, valid);
}
