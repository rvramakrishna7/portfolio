import { describe, it, expect } from "vitest";
import {
  calculateJobAgeDays,
  formatJobAge,
  isJobStale,
} from "./freshness";

describe("Job Freshness Logic", () => {
  const baseNow = new Date("2026-11-22T12:00:00Z");

  it("calculates age correctly for a job posted 2 days ago (kept)", () => {
    const postedAt = new Date("2026-11-20T12:00:00Z").toISOString();
    const age = calculateJobAgeDays(postedAt, null, baseNow);
    expect(age).toBe(2);
    expect(isJobStale(postedAt, null, 7, baseNow)).toBe(false);
    expect(formatJobAge(postedAt, null, baseNow)).toBe("2 days ago");
  });

  it("marks a job posted 12 days ago as stale (hidden)", () => {
    const postedAt = new Date("2026-11-10T12:00:00Z").toISOString();
    const age = calculateJobAgeDays(postedAt, null, baseNow);
    expect(age).toBe(12);
    expect(isJobStale(postedAt, null, 7, baseNow)).toBe(true);
    expect(formatJobAge(postedAt, null, baseNow)).toBe("12 days ago");
  });

  it("uses fetched_at if postedAt is missing", () => {
    const fetchedAt = new Date("2026-11-18T12:00:00Z").toISOString();
    const age = calculateJobAgeDays(null, fetchedAt, baseNow);
    expect(age).toBe(4);
    expect(isJobStale(null, fetchedAt, 7, baseNow)).toBe(false);
    expect(formatJobAge(null, fetchedAt, baseNow)).toBe("4 days ago");
  });

  it("handles exact 7-day boundary correctly (not stale at <= 7)", () => {
    const postedAt = new Date("2026-11-15T12:00:00Z").toISOString();
    const age = calculateJobAgeDays(postedAt, null, baseNow);
    expect(age).toBe(7);
    expect(isJobStale(postedAt, null, 7, baseNow)).toBe(false);
    expect(formatJobAge(postedAt, null, baseNow)).toBe("7 days ago");

    // 8 days ago is stale
    const posted8DaysAgo = new Date("2026-11-14T11:00:00Z").toISOString();
    expect(isJobStale(posted8DaysAgo, null, 7, baseNow)).toBe(true);
  });

  it("formats 0 days as 'today' and 1 day as '1 day ago'", () => {
    const today = new Date("2026-11-22T08:00:00Z").toISOString();
    expect(formatJobAge(today, null, baseNow)).toBe("today");

    const yesterday = new Date("2026-11-21T08:00:00Z").toISOString();
    expect(formatJobAge(yesterday, null, baseNow)).toBe("1 day ago");
  });
});
