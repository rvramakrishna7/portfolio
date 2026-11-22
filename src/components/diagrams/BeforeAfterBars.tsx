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
          Simple before and after bars: 1 min or more manual versus 2 to 3 s automated.
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
        {/* Scaled 60 s manual bar: 360 px */}
        <rect
          x="105"
          y="28"
          width="360"
          height="30"
          rx="6"
          fill="var(--border)"
        />
        <text
          x="475"
          y="48"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          1 min or more
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
        {/* Scaled 2.5 s automated bar: 360 * (2.5 / 60) = 15 px */}
        <rect
          x="105"
          y="82"
          width="15"
          height="30"
          rx="4"
          fill="var(--accent)"
        />
        <text
          x="130"
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
          Simple before and after bars: 1 min or more manual versus 2 to 3 s automated.
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
        {/* Scaled 60 s manual bar: 192 px */}
        <rect
          x="10"
          y="32"
          width="192"
          height="26"
          rx="5"
          fill="var(--border)"
        />
        <text
          x="210"
          y="50"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          1 min or more
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
        {/* Scaled 2.5 s automated bar: 192 * (2.5 / 60) = 8 px */}
        <rect
          x="10"
          y="94"
          width="8"
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

      <figcaption>Manual versus automated adjustment</figcaption>
    </figure>
  );
}
