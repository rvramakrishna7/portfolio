import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionCookieName } from "./cookie";
import { verifySessionToken, type SessionPayload } from "./session";

/**
 * For Server Components / Pages:
 * Validates session cookie. If missing or invalid, immediately redirects to /admin/login.
 */
export async function requireAdminPage(): Promise<SessionPayload> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    redirect("/admin/login");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  const session = verifySessionToken(token, secret);
  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

/**
 * For API Route Handlers:
 * Validates session cookie from the incoming Request.
 * Returns { session } on success, or { errorResponse } with 401 status on failure.
 */
export function requireAdminApi(req: Request):
  | { session: SessionPayload; errorResponse: null }
  | { session: null; errorResponse: NextResponse } {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      ),
    };
  }

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieName = getSessionCookieName();
  
  // Extract cookie value safely
  const cookiesList = cookieHeader.split(";").map((c) => c.trim());
  const targetCookie = cookiesList.find((c) => c.startsWith(`${cookieName}=`));
  let token: string | null = null;
  if (targetCookie) {
    try {
      token = decodeURIComponent(targetCookie.slice(cookieName.length + 1));
    } catch {
      // Malformed URI encoding (e.g. "%E0%A4%A") -> reject safely with null, never 500
      token = null;
    }
  }

  const session = verifySessionToken(token, secret);
  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      ),
    };
  }

  return { session, errorResponse: null };
}
