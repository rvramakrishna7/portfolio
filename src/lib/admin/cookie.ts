export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-admin" : "admin";
}

export function getSessionCookieOptions(isProduction: boolean = process.env.NODE_ENV === "production") {
  return {
    name: getSessionCookieName(),
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 12 * 60 * 60, // 12 hours
  };
}
