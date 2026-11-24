#!/usr/bin/env node
import { ImapFlow } from "imapflow";

/**
 * Diagnostic helper: scans INBOX for the last 14 days and lists the top 20 sender DOMAINS.
 * Endpoint-free, strictly read-only.
 * Outputs only domain names and message counts (no email addresses, no subjects, no bodies).
 */
async function main() {
  const user = process.env.GMAIL_IMAP_USER;
  const password = process.env.GMAIL_IMAP_APP_PASSWORD;
  const host = process.env.GMAIL_IMAP_HOST || "imap.gmail.com";
  const port = parseInt(process.env.GMAIL_IMAP_PORT || "993", 10);

  if (!user || !password) {
    console.error("GMAIL_IMAP_USER or GMAIL_IMAP_APP_PASSWORD not configured.");
    process.exit(1);
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });

    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const messages = await client.search({ since: fourteenDaysAgo }, { uid: true });

      if (!messages || messages.length === 0) {
        console.log("No messages found in INBOX for the last 14 days.");
        return;
      }

      console.log(`Scanning sender domains for ${messages.length} messages (last 14 days)...`);

      const domainCounts = new Map();

      // Fetch envelope only for efficiency and privacy
      for await (const msg of client.fetch(messages, { envelope: true })) {
        const from = msg.envelope?.from?.[0]?.address || "";
        const atIdx = from.indexOf("@");
        if (atIdx !== -1) {
          const domain = from.slice(atIdx + 1).toLowerCase().trim();
          if (domain) {
            domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          }
        }
      }

      const sorted = Array.from(domainCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      console.log("\nTop 20 Sender Domains (last 14 days):");
      sorted.forEach(([domain, count], idx) => {
        console.log(`${idx + 1}. ${domain}: ${count}`);
      });
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("IMAP error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    try {
      await client.logout();
    } catch {
      // Disconnect cleanly
    }
  }
}

main();
