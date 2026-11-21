/**
 * scripts/run-lighthouse.mjs
 * Production Lighthouse audit automation script for Portfolio site.
 * Audits all 5 pages (home, restart-options, mcp-gateway, vouch, zync)
 * in desktop mode and mobile mode (median of 3 mobile runs).
 * Collects and outputs Performance, Accessibility, Best Practices, and SEO scores.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Users\\91937\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe";

process.env.CHROME_PATH = CHROME_PATH;

const PAGES = [
  { name: "home", url: "http://127.0.0.1:3000/" },
  { name: "restart-options", url: "http://127.0.0.1:3000/work/restart-options" },
  { name: "mcp-gateway", url: "http://127.0.0.1:3000/work/mcp-gateway" },
  { name: "vouch", url: "http://127.0.0.1:3000/work/vouch" },
  { name: "zync", url: "http://127.0.0.1:3000/work/zync" },
];

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch("http://127.0.0.1:3000/");
      if (res.status === 200) {
        return;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms. Last error: ${lastErr?.message}`);
}

function runLighthouseCategory(url, isDesktop = false, retries = 2) {
  const tmpJson = path.join(
    os.tmpdir(),
    `lh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  const presetFlag = isDesktop ? "--preset=desktop" : "";
  const chromeFlags = "--headless=new --no-sandbox --disable-dev-shm-usage";
  const cmd = `npx --yes lighthouse "${url}" ${presetFlag} --output=json --output-path="${tmpJson}" --chrome-flags="${chromeFlags}" --only-categories=performance,accessibility,best-practices,seo --quiet`;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      execSync(cmd, { stdio: "pipe", env: { ...process.env, CHROME_PATH } });
      const content = JSON.parse(fs.readFileSync(tmpJson, "utf8"));
      if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);

      const cats = content.categories;
      const audits = content.audits;
      return {
        performance: Math.round((cats.performance?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100),
        bestPractices: Math.round((cats["best-practices"]?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
        metrics: {
          fcp: audits["first-contentful-paint"]?.displayValue,
          lcp: audits["largest-contentful-paint"]?.displayValue,
          tbt: audits["total-blocking-time"]?.displayValue,
          cls: audits["cumulative-layout-shift"]?.displayValue,
          si: audits["speed-index"]?.displayValue,
        },
      };
    } catch (err) {
      if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
      if (attempt <= retries) {
        console.log(`    (Lighthouse attempt ${attempt} failed, retrying in 2s...)`);
        execSync("node -e \"setTimeout(() => {}, 2000)\"");
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  console.log("Starting Next.js production server on port 3000...");
  const server = spawn("npm.cmd", ["start"], {
    stdio: "inherit",
    shell: true,
  });

  try {
    await waitForServer("http://localhost:3000/");
    console.log("Production server is ready at http://localhost:3000/\n");

    const summary = [];

    for (const page of PAGES) {
      console.log(`Auditing ${page.name} (${page.url})...`);

      // Desktop audit
      const desktop = runLighthouseCategory(page.url, true);
      console.log(
        `  Desktop: P=${desktop.performance} A=${desktop.accessibility} BP=${desktop.bestPractices} SEO=${desktop.seo} (FCP: ${desktop.metrics.fcp}, LCP: ${desktop.metrics.lcp}, TBT: ${desktop.metrics.tbt})`
      );

      // Mobile audit (run 3 times, take median for performance per R-master)
      const mobileRuns = [];
      for (let i = 0; i < 3; i++) {
        const m = runLighthouseCategory(page.url, false);
        mobileRuns.push(m);
        execSync("node -e \"setTimeout(() => {}, 1000)\"");
      }
      mobileRuns.sort((a, b) => a.performance - b.performance);
      const mobile = mobileRuns[1]; // median run
      console.log(
        `  Mobile (median of 3): P=${mobile.performance} A=${mobile.accessibility} BP=${mobile.bestPractices} SEO=${mobile.seo} (FCP: ${mobile.metrics.fcp}, LCP: ${mobile.metrics.lcp}, TBT: ${mobile.metrics.tbt})`
      );

      summary.push({
        name: page.name,
        desktop,
        mobile,
      });
    }

    console.log("\n================ LIGHTHOUSE SUMMARY ================");
    for (const s of summary) {
      console.log(
        `${s.name.padEnd(16)} | Desktop: P=${String(s.desktop.performance).padStart(3)} A=${String(s.desktop.accessibility).padStart(3)} BP=${String(s.desktop.bestPractices).padStart(3)} SEO=${String(s.desktop.seo).padStart(3)} | Mobile: P=${String(s.mobile.performance).padStart(3)} A=${String(s.mobile.accessibility).padStart(3)} BP=${String(s.mobile.bestPractices).padStart(3)} SEO=${String(s.mobile.seo).padStart(3)}`
      );
    }
  } finally {
    console.log("\nStopping server process...");
    if (server.pid) {
      try {
        execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("Lighthouse runner failed:", err);
  process.exit(1);
});
