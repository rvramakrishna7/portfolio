import { expect, test } from "@playwright/test";
import { STORIES } from "../src/content/stories";

const ROUTES = ["/", ...STORIES.map((s) => `/work/${s.slug}`), "/nope"];

test.describe("Console and network health (S7)", () => {
  for (const route of ROUTES) {
    test(`route ${route} has zero console errors/warnings, zero failed requests, and zero 3rd-party calls`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      const thirdPartyRequests: string[] = [];

      page.on("console", (msg) => {
        const type = msg.type();
        const text = msg.text();
        // Browser naturally logs the 404 status of the main document navigation on /nope
        if (route === "/nope" && text.includes("404 (Not Found)")) {
          return;
        }
        if (type === "error" || type === "warning") {
          consoleErrors.push(`[${type}] ${text}`);
        }
      });

      page.on("requestfailed", (request) => {
        failedRequests.push(
          `${request.method()} ${request.url()} - ${request.failure()?.errorText}`
        );
      });

      page.on("response", (response) => {
        const url = response.url();
        const status = response.status();
        // The main document for /nope is expected to return 404
        if (route === "/nope" && url.endsWith("/nope")) {
          return;
        }
        if (status >= 400) {
          failedRequests.push(
            `${response.request().method()} ${url} returned HTTP ${status}`
          );
        }
      });

      page.on("request", (request) => {
        try {
          const u = new URL(request.url());
          if (
            u.hostname !== "localhost" &&
            u.hostname !== "127.0.0.1" &&
            !u.hostname.endsWith(".localhost")
          ) {
            thirdPartyRequests.push(request.url());
          }
        } catch {
          // ignore data: urls etc.
        }
      });

      const res = await page.goto(route);
      if (route === "/nope") {
        expect(res?.status()).toBe(404);
      } else {
        expect(res?.status()).toBe(200);
      }

      await page.waitForLoadState("networkidle");

      expect(consoleErrors, `Console errors/warnings on ${route}`).toEqual([]);
      expect(failedRequests, `Failed requests on ${route}`).toEqual([]);
      expect(thirdPartyRequests, `Third party requests on ${route}`).toEqual([]);
    });
  }

  test("Favicon and Open Graph image exist and return 200 with correct content types", async ({
    request,
  }) => {
    const iconRes = await request.get("/icon.svg");
    expect(iconRes.status()).toBe(200);
    expect(iconRes.headers()["content-type"]).toContain("svg");

    const ogRes = await request.get("/opengraph-image");
    expect(ogRes.status()).toBe(200);
    expect(ogRes.headers()["content-type"]).toContain("image");
  });
});
