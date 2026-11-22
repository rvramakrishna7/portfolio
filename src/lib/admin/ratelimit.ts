import { createHmac } from "node:crypto";
import { getSql, hasDatabaseUrl } from "../db";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

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

export async function isLoginRateLimited(
  ipHash: string,
  now: number = Date.now()
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(now - WINDOW_MS);

  if (hasDatabaseUrl()) {
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT at FROM login_attempts 
        WHERE ip_hash = ${ipHash} AND ok = false AND at >= ${windowStart.toISOString()} 
        ORDER BY at DESC
      `) as Array<{ at: string }>;

      if (rows.length >= MAX_FAILED_ATTEMPTS) {
        const latestTime = new Date(rows[0].at).getTime();
        const unlockTime = latestTime + WINDOW_MS;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((unlockTime - now) / 1000)
        );
        return { locked: true, retryAfterSeconds };
      }
      return { locked: false, retryAfterSeconds: 0 };
    } catch {
      // Fallback to in-memory if DB fails
    }
  }

  // In-memory fallback
  const attempts = inMemoryAttempts.get(ipHash) || [];
  const recentFailed = attempts.filter(
    (a) => !a.ok && a.timestamp >= now - WINDOW_MS
  );

  if (recentFailed.length >= MAX_FAILED_ATTEMPTS) {
    const latestTime = Math.max(...recentFailed.map((a) => a.timestamp));
    const unlockTime = latestTime + WINDOW_MS;
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
      // Fallback to in-memory if DB fails
    }
  }

  // In-memory fallback
  const attempts = inMemoryAttempts.get(ipHash) || [];
  // Prune attempts older than WINDOW_MS
  const valid = attempts.filter((a) => a.timestamp >= now - WINDOW_MS);
  valid.push({ timestamp: now, ok });
  inMemoryAttempts.set(ipHash, valid);
}
