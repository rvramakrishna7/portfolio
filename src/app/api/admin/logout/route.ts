import { NextResponse } from "next/server";
import { getSessionCookieName, getSessionCookieOptions } from "@/lib/admin/cookie";
import { verifyAdminOrigin } from "@/lib/admin/origin";

export async function POST(req: Request) {
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

  const cookieName = getSessionCookieName();
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

  response.cookies.set(cookieName, "", {
    ...cookieOptions,
    maxAge: 0,
  });

  return response;
}
