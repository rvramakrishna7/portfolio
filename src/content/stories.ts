export interface StoryResultRow {
  measure: string;
  value: string;
  howMeasured: string;
}

export interface StoryResult {
  value: string;
  label: string;
}

export interface StoryLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface StoryMetric {
  value: string;
  label: string;
}

export interface Story {
  number: string;
  slug: string;
  title: string;
  category: string;
  headline: string;
  problemShort: string;
  builtShort: string;
  metrics: readonly StoryMetric[];
  tags: readonly string[];
  live?: string;
  code: string;

  // Nine-part structure fields
  problem: string;
  whyItFellShort?: string;
  built: string;
  deterministicChecks?: readonly string[];
  decisions: readonly string[];
  reliability?: string;
  resultsTable: readonly StoryResultRow[];
  honestNote?: string;
  hardenNext?: readonly string[];
  hackathonNote?: string;
  diagram: "BeforeAfterBars" | "McpArchitecture" | "VouchPipeline" | "ZyncMediaFlow";
  diagramCaption: string;

  // Compatibility fields
  tag: string;
  hook: string;
  constraint: string;
  whatIDid: readonly string[];
  results: readonly StoryResult[];
  chips: readonly string[];
  liveUrl: string | null;
  codeUrl: string;
  links: readonly StoryLink[];
  seoTitle: string;
  seoDescription: string;
}

export const STORIES: readonly Story[] = [
  {
    number: "01",
    slug: "restart-options",
    title: "Restart Options",
    category: "Options trading automation",
    headline: "Turned a manual options adjustment into a 2 to 3 second workflow.",
    problemShort:
      "Stock markets run on timing. When prices move, a trader has to pick fresh strikes, check them against their rules and place the orders, and doing that manually usually takes a minute or more while the market keeps moving. Predefined strategy rules now choose the strikes automatically, so the adjustment takes 2 to 3 seconds.",
    builtShort:
      "Strategy rules pick the strikes. The trader confirms with one click, and a configured loss limit can trigger an automatic exit.",
    metrics: [
      {
        value: "1 min or more → 2 to 3 s",
        label: "Strike adjustment, manual versus automated.",
      },
      {
        value: "38",
        label: "REST endpoints with JWT login and owner and user roles.",
      },
    ],
    tags: ["React", "Node.js", "Express", "MongoDB", "WebSocket", "JWT"],
    live: "https://restartoptions.vercel.app",
    code: "https://github.com/rvramakrishna7/restart",

    // Nine-part story fields
    problem:
      "Stock markets are about timing, and a trade is only as good as the moment it is placed. Traders running straddles, strangles, iron flies, debit spreads and calendar spreads have to read the option chain, pick strikes, check them against their rules and place the orders. When the market moves they do it all again, and manually that usually takes a minute or more. Automating those predefined rules turned the same adjustment into a few seconds of work.",
    whyItFellShort:
      "Prices keep moving while the trader works through the steps, so a slow adjustment can miss the moment it was meant for.",
    built:
      "Strategy-specific rules that pick the strikes automatically, one-click execution of the adjustment, and automatic exits when a configured loss limit is reached. Five strategies: debit spread, straddle, strangle, iron fly and calendar spread. Both paper and live modes.",
    decisions: [
      "The rules for each strategy choose the strikes, so the trader confirms an adjustment instead of calculating it.",
      "Paper mode and live mode run the same workflow, so a strategy can be tried without real orders.",
      "Open positions and P&L are stored in MongoDB, so a server restart does not lose them.",
      "A short cooldown stops the same adjustment from firing twice in a row.",
    ],
    reliability:
      "When the internet drops, the live feed reconnects and re-subscribes every open position, so monitoring carries on by itself. After a restart, positions and P&L are loaded back from MongoDB. Access uses JWT login with owner and user roles across 38 REST endpoints.",
    resultsTable: [
      {
        measure: "Strike adjustment",
        value: "1 min or more manual, 2 to 3 s automated",
        howMeasured: "Strike adjustment timed before and after automation.",
      },
      {
        measure: "REST endpoints",
        value: "38",
        howMeasured: "Codebase audit, with JWT login and owner and user roles.",
      },
      {
        measure: "Lighthouse performance",
        value: "99",
        howMeasured: "Desktop preset. Measured 2026-11-19.",
      },
    ],
    honestNote:
      "This project automates execution. It does not predict markets, and I make no claim about trading returns.",
    diagram: "BeforeAfterBars",
    diagramCaption: "Manual versus automated adjustment",

    // Compatibility fields
    tag: "Options trading automation",
    hook: "Turned a manual options adjustment into a 2 to 3 second workflow.",
    constraint: "",
    whatIDid: [
      "The rules for each strategy choose the strikes, so the trader confirms an adjustment instead of calculating it.",
      "Paper mode and live mode run the same workflow, so a strategy can be tried without real orders.",
      "Open positions and P&L are stored in MongoDB, so a server restart does not lose them.",
      "A short cooldown stops the same adjustment from firing twice in a row.",
    ],
    results: [
      {
        value: "1 min or more → 2 to 3 s",
        label: "Strike adjustment, manual versus automated",
      },
      {
        value: "38",
        label: "REST endpoints, with JWT login and owner and user roles",
      },
      {
        value: "99",
        label: "Lighthouse performance score, desktop",
      },
    ],
    chips: ["React", "Node.js", "Express", "MongoDB", "WebSocket", "JWT"],
    liveUrl: "https://restartoptions.vercel.app",
    codeUrl: "https://github.com/rvramakrishna7/restart",
    links: [
      { label: "Read the story", href: "/work/restart-options" },
      {
        label: "Open the live site",
        href: "https://restartoptions.vercel.app",
        external: true,
      },
      {
        label: "See the code",
        href: "https://github.com/rvramakrishna7/restart",
        external: true,
      },
    ],
    seoTitle: "Restart Options: Manual options adjustment to 2 to 3 s | Ramakrishna",
    seoDescription:
      "Turned manual options adjustments from 1 min or more into a 2 to 3 second workflow with strategy rules, one-click execution, and 38 REST endpoints.",
  },
  {
    number: "02",
    slug: "mcp-gateway",
    title: "Team MCP Gateway",
    category: "Infrastructure, security and AI tool integration",
    headline: "One controlled entry point for a team's AI tools.",
    problemShort:
      "Teams adopting AI tools end up with every member setting up each MCP server alone, credentials scattered across laptops and no shared record of which tools get used. One gateway gives the team a single controlled entry point instead.",
    builtShort:
      "A gateway. An admin registers the servers once. Members connect through one URL and see only the tools their role allows. Upstream credentials stay encrypted on the gateway.",
    metrics: [
      {
        value: "22 ms",
        label:
          "Tool-list lookup with a deliberately slow upstream, served from the database cache.",
      },
      {
        value: "3",
        label: "MCP servers behind one login.",
      },
    ],
    tags: [
      "TypeScript",
      "React",
      "PostgreSQL",
      "Node.js",
      "MCP",
      "Docker",
      "Kubernetes",
      "Helm",
      "Groq",
    ],
    code: "https://github.com/rvramakrishna7/urumi-mcp-gateway",

    // Nine-part story fields
    problem:
      "A team using several MCP servers had every member configure each one separately. Credentials were scattered, access was hard to manage in one place, and nobody could see which tools were being used. A slow or broken upstream service also got in the way of people's work.",
    built:
      "A central MCP gateway. An admin registers the servers once. Members connect through a single gateway URL and use the tools their role allows. Upstream API credentials stay on the gateway, encrypted.",
    decisions: [
      "Tool discovery is served from a database-backed cache, so a slow upstream does not slow down listing tools.",
      "Tool access is restricted by role, with separate admin and member permissions.",
      "Upstream credentials are encrypted with AES-256-GCM. API keys are stored hashed. Passwords use Argon2id.",
    ],
    reliability:
      "Session security and CSRF protection, network policies, SSRF protection (the web-fetch server has a drill that tries loopback, private and cloud-metadata addresses and redirects to them), Helm deployments, local k3d and remote k3s, TLS with Let's Encrypt.",
    resultsTable: [
      {
        measure: "Tool-list lookup",
        value: "22 ms",
        howMeasured:
          "Lookup with a deliberately slow upstream, served from the database cache.",
      },
      {
        measure: "MCP servers",
        value: "3",
        howMeasured: "WooCommerce, currency exchange, web fetch behind one login.",
      },
      {
        measure: "Tool call audit",
        value: "Every call",
        howMeasured: "Written to a PostgreSQL audit log.",
      },
      {
        measure: "Automated tests",
        value: "1,212",
        howMeasured:
          "900 run without a database: 185 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers. 312 more gateway tests need PostgreSQL, which gives 1,212.",
      },
    ],
    hardenNext: [
      "A rate limit on the MCP endpoint",
      "Some network-policy and security-context work",
      "Rollback scenarios that I have not tested",
      "Recording every admin action in the database audit table",
    ],
    diagram: "McpArchitecture",
    diagramCaption:
      "Members, Groq agent and dashboard connect through the Gateway to three MCP servers, with PostgreSQL for keys, audit and cache.",

    // Compatibility fields
    tag: "Infrastructure, security and AI tool integration",
    hook: "One controlled entry point for a team's AI tools.",
    constraint: "",
    whatIDid: [
      "Tool discovery is served from a database-backed cache, so a slow upstream does not slow down listing tools.",
      "Tool access is restricted by role, with separate admin and member permissions.",
      "Upstream credentials are encrypted with AES-256-GCM. API keys are stored hashed. Passwords use Argon2id.",
      "Default-deny network policies, SSRF drill, and Helm deployments locally on k3d and on remote k3s.",
    ],
    results: [
      {
        value: "1,212",
        label: "Automated tests passing (900 without a database, 312 with PostgreSQL)",
      },
      {
        value: "3",
        label: "Tool servers behind one login",
      },
      {
        value: "22 ms",
        label: "Tool-list lookup with a slow upstream",
      },
    ],
    chips: [
      "TypeScript",
      "React",
      "PostgreSQL",
      "Node.js",
      "MCP",
      "Docker",
      "Kubernetes",
      "Helm",
      "Groq",
    ],
    liveUrl: null,
    codeUrl: "https://github.com/rvramakrishna7/urumi-mcp-gateway",
    links: [
      { label: "Read the story", href: "/work/mcp-gateway" },
      {
        label: "See the code",
        href: "https://github.com/rvramakrishna7/urumi-mcp-gateway",
        external: true,
      },
    ],
    seoTitle: "Team MCP Gateway: One controlled entry point for AI tools | Ramakrishna",
    seoDescription:
      "A central gateway for team MCP servers with role-based access, encrypted credentials, cached tool lookups in 22 ms, and 1,212 automated tests.",
  },
  {
    number: "03",
    slug: "vouch",
    title: "Vouch",
    category: "AI brand content verification",
    headline: "An AI reviewer shouldn't approve a claim without being able to prove it.",
    problemShort:
      'Brand teams live on claims like "keeps drinks cold for 48 hours", and one unsupported claim can reach customers. Generic AI tools will write a convincing citation that points to nothing, and a reviewer cannot tell. In Vouch the AI suggests, and backend code decides whether the evidence is real.',
    builtShort:
      "An evidence-first review system. The model suggests and analyses. Backend code checks every citation against approved, unexpired company facts before anything is shown.",
    metrics: [
      {
        value: "18.83 s → 3.35 s",
        label:
          "First review measurement, then the average of 10 optimised runs.",
      },
      {
        value: "10 of 10",
        label: "Runs where every claim was judged correctly (50 verdicts).",
      },
    ],
    tags: [
      "React 19",
      "TypeScript",
      "Vite",
      "Express",
      "PostgreSQL",
      "Supabase",
      "pgvector",
      "Groq",
      "Gemini",
      "Playwright",
    ],
    live: "https://vouch-app-beta.vercel.app",
    code: "https://github.com/rvramakrishna7/vouch",

    // Nine-part story fields
    problem:
      'Marketing teams publish claims such as "India\'s No. 1 sustainable smart water bottle", "keeps drinks cold for 48 hours" and "made from 100% recycled ocean plastic". A brand reviewer needs to know whether each claim is backed by an approved fact, whether that fact has expired, whether the claim contradicts product data, whether the wording breaks a brand rule, and who approved the final text.',
    whyItFellShort:
      "Generic AI writing tools can produce a plausible citation that is made up. Nothing checks it.",
    built:
      "An evidence-first brand content review system. The AI can suggest and analyse. Deterministic backend code validates the final evidence.",
    deterministicChecks: [
      "The citation points to a fact that was actually retrieved",
      "The quoted text exists in the source",
      "The approved fact has not expired",
      "Numeric claims agree",
      "Regulated terms cannot get a \"supported\" verdict without the required evidence",
    ],
    decisions: [
      "Brand Kit stores approved facts, their sources and expiry dates, and numbered brand rules.",
      "pgvector semantic search finds the facts relevant to each claim.",
      "Structured AI responses are validated with Zod, and suggested corrections are fact-checked before they are accepted, so a fix cannot add an unsupported claim, an expired fact or a banned term.",
      "Groq is the primary AI provider with Gemini as fallback.",
    ],
    reliability:
      "Creator, Reviewer and Brand Manager roles. Tenant isolation with PostgreSQL Row Level Security. An append-only audit log that blocks updates and deletes on audit rows. Performance timing is recorded per review.",
    resultsTable: [
      {
        measure: "AI review time",
        value: "18.83 s → 3.35 s",
        howMeasured:
          "The first number is one measurement before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct.",
      },
      {
        measure: "Claim verdict accuracy",
        value: "10 of 10",
        howMeasured: "Runs where every claim was judged correctly (50 verdicts).",
      },
      {
        measure: "Lighthouse performance",
        value: "98",
        howMeasured: "Desktop preset. Measured 2026-11-19.",
      },
      {
        measure: "Automated tests",
        value: "14 Playwright tests",
        howMeasured: "14 end-to-end Playwright tests, all passing, plus a run against the live app.",
      },
      {
        measure: "Cold-start launch",
        value: "931 ms",
        howMeasured: "Cold-start launch after 20 minutes idle, from my project status log.",
      },
    ],
    honestNote:
      "The model does not guarantee that a claim is true. The code checks the evidence it is given.",
    hackathonNote:
      "Built solo for the TechCircuit hackathon, on the Inkloom AI problem statement (brand-governance content review), as team RESTART CODE.",
    diagram: "VouchPipeline",
    diagramCaption:
      "Pipeline: Submitted content → Claim Ledger → AI suggested verdict → Deterministic checks → Approval → Audit trail",

    // Compatibility fields
    tag: "AI brand content verification",
    hook: "An AI reviewer shouldn't approve a claim without being able to prove it.",
    constraint: "",
    whatIDid: [
      "Brand Kit stores approved facts, their sources and expiry dates, and numbered brand rules.",
      "pgvector semantic search finds the facts relevant to each claim.",
      "Deterministic backend checks ensure every citation points to an active retrieved fact and quoted text matches.",
      "Structured AI responses are validated with Zod, with Groq as primary and Gemini as fallback.",
    ],
    results: [
      {
        value: "18.83 s → 3.35 s",
        label: "Review time, average of 10 runs",
      },
      {
        value: "10 of 10",
        label: "Runs with every claim judged correctly",
      },
      {
        value: "98",
        label: "Lighthouse performance score, desktop",
      },
    ],
    chips: [
      "React 19",
      "TypeScript",
      "Vite",
      "Express",
      "PostgreSQL",
      "Supabase",
      "pgvector",
      "Groq",
      "Gemini",
      "Playwright",
    ],
    liveUrl: "https://vouch-app-beta.vercel.app",
    codeUrl: "https://github.com/rvramakrishna7/vouch",
    links: [
      { label: "Read the story", href: "/work/vouch" },
      {
        label: "Open the live site",
        href: "https://vouch-app-beta.vercel.app",
        external: true,
      },
      {
        label: "See the code",
        href: "https://github.com/rvramakrishna7/vouch",
        external: true,
      },
    ],
    seoTitle: "Vouch: Evidence-first AI brand content verification | Ramakrishna",
    seoDescription:
      "An evidence-first review system checking citations against approved brand facts. Cut review time from 18.83 s to 3.35 s across 10 test runs.",
  },
  {
    number: "04",
    slug: "zync",
    title: "Zync",
    category: "Real-time video meetings with AI notes",
    headline: "People came to meetings to participate, not to write minutes.",
    problemShort:
      "A good meeting needs everyone listening, yet someone always ends up typing notes and missing the conversation, and decisions still slip through. Zync writes the notes when the call ends, and the summary is on screen in under 3 seconds.",
    builtShort:
      "A video meeting app that writes the notes when the call ends: key points, decisions and action items.",
    metrics: [
      {
        value: "Under 3 s",
        label: "From call end to summary on screen.",
      },
      {
        value: "100",
        label: "Lighthouse performance, desktop (LCP 0.3 s).",
      },
    ],
    tags: [
      "React",
      "Socket.io",
      "WebRTC",
      "MongoDB",
      "Groq",
      "Llama 3.3 70B",
    ],
    live: "https://zync-video-conferencing.vercel.app",
    code: "https://github.com/rvramakrishna7/zync-video-conferencing",

    // Nine-part story fields
    problem:
      "In an online meeting, people take notes while they listen and speak. Important decisions and action items get missed.",
    whyItFellShort:
      "Notes are either missing or wrong, and the person taking them is not fully part of the conversation.",
    built:
      "A video meeting app that writes the notes when the call ends. The summary lists key points, decisions and action items and appears within about 3 seconds in my own timing. It also has real-time chat, reactions, raise hand, JWT login and Google login.",
    decisions: [
      "Audio and video go peer to peer over WebRTC. The application server only handles signalling, which means it only helps participants find and connect to each other. The media does not pass through it. That keeps the server small. I make no scale claims.",
      "Groq with Llama 3.3 70B writes the summary.",
    ],
    resultsTable: [
      {
        measure: "Call end to summary",
        value: "Under 3 s",
        howMeasured:
          "Timed manually from the end of the call to the summary on screen.",
      },
      {
        measure: "Lighthouse performance",
        value: "100",
        howMeasured: "Desktop preset. Measured 2026-11-19.",
      },
      {
        measure: "Largest contentful paint",
        value: "0.3 s",
        howMeasured: "Desktop preset measurement.",
      },
    ],
    diagram: "ZyncMediaFlow",
    diagramCaption:
      "Peer-to-peer WebRTC media with Socket.io signalling",

    // Compatibility fields
    tag: "Real-time video meetings with AI notes",
    hook: "People came to meetings to participate, not to write minutes.",
    constraint: "",
    whatIDid: [
      "Video and audio go peer to peer over WebRTC. The server only passes the signals that connect people.",
      "When a call ends, Groq Llama 3.3 70B turns the meeting into key points, action items and decisions.",
      "Added chat, reactions, raise hand, JWT login and Google login.",
    ],
    results: [
      {
        value: "Under 3 s",
        label: "From call end to summary on screen.",
      },
      {
        value: "100",
        label: "Lighthouse performance score, desktop",
      },
      {
        value: "0.3 s",
        label: "Largest contentful paint",
      },
    ],
    chips: ["React", "Socket.io", "WebRTC", "MongoDB", "Groq"],
    liveUrl: "https://zync-video-conferencing.vercel.app",
    codeUrl: "https://github.com/rvramakrishna7/zync-video-conferencing",
    links: [
      { label: "Read the story", href: "/work/zync" },
      {
        label: "Open the live site",
        href: "https://zync-video-conferencing.vercel.app",
        external: true,
      },
      {
        label: "See the code",
        href: "https://github.com/rvramakrishna7/zync-video-conferencing",
        external: true,
      },
    ],
    seoTitle: "Zync: Peer-to-peer video meetings with AI notes | Ramakrishna",
    seoDescription:
      "Peer-to-peer WebRTC video meetings that generate action items, decisions and key points in under 3 seconds after call end. Desktop Lighthouse 100.",
  },
];
