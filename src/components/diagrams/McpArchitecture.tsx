export function McpArchitecture() {
  return (
    <figure
      className="case-diagram"
      aria-label="Team MCP Gateway architecture diagram"
    >
      <svg
        role="img"
        aria-labelledby="mcp-diag-title mcp-diag-desc"
        viewBox="0 0 760 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="mcp-diag-title">Team MCP Gateway architecture</title>
        <desc id="mcp-diag-desc">
          Members and the Groq chat agent and the React admin dashboard, then the Gateway (authentication, role-based tool filter, audit log, health checks, cached tool lists), then three MCP servers (WooCommerce, currency exchange, web fetch). PostgreSQL sits beside the gateway for keys, audit and the tool cache.
        </desc>

        {/* 1. Left Tier: Clients */}
        <g id="clients">
          <rect
            x="12"
            y="20"
            width="170"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="97"
            y="50"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            Members
          </text>

          <rect
            x="12"
            y="85"
            width="170"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="97"
            y="115"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            Groq chat agent
          </text>

          <rect
            x="12"
            y="150"
            width="170"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="97"
            y="180"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            React admin dashboard
          </text>
        </g>

        {/* Connectors Left -> Gateway */}
        <path
          d="M 182 45 L 250 110"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path
          d="M 182 110 L 250 110"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path
          d="M 182 175 L 250 110"
          stroke="var(--border)"
          strokeWidth="1.5"
        />

        {/* 2. Center Tier: Gateway */}
        <rect
          x="250"
          y="15"
          width="240"
          height="190"
          rx="10"
          fill="var(--card)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x="370"
          y="42"
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="14"
          fontFamily="var(--mono)"
          fontWeight="650"
        >
          Gateway
        </text>

        <g fontSize="11" fontFamily="var(--mono)" fill="var(--text-2)">
          <rect
            x="266"
            y="54"
            width="208"
            height="22"
            rx="4"
            fill="var(--bg)"
          />
          <text x="370" y="69" textAnchor="middle">
            authentication
          </text>

          <rect
            x="266"
            y="81"
            width="208"
            height="22"
            rx="4"
            fill="var(--bg)"
          />
          <text x="370" y="96" textAnchor="middle">
            role-based tool filter
          </text>

          <rect
            x="266"
            y="108"
            width="208"
            height="22"
            rx="4"
            fill="var(--bg)"
          />
          <text x="370" y="123" textAnchor="middle">
            audit log
          </text>

          <rect
            x="266"
            y="135"
            width="208"
            height="22"
            rx="4"
            fill="var(--bg)"
          />
          <text x="370" y="150" textAnchor="middle">
            health checks
          </text>

          <rect
            x="266"
            y="162"
            width="208"
            height="22"
            rx="4"
            fill="var(--bg)"
          />
          <text x="370" y="177" textAnchor="middle">
            cached tool lists
          </text>
        </g>

        {/* PostgreSQL beside gateway (below gateway) */}
        <path
          d="M 370 205 L 370 220"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <rect
          x="250"
          y="220"
          width="240"
          height="46"
          rx="8"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <text
          x="370"
          y="240"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="12"
          fontFamily="var(--sans)"
          fontWeight="600"
        >
          PostgreSQL
        </text>
        <text
          x="370"
          y="256"
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          keys, audit, tool cache
        </text>

        {/* Connectors Gateway -> MCP Servers */}
        <path
          d="M 490 110 L 558 45"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path
          d="M 490 110 L 558 110"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path
          d="M 490 110 L 558 175"
          stroke="var(--border)"
          strokeWidth="1.5"
        />

        {/* 3. Right Tier: 3 MCP Servers */}
        <g id="servers">
          <rect
            x="558"
            y="20"
            width="190"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="653"
            y="50"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            WooCommerce server
          </text>

          <rect
            x="558"
            y="85"
            width="190"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="653"
            y="115"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            Currency exchange server
          </text>

          <rect
            x="558"
            y="150"
            width="190"
            height="50"
            rx="8"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x="653"
            y="180"
            textAnchor="middle"
            fill="var(--text)"
            fontSize="13"
            fontFamily="var(--sans)"
            fontWeight="600"
          >
            Web fetch server
          </text>
        </g>
      </svg>
      <figcaption>
        Members, Groq agent and dashboard connect through the Gateway to three MCP servers, with PostgreSQL for keys, audit and cache.
      </figcaption>
    </figure>
  );
}
