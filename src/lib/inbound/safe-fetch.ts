import dns from "node:dns/promises";
import net from "node:net";

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  body: string;
  finalUrl: string;
  error?: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchFn?: typeof fetch;
  dnsLookupFn?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const DEFAULT_MAX_REDIRECTS = 3;

/**
 * Checks if an IPv4 address falls into private, loopback, link-local, or cloud metadata ranges.
 */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
    return true; // Malformed IPv4 is blocked
  }

  const [b0, b1, b2] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (b0 === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private network)
  if (b0 === 192 && b1 === 168) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // Documentation / test ranges
  if (b0 === 192 && b1 === 0 && b2 === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true; // 203.0.113.0/24 (TEST-NET-3)

  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address falls into private, loopback, or link-local ranges.
 */
function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // Unspecified ::
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // IPv4-mapped IPv6: ::ffff:192.0.2.128
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isBlockedIPv4(v4Part);
    }
  }

  // fc00::/7 (Unique local addresses / private)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;

  // fe80::/10 (Link-local addresses)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;

  return false;
}

/**
 * Returns true if an IP address (v4 or v6) is private, loopback, or restricted.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isBlockedIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isBlockedIPv6(ip);
  }
  return true; // Non-IP or invalid string is blocked
}

/**
 * Validates a target URL and its resolved IP addresses against SSRF attack vectors.
 */
export async function validateSafeUrl(
  urlStr: string,
  dnsLookupFn?: (hostname: string) => Promise<Array<{ address: string; family: number }>>
): Promise<{ safe: boolean; error?: string; url?: URL }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, error: "Invalid URL" };
  }

  // Scheme check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, error: `Disallowed protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname blacklists
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal"
  ) {
    return { safe: false, error: `Blocked host: ${hostname}` };
  }

  // If hostname is directly an IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      return { safe: false, error: `Blocked IP address: ${hostname}` };
    }
    return { safe: true, url: parsed };
  }

  // Resolve hostname via DNS
  try {
    const lookup = dnsLookupFn
      ? await dnsLookupFn(hostname)
      : await dns.lookup(hostname, { all: true });

    if (!lookup || lookup.length === 0) {
      return { safe: false, error: `DNS lookup failed for ${hostname}` };
    }

    for (const record of lookup) {
      if (isPrivateOrBlockedIp(record.address)) {
        return {
          safe: false,
          error: `Host ${hostname} resolved to private/blocked IP ${record.address}`,
        };
      }
    }
  } catch (err) {
    return { safe: false, error: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return { safe: true, url: parsed };
}

/**
 * Performs a hardened HTTP GET fetch with SSRF protection, redirect verification,
 * timeout limits, and response body size caps.
 */
export async function safeFetch(
  urlStr: string,
  options?: SafeFetchOptions
): Promise<SafeFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const fetchFn = options?.fetchFn ?? fetch;

  let currentUrl = urlStr;
  let redirectsCount = 0;

  while (true) {
    // 1. SSRF validation of current URL
    const validation = await validateSafeUrl(currentUrl, options?.dnsLookupFn);
    if (!validation.safe || !validation.url) {
      return {
        ok: false,
        status: 400,
        body: "",
        finalUrl: currentUrl,
        error: `SSRF Blocked: ${validation.error}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchFn(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // 2. Handle redirects manually to re-verify destination IPs
      if (
        res.status === 301 ||
        res.status === 302 ||
        res.status === 303 ||
        res.status === 307 ||
        res.status === 308
      ) {
        redirectsCount++;
        if (redirectsCount > maxRedirects) {
          return {
            ok: false,
            status: res.status,
            body: "",
            finalUrl: currentUrl,
            error: `Too many redirects (max ${maxRedirects})`,
          };
        }

        const locationHeader = res.headers.get("location");
        if (!locationHeader) {
          return {
            ok: false,
            status: res.status,
            body: "",
            finalUrl: currentUrl,
            error: "Redirect missing Location header",
          };
        }

        // Resolve relative redirects against current URL
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          body: "",
          finalUrl: currentUrl,
          error: `HTTP ${res.status}`,
        };
      }

      // 3. Read body with size cap
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > maxBytes) {
        return {
          ok: false,
          status: 413,
          body: "",
          finalUrl: currentUrl,
          error: `Response size exceeds ${maxBytes} bytes limit`,
        };
      }

      const text = new TextDecoder("utf-8").decode(arrayBuf);
      return {
        ok: true,
        status: res.status,
        body: text,
        finalUrl: currentUrl,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      return {
        ok: false,
        status: 0,
        body: "",
        finalUrl: currentUrl,
        error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
