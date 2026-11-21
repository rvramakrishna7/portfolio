export function BeforeAfterBars() {
  return (
    <figure className="case-diagram" aria-label="Strike adjustment timing comparison">
      <svg
        role="img"
        aria-labelledby="before-after-title before-after-desc"
        viewBox="0 0 560 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="before-after-title">Strike adjustment time comparison</title>
        <desc id="before-after-desc">
          Simple before and after bars: 45 to 60 s manual versus 2 to 3 s automated, timed with a stopwatch.
        </desc>

        {/* Row 1: Manual */}
        <text
          x="12"
          y="48"
          fill="var(--text-2)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          Manual
        </text>
        {/* Midpoint 52.5 s scaled bar */}
        <rect
          x="105"
          y="28"
          width="378"
          height="30"
          rx="6"
          fill="var(--border)"
        />
        <text
          x="494"
          y="48"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          45 to 60 s
        </text>

        {/* Row 2: Automated */}
        <text
          x="12"
          y="102"
          fill="var(--text-2)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          Automated
        </text>
        {/* Midpoint 2.5 s scaled bar: 378 * (2.5 / 52.5) = 18 px */}
        <rect
          x="105"
          y="82"
          width="18"
          height="30"
          rx="4"
          fill="var(--accent)"
        />
        <text
          x="133"
          y="102"
          fill="var(--accent)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          2 to 3 s
        </text>
      </svg>
      <figcaption>Timed with a stopwatch</figcaption>
    </figure>
  );
}
