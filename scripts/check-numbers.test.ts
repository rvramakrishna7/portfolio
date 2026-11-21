import { describe, expect, it } from "vitest";
import {
  checkBuiltHtmlNumbers,
  extractNumbers,
  getVisibleText,
} from "./check-numbers.mjs";

describe("scripts/check-numbers.mjs (TEST-013)", () => {
  it("strips scripts, styles, noscript, and tags from HTML", () => {
    const sampleHtml = `
      <html>
        <head><title>Test 100</title></head>
        <body>
          <style>.hide { display: none; }</style>
          <script>const x = 9999;</script>
          <noscript><div>No JS 888</div></noscript>
          <h1>Heading with 42</h1>
          <p>Result is 3.35 s &rarr; 18.83 s</p>
        </body>
      </html>
    `;
    const visible = getVisibleText(sampleHtml);
    expect(visible).not.toContain("9999");
    expect(visible).not.toContain("No JS 888");
    expect(visible).toContain("Heading with 42");
    expect(visible).toContain("Result is 3.35 s → 18.83 s");
  });

  it("extracts integers, decimals, comma numbers, and zero-padded numbers", () => {
    const text = "Values: 1,212 and 18.83 and 3.35 and 45 to 60 s, 01, 02, 03, 04";
    const numbers = extractNumbers(text);
    expect(numbers).toContain("1,212");
    expect(numbers).toContain("18.83");
    expect(numbers).toContain("3.35");
    expect(numbers).toContain("45");
    expect(numbers).toContain("60");
    expect(numbers).toContain("01");
    expect(numbers).toContain("02");
    expect(numbers).toContain("03");
    expect(numbers).toContain("04");
  });

  it("passes checkBuiltHtmlNumbers on the built portfolio pages", () => {
    const { hasFailure, results } = checkBuiltHtmlNumbers();
    expect(hasFailure).toBe(false);
    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.missing).toEqual([]);
      expect(r.count).toBeGreaterThan(0);
    }
  });
});
