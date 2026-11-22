import { describe, it, expect } from "vitest";
import { isSeedRouteAllowed } from "./route";

describe("Seed route security guard", () => {
  it("allows seed route only when E2E_SEED === '1'", () => {
    expect(isSeedRouteAllowed("1")).toBe(true);
    expect(isSeedRouteAllowed(undefined)).toBe(false);
    expect(isSeedRouteAllowed("")).toBe(false);
    expect(isSeedRouteAllowed("0")).toBe(false);
    expect(isSeedRouteAllowed("true")).toBe(false);
  });
});
