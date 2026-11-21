import fs from "node:fs";
import path from "node:path";

export function getVisibleText(html) {
  // Strip head, script, style, and noscript elements
  let text = html.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ");
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");

  // Strip all HTML tags, preserving inner text
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return text;
}

export function extractNumbers(text) {
  // Matches standalone integers or decimals/comma numbers (e.g. 1,212, 18.83, 3.35, 45, 01)
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  return Array.from(new Set(matches));
}

export function checkBuiltHtmlNumbers(rootDir = process.cwd()) {
  const contentPath = path.join(rootDir, "docs", "content.md");
  if (!fs.existsSync(contentPath)) {
    throw new Error(`Content file not found at ${contentPath}`);
  }
  const content = fs.readFileSync(contentPath, "utf8");

  const builtPages = [
    ".next/server/app/index.html",
    ".next/server/app/work/restart-options.html",
    ".next/server/app/work/mcp-gateway.html",
    ".next/server/app/work/vouch.html",
    ".next/server/app/work/zync.html",
  ];

  const results = [];
  let hasFailure = false;

  for (const pageRel of builtPages) {
    const fullPath = path.join(rootDir, pageRel);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Built page not found at ${fullPath}. Did you run "npm run build"?`);
    }

    const html = fs.readFileSync(fullPath, "utf8");
    const visibleText = getVisibleText(html);
    const numbers = extractNumbers(visibleText);

    const missing = numbers.filter((num) => !content.includes(num));
    if (missing.length > 0) {
      hasFailure = true;
    }

    results.push({
      page: pageRel,
      count: numbers.length,
      numbers,
      missing,
    });
  }

  return { hasFailure, results };
}

// CLI execution
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  try {
    const { hasFailure, results } = checkBuiltHtmlNumbers();
    for (const r of results) {
      if (r.missing.length > 0) {
        console.error(`FAIL: ${r.page} contains numbers not found in docs/content.md: ${r.missing.join(", ")}`);
      } else {
        console.log(`PASS: ${r.page} (${r.count} numbers checked, all in content.md)`);
      }
    }

    if (hasFailure) {
      process.exit(1);
    } else {
      console.log("check:numbers passed: all visible numbers across all 5 pages match docs/content.md.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Error running check:numbers:", err.message);
    process.exit(1);
  }
}
