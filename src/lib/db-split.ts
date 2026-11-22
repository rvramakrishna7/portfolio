/**
 * Splits a SQL migration script into individual executable statements.
 * Strips '--' single-line comments, splits on ';' at statement boundary,
 * trims whitespace, ignores empty statements, and throws on '$$' blocks.
 */
export function splitSql(sql: string): string[] {
  if (sql.includes("$$")) {
    throw new Error(
      "Unsupported SQL construct: '$$' block detected. Splitter requires plain statements without dollar-quoted strings."
    );
  }

  // Remove '--' line comments
  const cleaned = sql.replace(/--.*$/gm, "");

  // Split by ';' and filter out empty statements
  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
