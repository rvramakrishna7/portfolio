import { describe, expect, it } from "vitest";
import { bounceCandidates, isBounceMessage } from "./bounce";

describe("bounce detection", () => {
  it("recognises a mail server notice by sender or subject", () => {
    expect(isBounceMessage("mailer-daemon@googlemail.com", "Anything")).toBe(true);
    expect(isBounceMessage("postmaster@corp.com", "x")).toBe(true);
    expect(isBounceMessage("someone@corp.com", "Delivery Status Notification (Failure)")).toBe(true);
    expect(isBounceMessage("hr@corp.com", "Re: Your application")).toBe(false);
  });

  it("lists the addresses in the notice without the daemon", () => {
    const text =
      "Address not found. Your message wasn't delivered to saumya.singh@bristlecone.com because the address couldn't be found. mailer-daemon@googlemail.com";
    expect(bounceCandidates(text)).toEqual(["saumya.singh@bristlecone.com"]);
  });
});
