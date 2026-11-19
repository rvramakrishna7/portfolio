import fs from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([
  ".css",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".svg",
  ".html",
]);

const BANNED_PATTERNS = [
  { label: "gradient", regex: /gradient/i },
  { label: "backdrop-filter", regex: /backdrop-filter/i },
  { label: "blur(", regex: /blur\(/i },
];

function collectFiles(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) {
    return results;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, results);
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
const targetDirs =
  args.length > 0
    ? args.map((d) => path.resolve(process.cwd(), d))
    : [path.resolve(process.cwd(), "src"), path.resolve(process.cwd(), "public")];

const files = [];
for (const dir of targetDirs) {
  collectFiles(dir, files);
}

let violations = 0;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
  console.error(`check:flat failed with ${violations} violation(s).`);
  process.exit(1);
} else {
  console.log(`check:flat passed (${files.length} file(s) scanned).`);
  process.exit(0);
}
