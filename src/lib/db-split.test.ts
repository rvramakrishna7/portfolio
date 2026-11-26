import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { splitSql } from "./db-split";

describe("SQL migration splitter (splitSql)", () => {
  it("strips line comments and splits by semicolon", () => {
    const input = `
      -- Header comment
      CREATE TABLE test (id INT);
      -- Intermediary comment
      CREATE INDEX idx_test ON test(id);
    `;
    const statements = splitSql(input);
    expect(statements).toEqual([
      "CREATE TABLE test (id INT)",
      "CREATE INDEX idx_test ON test(id)",
    ]);
  });

  it("handles trailing semicolons and blank lines without producing empty statements", () => {
    const input = `
      CREATE TABLE a (id INT);

      
      CREATE TABLE b (id INT);;
      
    `;
    const statements = splitSql(input);
    expect(statements).toEqual([
      "CREATE TABLE a (id INT)",
      "CREATE TABLE b (id INT)",
    ]);
  });

  it("throws clear error when '$$' blocks are detected", () => {
    const input = `
      CREATE FUNCTION foo() RETURNS void AS $$
      BEGIN
      END;
      $$ LANGUAGE plpgsql;
    `;
    expect(() => splitSql(input)).toThrow(
      "Unsupported SQL construct: '$$' block detected"
    );
  });

  it("correctly splits the real 001_init.sql and asserts every statement starts with CREATE", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../db/migrations/001_init.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");
    const statements = splitSql(content);

    expect(statements.length).toBeGreaterThan(0);
    // Dynamic assertion: every statement in 001_init.sql starts with CREATE
    for (const stmt of statements) {
      expect(stmt.startsWith("CREATE")).toBe(true);
    }
  });

  it("correctly splits 008_tracking.sql without '$$' blocks", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../db/migrations/008_tracking.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");
    const statements = splitSql(content);

    expect(statements.length).toBeGreaterThan(0);
    for (const stmt of statements) {
      expect(stmt.startsWith("ALTER") || stmt.startsWith("CREATE")).toBe(true);
    }
  });
});
