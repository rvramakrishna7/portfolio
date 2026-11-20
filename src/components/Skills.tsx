const SKILL_GROUPS = [
  {
    category: "Languages",
    skills: "JavaScript, TypeScript, Python, SQL, HTML, CSS",
  },
  {
    category: "Frontend and backend",
    skills:
      "React, Next.js, Vite, Node.js, Express, FastAPI, Tailwind CSS, REST, JWT",
  },
  {
    category: "Real-time and AI",
    skills:
      "WebSocket, Socket.io, WebRTC, Vapi, Telnyx, Cal.com API, Groq, Gemini, Claude API, MCP, LLM tool calling, webhooks",
  },
  {
    category: "Data and DevOps",
    skills:
      "MongoDB, PostgreSQL (Supabase, pgvector), Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Render, Git",
  },
  {
    category: "Testing",
    skills: "pytest, Jest, Vitest, Playwright, Postman, ESLint",
  },
] as const;

export function Skills() {
  return (
    <section className="block skills" id="skills" aria-labelledby="skills-title">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">Skills</p>
          <h2 id="skills-title">What I work with.</h2>
          <p>
            I use AI coding tools (Claude, Google Antigravity and ChatGPT), and I
            read, review and test everything they write before it ships.
          </p>
        </div>

        <dl aria-label="Skills categories">
          {SKILL_GROUPS.map((group) => (
            <div className="row" key={group.category}>
              <dt>{group.category}</dt>
              <dd>{group.skills}</dd>
            </div>
          ))}
        </dl>

        <div className="edu">
          <div>
            <p className="eyebrow">Education</p>
            <p>
              <strong>BSc in Computer Science</strong>, BITS Pilani. Graduated
              2026.
            </p>
          </div>
          <div>
            <p className="eyebrow">Certifications</p>
            <p>
              NISM Series VIII: Equity Derivatives (SEBI). Meta Backend Developer
              Professional Certificate. Google IT Automation with Python.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
