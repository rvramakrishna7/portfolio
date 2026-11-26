import { describe, it, expect } from "vitest";
import { buildEmailParts, parseEmailMode, EMAIL_MODES } from "./email-format";

const BODY =
  "Hi Sam, I built a voice agent that books appointments. I would love to share how. Would you be open to a short chat? https://rramakrishna.vercel.app/r/abc23456";

describe("Email modes (src/lib/outreach/email-format.ts)", () => {
  it("falls back to plain for unknown values", () => {
    expect(parseEmailMode(undefined)).toBe("plain");
    expect(parseEmailMode("fancy")).toBe("plain");
    for (const m of EMAIL_MODES) expect(parseEmailMode(m)).toBe(m);
  });

  it("plain mode is text only, with a direct portfolio link and no tracked redirect", () => {
    const parts = buildEmailParts(BODY, "plain", { track: false });
    expect(parts.html).toBeUndefined();
    expect(parts.text).not.toMatch(/\/r\/abc23456/);
    expect(parts.text).toContain("https://rramakrishna.vercel.app");
    expect(parts.text).toContain("AI and Automation Engineer Intern");
    expect(parts.text).toContain("If this is not relevant, just reply and I will not write again.");
    expect(parts.text).not.toContain("Projects:");
  });

  it("light mode adds a signature with icon links but no card sections", () => {
    const parts = buildEmailParts(BODY, "light", { track: false });
    expect(parts.html).toBeDefined();
    expect(parts.html).toContain("LinkedIn");
    expect(parts.html).toContain("GitHub");
    expect(parts.html).not.toContain("<img");
    expect(parts.html).not.toContain("View my portfolio");
    expect(parts.html).not.toContain("Projects");
    expect(parts.html).not.toMatch(/\/r\/abc23456/);
  });

  it("keeps the tracked link in plain and light mode by default so visits can be counted", () => {
    expect(buildEmailParts(BODY, "plain").text).toMatch(/\/r\/abc23456/);
    expect(buildEmailParts(BODY, "light").html).toMatch(/\/r\/abc23456/);
  });

  it("full mode keeps the tracked link, Experience and Projects", () => {
    const parts = buildEmailParts(BODY, "full");
    expect(parts.html).toContain("Projects");
    expect(parts.html).toContain("Experience");
    expect(parts.html).toMatch(/\/r\/abc23456/);
    expect(parts.text).toContain("Projects:");
  });

  it("escapes html in light mode", () => {
    const parts = buildEmailParts("Hi <script>alert(1)</script>", "light");
    expect(parts.html).not.toContain("<script>");
    expect(parts.html).toContain("&lt;script&gt;");
  });
});
