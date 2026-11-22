import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Database operations cannot proceed."
    );
  }

  if (!cachedSql) {
    cachedSql = neon(databaseUrl);
  }

  return cachedSql;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}
