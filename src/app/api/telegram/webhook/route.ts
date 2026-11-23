import { NextRequest, NextResponse } from "next/server";
import { parseInboundCandidates, processAndIngestInboundCandidates } from "../../../../lib/inbound/parse";
import { getJobsRepository } from "../../../../lib/jobs/repository";
import { safeCompare } from "../../../../lib/admin/safe-compare";

export const dynamic = "force-dynamic";

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json",
};

/**
 * Sends a text message to a Telegram chat via the Telegram Bot API.
 */
async function sendTelegramReply(
  botToken: string,
  chatId: string | number,
  text: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[telegram-webhook] Failed to send reply:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");

  // Security: check secret token header using timingSafeEqual
  if (!secretToken || !safeCompare(headerSecret, secretToken)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NOINDEX_HEADERS }
    );
  }

  let body: {
    message?: {
      chat?: { id?: number | string };
      text?: string;
      caption?: string;
    };
    channel_post?: {
      chat?: { id?: number | string };
      text?: string;
      caption?: string;
    };
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const message = body?.message || body?.channel_post;
  if (!message) {
    return NextResponse.json({ ok: true, ignored: true }, { headers: NOINDEX_HEADERS });
  }

  const chatId = message.chat?.id ? String(message.chat.id) : null;
  const text = (message.text || message.caption || "").trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Command: /whoami
  if (text === "/whoami" || text.startsWith("/whoami ")) {
    if (botToken && chatId) {
      await sendTelegramReply(botToken, chatId, `Your Telegram Chat ID: ${chatId}`);
    }
    return NextResponse.json(
      { ok: true, handled: "whoami", chatId },
      { headers: NOINDEX_HEADERS }
    );
  }

  // Check if update is from configured owner chat
  const ownerChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const cleanChatId = chatId ? String(chatId).trim() : null;
  if (!ownerChatId || !cleanChatId || ownerChatId !== cleanChatId) {
    // Ignore non-owner chats silently with 200 OK so Telegram does not retry
    return NextResponse.json(
      { ok: true, ignored: true },
      { headers: NOINDEX_HEADERS }
    );
  }

  if (!text) {
    if (botToken && chatId) {
      await sendTelegramReply(botToken, chatId, "No job found in message");
    }
    return NextResponse.json(
      { ok: true, candidates: 0 },
      { headers: NOINDEX_HEADERS }
    );
  }

  const repo = getJobsRepository();
  const candidates = parseInboundCandidates(text, { source: "telegram" });

  if (candidates.length === 0) {
    if (botToken && chatId) {
      await sendTelegramReply(botToken, chatId, "No job found in message");
    }
    return NextResponse.json(
      { ok: true, candidates: 0 },
      { headers: NOINDEX_HEADERS }
    );
  }

  const ingestRes = await processAndIngestInboundCandidates(candidates, repo);

  if (botToken && chatId) {
    if (ingestRes.added > 0) {
      for (const job of ingestRes.jobs) {
        const statusLabel = job.filter_reason
          ? `filtered: ${job.filter_reason}`
          : job.status;
        await sendTelegramReply(
          botToken,
          chatId,
          `Added: ${job.title} at ${job.company} (${statusLabel})`
        );
      }
    } else if (ingestRes.duplicates > 0) {
      await sendTelegramReply(botToken, chatId, "Duplicate: already stored");
    } else {
      await sendTelegramReply(botToken, chatId, "No job found in message");
    }
  }

  return NextResponse.json(
    {
      ok: true,
      added: ingestRes.added,
      duplicates: ingestRes.duplicates,
      filtered: ingestRes.filtered,
    },
    { headers: NOINDEX_HEADERS }
  );
}
