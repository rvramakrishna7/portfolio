/**
 * Formatting utility for search run stats displayed in admin dashboard.
 * Safe to import in both Client and Server Components.
 */
export function formatLlmStatsSummary(
  calls: number,
  errors: number,
  errorReasons?: Record<string, number>,
  lastError?: string
): string {
  let errorDetail = "";
  if (errors > 0) {
    const reasons = Object.entries(errorReasons || {});
    if (reasons.length > 0) {
      reasons.sort((a, b) => b[1] - a[1]);
      const [topReason, count] = reasons[0];
      errorDetail = ` (${topReason} x${count})`;
    } else if (lastError) {
      errorDetail = ` (${lastError}${errors > 1 ? ` x${errors}` : ""})`;
    }
  }
  return `LLM: ${calls} calls, ${errors} errors${errorDetail}`;
}
