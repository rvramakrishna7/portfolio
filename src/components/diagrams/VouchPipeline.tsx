export function VouchPipeline() {
  return (
    <figure
      className="case-diagram"
      aria-label="Vouch evidence-first review pipeline diagram"
    >
      <svg
        role="img"
        aria-labelledby="vouch-diag-title vouch-diag-desc"
        viewBox="0 0 860 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="vouch-diag-title">Vouch evidence-first review pipeline</title>
        <desc id="vouch-diag-desc">
          Pipeline (diagram, left to right): Submitted content, Claim Ledger (extract claims, retrieve approved facts with pgvector), AI suggests a verdict and citation, Deterministic checks, Approval, Audit trail.
        </desc>

        {/* Stage 1 */}
        <rect
          x="10"
          y="30"
          width="115"
          height="75"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="67"
          y="64"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Submitted
        </text>
        <text
          x="67"
          y="80"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          content
        </text>

        {/* Arrow 1 -> 2 */}
        <path d="M 125 67 L 145 67" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="143,64 148,67 143,70" fill="var(--border)" />

        {/* Stage 2 */}
        <rect
          x="148"
          y="20"
          width="170"
          height="95"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="233"
          y="48"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="650"
        >
          Claim Ledger
        </text>
        <text
          x="233"
          y="70"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          extract claims
        </text>
        <text
          x="233"
          y="88"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          retrieve approved facts
        </text>
        <text
          x="233"
          y="102"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          with pgvector
        </text>

        {/* Arrow 2 -> 3 */}
        <path d="M 318 67 L 338 67" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="336,64 341,67 336,70" fill="var(--border)" />

        {/* Stage 3 */}
        <rect
          x="341"
          y="25"
          width="145"
          height="85"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="413"
          y="56"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          AI suggests
        </text>
        <text
          x="413"
          y="74"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          verdict and
        </text>
        <text
          x="413"
          y="90"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          citation
        </text>

        {/* Arrow 3 -> 4 */}
        <path d="M 486 67 L 506 67" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="504,64 509,67 504,70" fill="var(--border)" />

        {/* Stage 4 */}
        <rect
          x="509"
          y="25"
          width="135"
          height="85"
          rx="8"
          fill="var(--card)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x="576"
          y="60"
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="650"
        >
          Deterministic
        </text>
        <text
          x="576"
          y="78"
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="650"
        >
          checks
        </text>

        {/* Arrow 4 -> 5 */}
        <path d="M 644 67 L 664 67" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="662,64 667,67 662,70" fill="var(--border)" />

        {/* Stage 5 */}
        <rect
          x="667"
          y="30"
          width="85"
          height="75"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="709"
          y="72"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Approval
        </text>

        {/* Arrow 5 -> 6 */}
        <path d="M 752 67 L 772 67" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="770,64 775,67 770,70" fill="var(--border)" />

        {/* Stage 6 */}
        <rect
          x="775"
          y="30"
          width="75"
          height="75"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="812"
          y="64"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Audit
        </text>
        <text
          x="812"
          y="80"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          trail
        </text>
      </svg>
      <figcaption>
        Pipeline: Submitted content → Claim Ledger → AI suggested verdict → Deterministic checks → Approval → Audit trail
      </figcaption>
    </figure>
  );
}
