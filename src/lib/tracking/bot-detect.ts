export const BOT_USER_AGENT_PATTERN =
  /(?:bot|crawler|spider|preview|facebookexternalhit|linkedinbot|slackbot|whatsapp|curl|wget|python-requests|headless|googlebot|bingbot|yandex|duckduckbot|baiduspider|twitterbot|applebot|telegrambot|discordbot)/i;

/**
 * Classifies whether an incoming request user-agent represents a crawler/bot/preview.
 * Empty user-agent is also treated as a bot per requirements.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) {
    return true;
  }
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}
