export function VouchPipeline() {
  return (
    <figure
      className="case-diagram"
      aria-label="Vouch evidence-first review pipeline diagram"
    >
      {/* Desktop view: >= 640px horizontal pipeline */}
      <svg
        className="diag-desktop"
        role="img"
        aria-labelledby="vouch-diag-title-d vouch-diag-desc-d"
        viewBox="0 0 860 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="vouch-diag-title-d">Vouch evidence-first review pipeline</title>
        <desc id="vouch-diag-desc-d">
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

      {/* Mobile view: < 640px vertical stacked pipeline with down arrows */}
      <svg
        className="diag-mobile"
        role="img"
        aria-labelledby="vouch-diag-title-m vouch-diag-desc-m"
        viewBox="0 0 320 490"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="vouch-diag-title-m">Vouch evidence-first review pipeline (mobile view)</title>
        <desc id="vouch-diag-desc-m">
          Pipeline (vertical flow): Submitted content, Claim Ledger (extract claims, retrieve approved facts with pgvector), AI suggests a verdict and citation, Deterministic checks, Approval, Audit trail.
        </desc>

        {/* Stage 1 */}
        <rect
          x="20"
          y="15"
          width="280"
          height="50"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="160"
          y="46"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Submitted content
        </text>

        {/* Arrow 1 -> 2 */}
        <path d="M 160 65 L 160 81" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="156,79 160,85 164,79" fill="var(--border)" />

        {/* Stage 2 */}
        <rect
          x="20"
          y="85"
          width="280"
          height="88"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="160"
          y="112"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="650"
        >
          Claim Ledger
        </text>
        <text
          x="160"
          y="136"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="14"
          fontFamily="var(--mono)"
        >
          extract claims, retrieve approved facts
        </text>
        <text
          x="160"
          y="156"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="14"
          fontFamily="var(--mono)"
        >
          with pgvector
        </text>

        {/* Arrow 2 -> 3 */}
        <path d="M 160 173 L 160 189" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="156,187 160,193 164,187" fill="var(--border)" />

        {/* Stage 3 */}
        <rect
          x="20"
          y="193"
          width="280"
          height="66"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="160"
          y="220"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          AI suggests
        </text>
        <text
          x="160"
          y="244"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="14"
          fontFamily="var(--mono)"
        >
          verdict and citation
        </text>

        {/* Arrow 3 -> 4 */}
        <path d="M 160 259 L 160 275" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="156,273 160,279 164,273" fill="var(--border)" />

        {/* Stage 4 */}
        <rect
          x="20"
          y="279"
          width="280"
          height="52"
          rx="8"
          fill="var(--card)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x="160"
          y="311"
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="650"
        >
          Deterministic checks
        </text>

        {/* Arrow 4 -> 5 */}
        <path d="M 160 331 L 160 347" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="156,345 160,351 164,345" fill="var(--border)" />

        {/* Stage 5 */}
        <rect
          x="20"
          y="351"
          width="280"
          height="48"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="160"
          y="381"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Approval
        </text>

        {/* Arrow 5 -> 6 */}
        <path d="M 160 399 L 160 415" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="156,413 160,419 164,413" fill="var(--border)" />

        {/* Stage 6 */}
        <rect
          x="20"
          y="419"
          width="280"
          height="48"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="160"
          y="449"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="15"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Audit trail
        </text>
      </svg>

      <figcaption>
        Pipeline: Submitted content → Claim Ledger → AI suggested verdict → Deterministic checks → Approval → Audit trail
      </figcaption>
    </figure>
  );
}
