// Detects a "delivery failed" notice from a mail server and lists the addresses it mentions.

const BOUNCE_SENDER = /^(?:mailer-daemon|postmaster)@/i;
const BOUNCE_SUBJECT =
  /delivery status notification|undeliverable|undelivered mail|returned mail|delivery (?:has )?failed|failure notice|mail delivery (?:failed|subsystem)|address not found/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

export function isBounceMessage(fromAddress: string, subject: string): boolean {
  return BOUNCE_SENDER.test(fromAddress.trim()) || BOUNCE_SUBJECT.test(subject);
}

/** Every address in a bounce notice, lowercased and without duplicates. The caller keeps the ones it sent to. */
export function bounceCandidates(text: string): string[] {
  const found = (text.match(EMAIL) || []).map((e) => e.toLowerCase().replace(/[.,;:>)]+$/, ""));
  return Array.from(new Set(found)).filter((e) => !BOUNCE_SENDER.test(e));
}
