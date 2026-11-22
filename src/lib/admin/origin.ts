export function verifyAdminOrigin(req: Request): boolean {
  const method = req.method.toUpperCase();
  // Safe methods do not require origin check
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");

  if (!originHeader && !refererHeader) {
    return false;
  }

  const requestHost = hostHeader || new URL(req.url).host;

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      return originUrl.host.toLowerCase() === requestHost.toLowerCase();
    } catch {
      return false;
    }
  }

  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return refererUrl.host.toLowerCase() === requestHost.toLowerCase();
    } catch {
      return false;
    }
  }

  return false;
}
