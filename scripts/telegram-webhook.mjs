#!/usr/bin/env node
/**
 * Telegram Bot Webhook Management Helper
 *
 * Usage:
 *   node scripts/telegram-webhook.mjs info
 *   node scripts/telegram-webhook.mjs set https://yourdomain.com/api/telegram/webhook
 *   node scripts/telegram-webhook.mjs delete
 *
 * Requires:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 */

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken) {
  console.error("Error: TELEGRAM_BOT_TOKEN environment variable is required.");
  process.exit(1);
}

const command = process.argv[2] || "info";
const targetUrl = process.argv[3];

async function callTelegram(method, body) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const options = {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  switch (command.toLowerCase()) {
    case "info": {
      console.log("Fetching webhook info...");
      const res = await callTelegram("getWebhookInfo");
      console.log(JSON.stringify(res.data, null, 2));
      break;
    }
    case "set": {
      if (!targetUrl) {
        console.error("Error: Webhook URL required for 'set'. Usage: node scripts/telegram-webhook.mjs set <url>");
        process.exit(1);
      }
      if (!webhookSecret) {
        console.error("Error: TELEGRAM_WEBHOOK_SECRET environment variable is required for 'set'.");
        process.exit(1);
      }
      console.log(`Setting webhook to: ${targetUrl}`);
      const res = await callTelegram("setWebhook", {
        url: targetUrl,
        secret_token: webhookSecret,
      });
      console.log(JSON.stringify(res.data, null, 2));
      break;
    }
    case "delete": {
      console.log("Deleting webhook...");
      const res = await callTelegram("deleteWebhook");
      console.log(JSON.stringify(res.data, null, 2));
      break;
    }
    default:
      console.error(`Unknown command '${command}'. Use 'info', 'set <url>', or 'delete'.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
