import { describe, it, expect } from "vitest";
import { safeCompare } from "./safe-compare";

describe("safeCompare", () => {
  it("returns true for identical secret strings", () => {
    expect(safeCompare("secret_token_123", "secret_token_123")).toBe(true);
  });

  it("returns false for different secret strings of the same length", () => {
    expect(safeCompare("secret_token_123", "secret_token_456")).toBe(false);
  });

  it("returns false for strings of different lengths without throwing", () => {
    expect(safeCompare("short", "much_longer_secret_string")).toBe(false);
  });

  it("returns false when either argument is null, undefined, or empty", () => {
    expect(safeCompare(null, "secret")).toBe(false);
    expect(safeCompare("secret", null)).toBe(false);
    expect(safeCompare(undefined, "secret")).toBe(false);
    expect(safeCompare("secret", undefined)).toBe(false);
    expect(safeCompare("", "secret")).toBe(false);
    expect(safeCompare("secret", "")).toBe(false);
    expect(safeCompare("", "")).toBe(false);
  });
});
