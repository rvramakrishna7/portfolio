import { z } from "zod";

const MAX_BODY_BYTES = 10 * 1024; // 10 KB
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;
export const MAX_RATE_LIMIT_ENTRIES = 5000;

// In-memory rate limiting map: ip -> timestamps[]
// Note: In serverless environments, this is best-effort per instance.
const ipRateLimitMap = new Map<string, number[]>();

export function pruneRateLimitMap(now: number = Date.now()): void {
  // 1. Remove entries with no timestamps in the active window
  for (const [ip, timestamps] of ipRateLimitMap.entries()) {
    const active = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) {
      ipRateLimitMap.delete(ip);
    } else if (active.length !== timestamps.length) {
      ipRateLimitMap.set(ip, active);
    }
  }

  // 2. Cap the map at MAX_RATE_LIMIT_ENTRIES by dropping oldest entries
  if (ipRateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const excess = ipRateLimitMap.size - MAX_RATE_LIMIT_ENTRIES;
    let dropped = 0;
    for (const key of ipRateLimitMap.keys()) {
      ipRateLimitMap.delete(key);
      dropped++;
      if (dropped >= excess) break;
    }
  }
}

export function _resetRateLimitsForTesting(): void {
  ipRateLimitMap.clear();
}

export function _getRateLimitMapSizeForTesting(): number {
  return ipRateLimitMap.size;
}

export function _setRateLimitEntryForTesting(ip: string, timestamps: number[]): void {
  ipRateLimitMap.set(ip, timestamps);
}

function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .min(1, "Your name is required")
        .max(80, "Name must be at most 80 characters")
    ),
  email: z
    .string()
    .trim()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .min(1, "Your email is required")
        .max(254, "Email must be at most 254 characters")
        .email("Please enter a valid email address")
    ),
  message: z
    .string()
    .trim()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .min(10, "Message must be at least 10 characters")
        .max(4000, "Message must be at most 4000 characters")
    ),
  website: z.string().optional(),
});

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

function methodNotAllowed() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      Allow: "POST",
      "Content-Type": "application/json",
    },
  });
}

export async function GET() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function POST(req: Request): Promise<Response> {
  // 1. Check Content-Type header
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response(
      JSON.stringify({ error: "Content-Type must be application/json" }),
      {
        status: 415,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 2. Check Origin header if present
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(req.url);
      if (originUrl.host !== requestUrl.host) {
        return new Response(JSON.stringify({ error: "Forbidden origin" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 3. Check body size
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: "Payload exceeds 10 KB limit" }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: "Payload exceeds 10 KB limit" }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 4. Rate limiting per IP
  const ip = getClientIp(req);
  const now = Date.now();
  pruneRateLimitMap(now);
  const timestamps = (ipRateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again later.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "600",
        },
      }
    );
  }

  timestamps.push(now);
  ipRateLimitMap.set(ip, timestamps);

  // 5. Check server access key
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) {
    console.error("WEB3FORMS_ACCESS_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 6. Parse JSON and validate
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validationResult = contactFormSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    const formattedErrors: Record<string, string> = {};
    for (const issue of validationResult.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !formattedErrors[field]) {
        formattedErrors[field] = issue.message;
      }
    }
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        errors: formattedErrors,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { name, email, message, website } = validationResult.data;

  // 7. Honeypot check: if filled, return success silently without forwarding
  if (website && website.trim().length > 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "Thanks. Your message is on its way, and I'll reply soon.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 8. Forward to Web3Forms
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const forwardResponse = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: accessKey,
        name,
        email,
        message,
        subject: `Portfolio message from ${name}`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!forwardResponse.ok) {
      return new Response(
        JSON.stringify({
          error:
            "That did not send. Please try again, or message me on LinkedIn.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const forwardData = (await forwardResponse.json().catch(() => null)) as {
      success?: boolean;
    } | null;

    if (!forwardData || forwardData.success !== true) {
      return new Response(
        JSON.stringify({
          error:
            "That did not send. Please try again, or message me on LinkedIn.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Thanks. Your message is on its way, and I'll reply soon.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "That did not send. Please try again, or message me on LinkedIn.",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
