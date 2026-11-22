import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName } from "./lib/admin/cookie";
import { verifySessionToken } from "./lib/admin/session";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.ADMIN_SESSION_SECRET;

  const cookieName = getSessionCookieName();
  const token = req.cookies.get(cookieName)?.value;
  const hasValidSession = Boolean(secret && secret.length >= 32 && verifySessionToken(token, secret));

  // If hitting /admin/login:
  if (pathname === "/admin/login") {
    // If already logged in, redirect to /admin dashboard
    if (hasValidSession) {
      const dashboardUrl = new URL("/admin", req.url);
      return NextResponse.redirect(dashboardUrl);
    }

    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Allow unauthenticated POST to /api/admin/login
  if (pathname === "/api/admin/login") {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Protected API routes: /api/admin/*
  if (pathname.startsWith("/api/admin")) {
    if (!hasValidSession) {
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Protected pages: /admin/*
  if (pathname.startsWith("/admin")) {
    if (!hasValidSession) {
      const loginUrl = new URL("/admin/login", req.url);
      return NextResponse.redirect(loginUrl);
    }

    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
