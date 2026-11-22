import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(__dirname, "check-copy.mjs");

describe("scripts/check-copy.mjs", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-check-copy-"));
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "docs"), { recursive: true });
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exits 1 and reports line on em dash", () => {
    const fixtureFile = path.join(tempRoot, "src", "bad.ts");
    fs.writeFileSync(
      fixtureFile,
      'export const copy = "Here is an em dash — forbidden";\n',
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "src"], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bad.ts:1");
    expect(result.stderr).toContain("em dash");
  });

  it("exits 1 on banned buzzwords", () => {
    const fixtureFile = path.join(tempRoot, "src", "banned.ts");
    fs.writeFileSync(
      fixtureFile,
      'export const copy = "We build seamless and innovative apps";\n',
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "src"], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("banned.ts:1");
    expect(result.stderr).toContain("seamless");
  });

  it("exits 1 on stopwatch or by hand", () => {
    const fixtureFile = path.join(tempRoot, "src", "banned-timing.ts");
    fs.writeFileSync(
      fixtureFile,
      'export const copy = "Timed with a stopwatch or done by hand";\n',
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "src"], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("banned-timing.ts:1");
    expect(result.stderr).toContain("stopwatch");
    expect(result.stderr).toContain("by hand");
  });

  it("exits 0 on clean copy", () => {
    const fixtureFile = path.join(tempRoot, "src", "clean.ts");
    fs.writeFileSync(
      fixtureFile,
      'export const copy = "We build reliable software with measured results.";\n',
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "src"], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check:copy passed");
  });
});
