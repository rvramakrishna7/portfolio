import { describe, expect, it } from "vitest";
import { joinBrokenLines, readableDescription, shortLinkLabel } from "./description-text";

describe("description text", () => {
  it("joins a sentence that a scraper split at bold text", () => {
    const raw = "About The Team\nThe\nManaged Postgres\nteam is building a service.\nAbout The Role\nWe're looking for a\nFull Stack\nSoftware Engineer\nto help build interfaces.";
    const out = joinBrokenLines(raw);
    expect(out).toContain("The Managed Postgres team is building a service.");
    expect(out).toContain("We're looking for a Full Stack Software Engineer to help build interfaces.");
    expect(out).toContain("About The Team\nThe Managed");
    expect(out).toContain("\nAbout The Role\n");
  });

  it("keeps bullet lines that end with a period apart", () => {
    const out = joinBrokenLines("Build features end-to-end.\nBuild data-rich UIs.");
    expect(out.split("\n")).toHaveLength(2);
  });

  it("strips email HTML and css leftovers", () => {
    const raw =
      '<td style="padding: 0;"><a href="https://x.com/a">MERN Stack Developer Intern | Remote</a></td>\n    padding: 0;\n    width: 100%;\n';
    const out = readableDescription(raw);
    expect(out).toBe("MERN Stack Developer Intern | Remote");
  });

  it("shortens a long tracking link", () => {
    expect(shortLinkLabel("https://www.foundit.in/rio/autoLogin/seeker/N3VMNFZzS0Q2UVlidytDbnl1NFVMenl5cWNYOTNZRTVHbGtBVzA4bVNJWVR0bk42S05F?x=1")).toMatch(/^www\.foundit\.in\/rio\/autoLogin\/seeker\/N3VM.*\.\.\.$/);
  });
});
