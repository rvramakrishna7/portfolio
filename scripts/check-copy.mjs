import fs from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([
  ".css",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
]);

const BANNED_PATTERNS = [
  { label: "em dash (\\u2014)", regex: /\u2014/ },
  { label: "passionate", regex: /\bpassionate\b/i },
  { label: "innovative", regex: /\binnovative\b/i },
  { label: "cutting-edge", regex: /\bcutting-edge\b/i },
  { label: "leveraging", regex: /\bleveraging\b/i },
  { label: "revolutionizing", regex: /\brevolutionizing\b/i },
  { label: "seamless", regex: /\bseamless\b/i },
  { label: "highly scalable", regex: /\bhighly scalable\b/i },
  { label: "I thrive on", regex: /\bi thrive on\b/i },
  { label: "stopwatch", regex: /\bstopwatch\b/i },
  { label: "by hand", regex: /\bby hand\b/i },
];

function collectFiles(dirOrFilePath, results = []) {
  if (!fs.existsSync(dirOrFilePath)) {
    return results;
  }
  const stat = fs.statSync(dirOrFilePath);
  if (stat.isFile()) {
    const ext = path.extname(dirOrFilePath).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      results.push(path.resolve(dirOrFilePath));
    }
    return results;
  }
  const entries = fs.readdirSync(dirOrFilePath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirOrFilePath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        collectFiles(fullPath, results);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const args = process.argv.slice(2);
const targets =
  args.length > 0
    ? args.map((t) => path.resolve(process.cwd(), t))
    : [
        path.resolve(process.cwd(), "src"),
        path.resolve(process.cwd(), "docs/content-v2.md"),
      ];

const files = [];
for (const target of targets) {
  collectFiles(target, files);
}

// Deduplicate
const uniqueFiles = Array.from(new Set(files));
let violations = 0;

for (const filePath of uniqueFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const isDoc = filePath.endsWith(".md");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // In markdown files, ignore the rule definition line itself
    if (isDoc && /banned phrases:/i.test(line)) {
      continue;
    }

    for (const pattern of BANNED_PATTERNS) {
      if (pattern.regex.test(line)) {
        const relPath = path.relative(process.cwd(), filePath);
        console.error(
          `${relPath}:${i + 1}: banned token "${pattern.label}" found: ${line.trim()}`
        );
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`check:copy failed with ${violations} violation(s).`);
  process.exit(1);
} else {
  console.log(`check:copy passed (${uniqueFiles.length} file(s) scanned).`);
  process.exit(0);
}
