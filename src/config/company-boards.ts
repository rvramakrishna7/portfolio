/**
 * Verified company job boards for Greenhouse, Lever, and Ashby.
 * Validated via live probes to return HTTP 200 with active postings.
 */

export interface CompanyBoardConfig {
  greenhouse: string[];
  lever: string[];
  ashby: string[];
}

export const VERIFIED_COMPANY_BOARDS: CompanyBoardConfig = {
  greenhouse: [
    "gitlab",
    "stripe",
    "figma",
    "airbnb",
    "elastic",
    "databricks",
    "cloudflare",
    "reddit",
    "instacart",
    "coinbase",
    "lyft",
    "discord",
    "gusto",
    "affirm",
    "canonical",
    "datadog",
    "mongodb",
    "cockroachlabs",
    "coursera",
    "scaleai",
    "okta",
    "twilio",
    "blend",
  ],
  lever: [
    "kinsta",
    "spotify",
  ],
  ashby: [
    "linear",
    "openai",
    "perplexity",
    "ramp",
    "modal",
    "cursor",
    "resend",
    "supabase",
    "railway",
    "posthog",
    "elevenlabs",
    "replit",
    "dust",
    "livekit",
    "warp",
    "render",
  ],
};
