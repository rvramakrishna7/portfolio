#!/usr/bin/env node
import { neon } from "@neondatabase/serverless";

const REQUIRED_TABLES = [
  "login_attempts",
  "jobs",
  "contacts",
  "outreach",
  "events",
  "visits",
  "inbound_raw",
  "schema_migrations",
];

async function runCheck() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("FAIL: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    // 1. Connection check
    await sql`SELECT 1 as connected`;
    console.log("OK: Connected to database");

    // 2. Schema check (tables exist)
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const foundTables = new Set(rows.map((r) => r.table_name));

    let allTablesPresent = true;
    for (const table of REQUIRED_TABLES) {
      if (foundTables.has(table)) {
        console.log(`OK: table '${table}' exists`);
      } else {
        console.error(`FAIL: table '${table}' is missing`);
        allTablesPresent = false;
      }
    }

    if (!allTablesPresent) {
      console.error("FAIL: One or more required tables are missing. Run migrations first.");
      process.exit(1);
    }

    // 3. Round-trip test on login_attempts (insert, select, delete)
    const testIpHash = "db-check-test-hash";

    await sql`
      INSERT INTO login_attempts (ip_hash, ok)
      VALUES (${testIpHash}, true)
    `;
    console.log("OK: Inserted probe row into login_attempts");

    const probeRows = await sql`
      SELECT id, ip_hash, ok
      FROM login_attempts
      WHERE ip_hash = ${testIpHash}
      LIMIT 1
    `;

    if (probeRows.length === 0 || probeRows[0].ip_hash !== testIpHash) {
      console.error("FAIL: Probe row could not be selected from login_attempts");
      process.exit(1);
    }
    console.log("OK: Selected probe row from login_attempts");

    await sql`
      DELETE FROM login_attempts
      WHERE ip_hash = ${testIpHash}
    `;
    console.log("OK: Cleaned up probe row from login_attempts");

    console.log("ALL CHECKS PASSED: Database is reachable, migrated, and writable.");
  } catch (err) {
    console.error("FAIL: Database check encountered an error:", err.message || err);
    process.exit(1);
  }
}

runCheck();
