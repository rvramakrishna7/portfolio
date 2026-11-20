export interface StoryResult {
  value: string;
  label: string;
}

export interface StoryLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface Story {
  number: string;
  slug: string;
  title: string;
  tag: string;
  hook: string;
  problem: string;
  constraint: string;
  whatIDid: readonly string[];
  results: readonly StoryResult[];
  chips: readonly string[];
  liveUrl: string | null;
  codeUrl: string;
  links: readonly StoryLink[];
  seoDescription: string;
}

export const STORIES: readonly Story[] = [
  {
    number: "01",
    slug: "restart-options",
    title: "Restart Options",
    tag: "Options trading automation",
    hook: "Traders moved strikes by hand. Each shift took a minute while the market kept moving.",
    problem:
      "Options traders shifted strikes by hand. Each shift took 45 to 60 seconds, and the market kept moving the whole time.",
    constraint:
      "Market data comes over a live feed that can drop. If the feed or the server restarts, open positions must not be lost or forgotten.",
    whatIDid: [
      "Automated adjustments and exits for 5 NIFTY and BANKNIFTY strategies: debit spread, straddle, strangle, iron fly and calendar spread. Each runs in paper mode and live mode.",
      "When the internet drops, the live feed reconnects and re-subscribes every open position, so monitoring carries on by itself.",
      "After a server restart, open positions and P&L come back from MongoDB.",
      "Added a short cooldown between adjustments, so the same adjustment does not fire twice in a row.",
    ],
    results: [
      {
        value: "45–60 s → 2–3 s",
        label: "Strike shifting time (timed by hand)",
      },
      {
        value: "38",
        label: "REST endpoints, with JWT login and owner/user roles",
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
      { label: "Read the full story", href: "/work/restart-options" },
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
    seoDescription:
      "How I took options strike shifting from 45 to 60 seconds by hand to 2 to 3 seconds, with a trading platform that survives network drops and restarts.",
  },
  {
    number: "02",
    slug: "zync",
    title: "Zync",
    tag: "Video meetings that write their own notes",
    hook: "Nobody wants to take notes in a meeting. So the meeting writes them.",
    problem:
      "In most meetings, someone has to take notes, and the notes are either missing or wrong.",
    constraint:
      "Video is heavy. The server had to stay small, so video should never pass through it.",
    whatIDid: [
      "Video and audio go peer to peer over WebRTC. The server only passes the signals that connect people.",
      "When a call ends, Groq Llama 3.3 70B turns the meeting into key points, action items and decisions.",
      "Added chat, reactions, raise hand, JWT login and Google login.",
    ],
    results: [
      {
        value: "under 3 s",
        label: "From call end to summary on screen (timed by hand)",
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
      { label: "Read the full story", href: "/work/zync" },
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
    seoDescription:
      "A peer-to-peer video meeting app that writes the meeting summary within 3 seconds of the call ending. Lighthouse 100.",
  },
  {
    number: "03",
    slug: "vouch",
    title: "Vouch",
    tag: "Checking marketing claims against a brand's own facts",
    hook: "AI checkers love to invent citations. This one is not allowed to.",
    problem:
      'Brand teams publish claims like "India\'s No.1" or "keeps drinks cold for 48 hours". Generic AI checkers fix the tone, but they cannot say which approved fact proves a claim, and they make up citations.',
    constraint:
      "Built alone for a hackathon, on free tiers. The AI had to be fast, and it had to be checkable.",
    whatIDid: [
      "The AI only suggests. Code checks every citation against the brand's approved facts and rules before anything is shown.",
      "Moved the main AI call to Groq, with Gemini as an automatic fallback when Groq is slow or rate-limited.",
      "Wrote 100 server tests and 14 end-to-end Playwright tests, plus a run against the live app with the real AI.",
    ],
    results: [
      {
        value: "18.8 s → 3.35 s",
        label: "Review time, average of 10 runs",
      },
      {
        value: "10 / 10",
        label: "Runs with every claim judged correctly",
      },
      {
        value: "98",
        label: "Lighthouse performance score, desktop",
      },
    ],
    chips: ["React", "Express", "PostgreSQL", "Groq", "Gemini", "Playwright"],
    liveUrl: "https://vouch-app-beta.vercel.app",
    codeUrl: "https://github.com/rvramakrishna7/vouch",
    links: [
      { label: "Read the full story", href: "/work/vouch" },
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
    seoDescription:
      "An AI reviewer that checks marketing claims against approved facts, where code validates every citation. Review time cut from 18.8 s to 3.35 s.",
  },
  {
    number: "04",
    slug: "mcp-gateway",
    title: "Team MCP Gateway",
    tag: "One secure front door for AI tools",
    hook: "When an AI agent can touch a real store, someone has to keep a record of every move.",
    problem:
      "AI agents that call tools touching real stores need rules: who may call what, and a record of every call.",
    constraint:
      "It had to run the same way on a laptop cluster and on a small rented server with TLS, and it could not trust anything on the network by default.",
    whatIDid: [
      "Put 3 MCP servers (WooCommerce, currency rates, web fetch) behind one gateway, with a React dashboard and a Groq chat agent.",
      "Deployed with Helm, locally on k3d and on a k3s server with TLS.",
      "Default-deny network policies, and stored credentials encrypted with AES-256-GCM.",
      "The web-fetch server comes with an SSRF drill that tries loopback, private and cloud-metadata addresses, and redirects to them.",
    ],
    results: [
      {
        value: "1,212",
        label: "Automated tests, all passing (run on 2026-11-19)",
      },
      {
        value: "3",
        label: "Tool servers behind one login",
      },
      {
        value: "Every call",
        label: "Written to an audit log",
      },
    ],
    chips: ["Kubernetes", "Helm", "TypeScript", "React", "PostgreSQL", "Groq"],
    liveUrl: null,
    codeUrl: "https://github.com/rvramakrishna7/urumi-mcp-gateway",
    links: [
      { label: "Read the full story", href: "/work/mcp-gateway" },
      {
        label: "See the code",
        href: "https://github.com/rvramakrishna7/urumi-mcp-gateway",
        external: true,
      },
    ],
    seoDescription:
      "A Kubernetes gateway that puts three AI tool servers behind one login with an audit log. 1,212 automated tests, all passing.",
  },
];
