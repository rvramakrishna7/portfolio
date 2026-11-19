import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(__dirname, "check-flat.mjs");

describe("scripts/check-flat.mjs", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-check-flat-"));
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "public"), { recursive: true });
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exits 1 and reports file and line on a temporary fixture containing linear-gradient(", () => {
    const fixtureFile = path.join(tempRoot, "src", "bad.css");
    fs.writeFileSync(
      fixtureFile,
      ".card {\n  background: linear-gradient(to right, #000, #111);\n}\n",
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bad.css:2");
  });

  it("exits 0 on a clean temporary fixture", () => {
    const fixtureFile = path.join(tempRoot, "src", "clean.css");
    fs.writeFileSync(
      fixtureFile,
      ".card {\n  background-color: #11141a;\n  color: #ece8df;\n}\n",
      "utf8"
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check:flat passed");
  });
});
