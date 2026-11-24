import { getSiteUrl } from "../lib/site";

export interface CandidateProject {
  id: string;
  name: string;
  category: string;
  summary: string;
  metrics: string[];
  skills: string[];
}

export interface CandidateProfile {
  name: string;
  degree: string;
  targetRoles: string;
  portfolioUrl: string;
  linkedinUrl: string;
  projects: CandidateProject[];
}

export const ALLOWED_CANDIDATE_NUMBERS = new Set([
  "2026",
  "38",
  "1",
  "2",
  "3",
  "1212",
  "1,212",
  "22",
  "18.83",
  "3.35",
  "10",
  "931",
  "14",
  "100",
  "50",
]);

export function getCandidateProfile(): CandidateProfile {
  return {
    name: "Ramakrishna",
    degree: "BS Computer Science, BITS Pilani (graduating 2026)",
    targetRoles: "AI-focused full-stack and automation roles, remote, entry level",
    portfolioUrl: getSiteUrl(),
    linkedinUrl: "https://www.linkedin.com/in/rvramakrishna",
    projects: [
      {
        id: "restart-options",
        name: "Restart Options",
        category: "Options trading automation",
        summary: "Turned a manual options strike adjustment into a 2 to 3 second workflow with strategy rules.",
        metrics: [
          "38 REST endpoints",
          "1 min or more to 2 to 3 s strike adjustment",
        ],
        skills: ["TypeScript", "React", "Next.js", "Node.js", "Express", "MongoDB", "WebSocket", "JWT"],
      },
      {
        id: "mcp-gateway",
        name: "Team MCP Gateway",
        category: "Infrastructure and AI tool integration",
        summary: "One controlled entry point for a team's AI tools with role-based access and database cache.",
        metrics: [
          "1,212 automated tests",
          "22 ms lookup cache",
          "3 MCP servers behind one login",
        ],
        skills: ["TypeScript", "React", "PostgreSQL", "Node.js", "MCP", "Docker", "Kubernetes", "Helm", "Groq"],
      },
      {
        id: "vouch",
        name: "Vouch",
        category: "AI brand content verification",
        summary: "Evidence-first AI review system where backend code validates citations against approved company facts.",
        metrics: [
          "18.83 s to 3.35 s AI review time",
          "10 of 10 runs correct with all 50 verdicts accurate",
          "931 ms cold start",
          "14 Playwright tests",
        ],
        skills: ["React", "TypeScript", "Vite", "Express", "PostgreSQL", "Supabase", "pgvector", "Groq", "Gemini", "Playwright"],
      },
      {
        id: "zync",
        name: "Zync",
        category: "Real-time video meetings with AI notes",
        summary: "Video meeting application that summarizes calls into key points, decisions and action items.",
        metrics: [
          "Under 3 s summary on screen after call ends",
          "100 Lighthouse desktop score",
        ],
        skills: ["React", "Socket.io", "WebRTC", "MongoDB", "Groq", "Node.js"],
      },
    ],
  };
}
