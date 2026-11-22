import { MAX_AGE_DAYS_DEFAULT } from "../../config/job-profile";

/**
 * Calculates the age of a job in whole days.
 * If postedAt is null, undefined, or invalid, falls back to fetchedAt.
 * If both are missing or invalid, falls back to nowDate.
 */
export function calculateJobAgeDays(
  postedAt: string | null | undefined,
  fetchedAt?: string | null,
  nowDate: Date = new Date()
): number {
  let targetDate: Date | null = null;

  if (postedAt) {
    const d = new Date(postedAt);
    if (!isNaN(d.getTime())) {
      targetDate = d;
    }
  }

  if (!targetDate && fetchedAt) {
    const d = new Date(fetchedAt);
    if (!isNaN(d.getTime())) {
      targetDate = d;
    }
  }

  if (!targetDate) {
    targetDate = nowDate;
  }

  const diffMs = nowDate.getTime() - targetDate.getTime();
  // Negative diff (e.g. clock skew / future date) clamped to 0
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns human-readable relative age string (e.g., "today", "1 day ago", "N days ago").
 */
export function formatJobAge(
  postedAt: string | null | undefined,
  fetchedAt?: string | null,
  nowDate: Date = new Date()
): string {
  const days = calculateJobAgeDays(postedAt, fetchedAt, nowDate);
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

/**
 * Returns whether a job is considered stale according to maxAgeDays (default: MAX_AGE_DAYS_DEFAULT).
 */
export function isJobStale(
  postedAt: string | null | undefined,
  fetchedAt?: string | null,
  maxAgeDays: number = MAX_AGE_DAYS_DEFAULT,
  nowDate: Date = new Date()
): boolean {
  const age = calculateJobAgeDays(postedAt, fetchedAt, nowDate);
  return age > maxAgeDays;
}
