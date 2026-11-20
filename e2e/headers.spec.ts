import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", name: "home (/)" },
  { path: "/work/vouch", name: "story (/work/vouch)" },
  { path: "/nope", name: "404 page (/nope)" },
  { path: "/api/contact", name: "API route (/api/contact)" },
  { path: "/robots.txt", name: "static robots (/robots.txt)" },
];

test.describe("Security headers audit (S7)", () => {
  for (const { path, name } of routes) {
    test(`verifies all security headers are present on ${name}`, async ({
      request,
    }) => {
      const response = await request.get(path);
      const headers = response.headers();

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["permissions-policy"]).toBe(
        "camera=(), microphone=(), geolocation=()"
      );
      expect(headers["content-security-policy"]).toBe(
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';"
      );
      expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    });
  }
});
