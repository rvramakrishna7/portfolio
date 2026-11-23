import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two secret strings using crypto.timingSafeEqual.
 * If either string is null/undefined/empty or lengths differ, returns false
 * without calling timingSafeEqual (which throws if Buffer lengths differ).
 */
export function safeCompare(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
