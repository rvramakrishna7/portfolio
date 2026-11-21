const SKILL_GROUPS = [
  {
    category: "Languages",
    skills: "JavaScript, TypeScript, Python, SQL, HTML, CSS",
  },
  {
    category: "Frontend",
    skills: "React, Next.js, Vite, Tailwind CSS",
  },
  {
    category: "Backend",
    skills: "Node.js, Express, FastAPI, REST APIs, JWT",
  },
  {
    category: "Real-time systems",
    skills: "WebSocket, Socket.io, WebRTC, webhooks",
  },
  {
    category: "AI and integrations",
    skills:
      "Claude API, Groq, Gemini, Vapi, Telnyx, Cal.com API, MCP, pgvector, LLM tool calling",
  },
  {
    category: "Databases",
    skills: "MongoDB, PostgreSQL, Supabase",
  },
  {
    category: "Infrastructure",
    skills:
      "Docker, Kubernetes, Helm, Cloudflare Workers, Render, Vercel, Git",
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
          <p className="eyebrow">Engineering capabilities</p>
          <h2 id="skills-title">What I work with</h2>
        </div>

        <dl aria-label="Skills categories">
          {SKILL_GROUPS.map((group) => (
            <div className="row" key={group.category}>
              <dt>{group.category}</dt>
              <dd>{group.skills}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
