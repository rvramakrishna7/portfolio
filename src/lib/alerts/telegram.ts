export async function sendTelegramAlert(
  text: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  // If Telegram env vars are missing, skip silently and keep it unalerted
  if (!botToken || !chatId) {
    return false;
  }

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
    console.warn("[telegram-alert] Failed to send alert:", err);
    return false;
  }
}
