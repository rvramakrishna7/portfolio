import { describe, it, expect } from "vitest";
import { structureEmailBody } from "./email-structure";

const LONG =
  "Hi, I noticed the MERN Stack Developer Intern role at Job Alert focuses on full-stack work with React and Node.js. I recently built Restart Options, an automation tool that cut a manual strike adjustment to 2 to 3 seconds. The system includes 38 REST endpoints and handles real-time updates. This experience shows I can deliver reliable back-end services. Would you be open to a brief chat to see if my work fits your needs? https://rramakrishna.vercel.app/r/wgyqcjnj";

describe("structureEmailBody", () => {
  it("splits one block into greeting, paragraphs, question and link", () => {
    const out = structureEmailBody(LONG);
    const parts = out.split("\n\n");
    expect(parts[0]).toBe("Hi,");
    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(parts[parts.length - 2]).toMatch(/^Would you be open to .*\?$/);
    expect(parts[parts.length - 1]).toBe("https://rramakrishna.vercel.app/r/wgyqcjnj");
  });

  it("keeps every word and the link", () => {
    const out = structureEmailBody(LONG).replace(/\s+/g, " ");
    expect(out).toBe(LONG.replace(/\s+/g, " ").replace("Hi, I noticed", "Hi, I noticed"));
  });

  it("leaves text that already has paragraphs alone", () => {
    const text = "Hi Asha,\n\nI built a thing.\n\nThanks";
    expect(structureEmailBody(text)).toBe(text);
  });

  it("handles short text without a question or link", () => {
    expect(structureEmailBody("Hi Asha, I built a thing.")).toBe("Hi Asha,\n\nI built a thing.");
    expect(structureEmailBody("")).toBe("");
  });
});
