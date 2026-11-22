import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/admin/password";
import { createSessionToken } from "@/lib/admin/session";
import { getSessionCookieOptions } from "@/lib/admin/cookie";
import { verifyAdminOrigin } from "@/lib/admin/origin";
import { hashIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/admin/ratelimit";

const loginSchema = z.object({
  password: z.string().max(200, "Password exceeds maximum length"),
});

// Dummy hash to consume identical scrypt execution time on invalid inputs
const DUMMY_HASH = "scrypt$16384$8$1$c2FsdHNhbHNhbHNhbHQ=$aGFzaGFzaGFzaGFzaGFzaGFzaGFzaGFzaGFzaGFzaGE=";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "127.0.0.1";
}

export async function POST(req: Request) {
  // 1. Origin verification for state-changing requests
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      {
        status: 403,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  }

  // 2. Fail closed if secrets are not configured
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (
    !passwordHash ||
    !sessionSecret ||
    sessionSecret.length < 32 ||
    !passwordHash.startsWith("scrypt$")
  ) {
    return NextResponse.json(
      { error: "Admin authentication service unavailable" },
      {
        status: 503,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  }

  // 3. IP Rate Limiting
  const ip = getClientIp(req);
  const ipHash = hashIp(ip, sessionSecret);

  const rateCheck = await isLoginRateLimited(ipHash);
  if (rateCheck.locked) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Account temporarily locked." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfterSeconds),
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  }

  // 4. Parse request body
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    bodyJson = {};
  }

  const parsed = loginSchema.safeParse(bodyJson);

  if (!parsed.success) {
    // Run dummy verify to match timing
    await verifyPassword("invalid", DUMMY_HASH);
    await recordLoginAttempt(ipHash, false);
    return NextResponse.json(
      { error: "Wrong password" },
      {
        status: 401,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  }

  // 5. Verify password
  const isValid = await verifyPassword(parsed.data.password, passwordHash);
  if (!isValid) {
    await recordLoginAttempt(ipHash, false);
    return NextResponse.json(
      { error: "Wrong password" },
      {
        status: 401,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  }

  // 6. Success: record ok attempt and issue signed session cookie
  await recordLoginAttempt(ipHash, true);
  const token = createSessionToken(sessionSecret);
  const cookieOptions = getSessionCookieOptions();

  const response = NextResponse.json(
    { success: true },
    {
      status: 200,
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );

  response.cookies.set(cookieOptions.name, token, cookieOptions);
  return response;
}
