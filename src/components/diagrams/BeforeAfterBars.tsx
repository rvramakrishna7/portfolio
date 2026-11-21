export function BeforeAfterBars() {
  return (
    <figure className="case-diagram" aria-label="Strike adjustment timing comparison">
      {/* Desktop view: >= 640px */}
      <svg
        className="diag-desktop"
        role="img"
        aria-labelledby="before-after-title-d before-after-desc-d"
        viewBox="0 0 580 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="before-after-title-d">Strike adjustment time comparison</title>
        <desc id="before-after-desc-d">
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
        {/* Midpoint 52.5 s scaled bar: 357 px */}
        <rect
          x="105"
          y="28"
          width="357"
          height="30"
          rx="6"
          fill="var(--border)"
        />
        <text
          x="474"
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
        {/* Midpoint 2.5 s scaled bar: 357 * (2.5 / 52.5) = 17 px */}
        <rect
          x="105"
          y="82"
          width="17"
          height="30"
          rx="4"
          fill="var(--accent)"
        />
        <text
          x="132"
          y="102"
          fill="var(--accent)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          2 to 3 s
        </text>
      </svg>

      {/* Mobile view: < 640px with labels and values >= 12px */}
      <svg
        className="diag-mobile"
        role="img"
        aria-labelledby="before-after-title-m before-after-desc-m"
        viewBox="0 0 320 135"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="before-after-title-m">Strike adjustment time comparison (mobile view)</title>
        <desc id="before-after-desc-m">
          Simple before and after bars: 45 to 60 s manual versus 2 to 3 s automated, timed with a stopwatch.
        </desc>

        {/* Row 1: Manual */}
        <text
          x="10"
          y="24"
          fill="var(--text-2)"
          fontSize="14"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          Manual
        </text>
        {/* Midpoint 52.5 s scaled bar: 189 px */}
        <rect
          x="10"
          y="32"
          width="189"
          height="26"
          rx="5"
          fill="var(--border)"
        />
        <text
          x="212"
          y="50"
          fill="var(--text)"
          fontSize="14"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          45 to 60 s
        </text>

        {/* Row 2: Automated */}
        <text
          x="10"
          y="86"
          fill="var(--text-2)"
          fontSize="14"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          Automated
        </text>
        {/* Midpoint 2.5 s scaled bar: 189 * (2.5 / 52.5) = 9 px */}
        <rect
          x="10"
          y="94"
          width="9"
          height="26"
          rx="2"
          fill="var(--accent)"
        />
        <text
          x="28"
          y="112"
          fill="var(--accent)"
          fontSize="14"
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
