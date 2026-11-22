#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "../db/migrations");

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // 1. Ensure schema_migrations table exists
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 2. Fetch applied migrations
  const appliedRows = await sql`SELECT name FROM schema_migrations ORDER BY id ASC`;
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  // 3. Read migration files in order
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("No migrations directory found. Nothing to apply.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    console.log(`Applying migration: ${file}...`);
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sqlContent = fs.readFileSync(filePath, "utf8");

    // Execute migration inside a transaction block
    await sql.transaction([
      sql(sqlContent),
      sql`INSERT INTO schema_migrations (name) VALUES (${file})`,
    ]);

    console.log(`Applied: ${file}`);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log("Database schema is already up to date. Zero migrations applied.");
  } else {
    console.log(`Successfully applied ${appliedCount} migration(s).`);
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
