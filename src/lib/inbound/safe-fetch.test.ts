import { describe, it, expect, vi } from "vitest";
import {
  isPrivateOrBlockedIp,
  validateSafeUrl,
  safeFetch,
} from "./safe-fetch";

describe("SSRF Protection (src/lib/inbound/safe-fetch.ts)", () => {
  describe("isPrivateOrBlockedIp", () => {
    it("blocks IPv4 loopback (127.0.0.0/8)", () => {
      expect(isPrivateOrBlockedIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("127.0.1.1")).toBe(true);
    });

    it("blocks AWS/GCP cloud metadata IP (169.254.169.254)", () => {
      expect(isPrivateOrBlockedIp("169.254.169.254")).toBe(true);
      expect(isPrivateOrBlockedIp("169.254.0.1")).toBe(true);
    });

    it("blocks private RFC 1918 IPv4 ranges", () => {
      expect(isPrivateOrBlockedIp("10.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("10.255.255.255")).toBe(true);
      expect(isPrivateOrBlockedIp("172.16.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("172.31.255.255")).toBe(true);
      expect(isPrivateOrBlockedIp("192.168.1.1")).toBe(true);
    });

    it("blocks IPv6 loopback, unspecified, and private ranges", () => {
      expect(isPrivateOrBlockedIp("::1")).toBe(true);
      expect(isPrivateOrBlockedIp("::")).toBe(true);
      expect(isPrivateOrBlockedIp("fc00::1")).toBe(true);
      expect(isPrivateOrBlockedIp("fe80::1")).toBe(true);
      expect(isPrivateOrBlockedIp("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIp("::ffff:169.254.169.254")).toBe(true);
    });

    it("allows public routable IPv4 and IPv6 addresses", () => {
      expect(isPrivateOrBlockedIp("8.8.8.8")).toBe(false);
      expect(isPrivateOrBlockedIp("1.1.1.1")).toBe(false);
      expect(isPrivateOrBlockedIp("93.184.216.34")).toBe(false);
      expect(isPrivateOrBlockedIp("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("validateSafeUrl", () => {
    it("rejects non-HTTP protocols", async () => {
      const resFile = await validateSafeUrl("file:///etc/passwd");
      expect(resFile.safe).toBe(false);
      expect(resFile.error).toContain("Disallowed protocol");

      const resFtp = await validateSafeUrl("ftp://example.com/file");
      expect(resFtp.safe).toBe(false);

      const resData = await validateSafeUrl("data:text/plain;base64,SGVsbG8=");
      expect(resData.safe).toBe(false);
    });

    it("rejects literal blocked hosts", async () => {
      const resLocalhost = await validateSafeUrl("http://localhost:3000");
      expect(resLocalhost.safe).toBe(false);
      expect(resLocalhost.error).toContain("Blocked host");

      const resMetadata = await validateSafeUrl("http://metadata.google.internal/computeMetadata/v1/");
      expect(resMetadata.safe).toBe(false);
    });

    it("rejects hostnames that resolve to private/loopback IPs", async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      const res = await validateSafeUrl("https://evil-subdomain.com/job", mockDns);
      expect(res.safe).toBe(false);
      expect(res.error).toContain("resolved to private/blocked IP");
    });
  });

  describe("safeFetch", () => {
    it("blocks request directly when destination is 127.0.0.1 or metadata IP", async () => {
      const resLoopback = await safeFetch("http://127.0.0.1:8080/secret");
      expect(resLoopback.ok).toBe(false);
      expect(resLoopback.error).toContain("SSRF Blocked");

      const resMeta = await safeFetch("http://169.254.169.254/latest/meta-data/");
      expect(resMeta.ok).toBe(false);
      expect(resMeta.error).toContain("SSRF Blocked");
    });

    it("aborts when redirect points to a private/loopback IP", async () => {
      const mockDns = vi
        .fn()
        .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]) // First URL: public
        .mockResolvedValueOnce([{ address: "192.168.1.1", family: 4 }]); // Redirect URL: private

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Headers({ location: "http://internal-router.local/admin" }),
      });

      const res = await safeFetch("https://safe-url.com/link", {
        fetchFn: mockFetch,
        dnsLookupFn: mockDns,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("SSRF Blocked");
    });

    it("fetches safe content successfully and respects body size cap", async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const content = "<h1>Software Engineer at Stripe</h1>";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => new TextEncoder().encode(content).buffer,
      });

      const res = await safeFetch("https://stripe.com/careers/software-engineer", {
        fetchFn: mockFetch,
        dnsLookupFn: mockDns,
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.body).toContain("Software Engineer at Stripe");
    });

    it("rejects payloads exceeding the maxBytes limit", async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const largeBuffer = new Uint8Array(2 * 1024 * 1024); // 2 MB
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => largeBuffer.buffer,
      });

      const res = await safeFetch("https://large-page.com", {
        fetchFn: mockFetch,
        dnsLookupFn: mockDns,
        maxBytes: 1.5 * 1024 * 1024,
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(413);
      expect(res.error).toContain("exceeds");
    });
  });
});
