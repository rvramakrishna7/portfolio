export function ZyncMediaFlow() {
  return (
    <figure
      className="case-diagram"
      aria-label="Zync media flow diagram"
    >
      <svg
        role="img"
        aria-labelledby="zync-diag-title zync-diag-desc"
        viewBox="0 0 600 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="zync-diag-title">Zync peer-to-peer media flow</title>
        <desc id="zync-diag-desc">
          Participants connected to each other by WebRTC (audio, video), and each connected to the signalling server (Socket.io) with a thin line. The thick line represents media and the thin line represents signals only.
        </desc>

        {/* Signalling Server (Top Center) */}
        <rect
          x="200"
          y="15"
          width="200"
          height="50"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="300"
          y="38"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Signalling server
        </text>
        <text
          x="300"
          y="54"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          (Socket.io)
        </text>

        {/* Participant 1 (Bottom Left) */}
        <rect
          x="40"
          y="125"
          width="150"
          height="55"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="115"
          y="157"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Participant A
        </text>

        {/* Participant 2 (Bottom Right) */}
        <rect
          x="410"
          y="125"
          width="150"
          height="55"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="485"
          y="157"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="13"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          Participant B
        </text>

        {/* Thin lines: signals only */}
        <path
          d="M 115 125 L 230 65"
          stroke="var(--border)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 485 125 L 370 65"
          stroke="var(--border)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text
          x="145"
          y="90"
          fill="var(--text-2)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          signals only
        </text>
        <text
          x="385"
          y="90"
          fill="var(--text-2)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          signals only
        </text>

        {/* Thick line: media */}
        <line
          x1="190"
          y1="152"
          x2="410"
          y2="152"
          stroke="var(--accent)"
          strokeWidth="4"
        />
        {/* Label on media line */}
        <rect
          x="230"
          y="140"
          width="140"
          height="24"
          rx="4"
          fill="var(--card)"
          stroke="var(--accent)"
          strokeWidth="1"
        />
        <text
          x="300"
          y="156"
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="11"
          fontFamily="var(--mono)"
          fontWeight="600"
        >
          media (audio, video)
        </text>
      </svg>
      <figcaption>
        Participants connect directly peer to peer for media; signalling server handles connection setup only.
      </figcaption>
    </figure>
  );
}
