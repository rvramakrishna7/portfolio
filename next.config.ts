import type { NextConfig } from "next";

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL.includes("localhost") ||
    process.env.NEXT_PUBLIC_SITE_URL.includes("127.0.0.1"))
) {
  console.warn(
    "[WARN] Production build running with unset or localhost NEXT_PUBLIC_SITE_URL. Set the production domain in environment variables before public launch."
  );
}

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
