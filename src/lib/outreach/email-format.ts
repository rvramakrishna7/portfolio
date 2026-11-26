import { getCandidateProfile } from "../../config/candidate-profile";

// Builds the plain text and HTML versions of an outreach email.
// The draft body stays exactly as approved. Around it we add a short "selected work" block and a signature,
// all taken from the candidate profile, so nothing here is invented.
// The HTML is deliberately simple (no images, no tracking pixel, no buttons): plain looking mail lands in inboxes more often.

const GITHUB_PROFILE = "https://github.com/rvramakrishna7";

const PROJECT_LINKS: Record<string, string> = {
  "restart-options": "https://github.com/rvramakrishna7/restart",
  "mcp-gateway": "https://github.com/rvramakrishna7/urumi-mcp-gateway",
  vouch: "https://github.com/rvramakrishna7/vouch",
};

const OPT_OUT = "If this is not relevant, just reply and I will not write again.";

export interface EmailParts {
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape, then turn http(s) links into anchors. Trailing punctuation stays outside the link.
function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const trail = url.match(/[.,;:!?)]+$/)?.[0] ?? "";
    const clean = trail ? url.slice(0, -trail.length) : url;
    return `<a href="${clean}" style="color:#1a56db">${clean}</a>${trail}`;
  });
}

function bodyToHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px">${linkify(escapeHtml(para)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// A small round badge with a symbol, followed by the label. Plain HTML, so it works in every mail client (no images, no SVG).
function iconLink(url: string, symbol: string, label: string): string {
  return (
    `<a href="${url}" style="display:inline-block;margin:0 14px 6px 0;color:#374151;font-size:13px;text-decoration:none">` +
    `<span style="display:inline-block;width:22px;height:22px;line-height:22px;margin-right:6px;border-radius:11px;background:#111827;color:#ffffff;text-align:center;font-size:11px;font-weight:700;font-family:Arial,Helvetica,sans-serif;vertical-align:middle">${symbol}</span>` +
    `<span style="vertical-align:middle">${label}</span></a>`
  );
}

export function buildEmailParts(body: string): EmailParts {
  const profile = getCandidateProfile();
  // Never put a localhost address in a real email (it is broken for the reader and looks suspicious).
  const configured = profile.portfolioUrl.replace(/\/+$/, "");
  const portfolio = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(configured) ? "https://rramakrishna.vercel.app" : configured;
  const projects = profile.projects
    .filter((p) => PROJECT_LINKS[p.id])
    .map((p) => ({ name: p.name, summary: p.summary, metrics: p.metrics, url: PROJECT_LINKS[p.id] }));

  const textLines = [body.trim(), ""];
  if (projects.length) {
    textLines.push("Selected work:");
    for (const p of projects) textLines.push(`- ${p.name}: ${p.summary} ${p.url}`);
    textLines.push("");
  }
  textLines.push(OPT_OUT, "", profile.name, `Portfolio: ${portfolio}`, `LinkedIn: ${profile.linkedinUrl}`, `GitHub: ${GITHUB_PROFILE}`);
  const text = textLines.join("\n");

  const chip = (m: string) =>
    `<span style="display:inline-block;margin:6px 6px 0 0;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;line-height:18px">${escapeHtml(m)}</span>`;

  const workHtml = projects.length
    ? `<tr><td style="padding:8px 32px 0"><div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280;font-weight:700;margin:6px 0 10px">Selected work</div></td></tr>` +
      projects
        .map(
          (p) =>
            `<tr><td style="padding:0 32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px"><tr><td style="padding:14px 16px">` +
            `<a href="${p.url}" style="color:#111827;font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(p.name)} <span style="color:#2563eb">&rarr;</span></a>` +
            `<div style="color:#4b5563;font-size:14px;line-height:21px;margin-top:4px">${escapeHtml(p.summary)}</div>` +
            `<div>${p.metrics.slice(0, 2).map(chip).join("")}</div>` +
            `</td></tr></table></td></tr>`
        )
        .join("")
    : "";

  const html =
    `<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb">` +
    `<tr><td style="padding:26px 32px 4px"><div style="font-size:20px;font-weight:700;color:#111827">${escapeHtml(profile.name)}</div>` +
    `<div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(profile.degree)}</div>` +
    `<div style="height:3px;width:44px;background:#2563eb;border-radius:2px;margin-top:14px"></div></td></tr>` +
    `<tr><td style="padding:18px 32px 8px;font-size:15px;line-height:24px;color:#1f2937">${bodyToHtml(body)}</td></tr>` +
    workHtml +
    `<tr><td style="padding:10px 32px 6px"><a href="${portfolio}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px">View my portfolio</a></td></tr>` +
    `<tr><td style="padding:16px 32px 24px;font-size:13px;line-height:20px;color:#6b7280">` +
    `${escapeHtml(OPT_OUT)}<br><br>` +
    `${iconLink(portfolio, "&#8599;", "Portfolio")}${iconLink(profile.linkedinUrl, "in", "LinkedIn")}${iconLink(GITHUB_PROFILE, "&lt;/&gt;", "GitHub")}` +
    `</td></tr>` +
    `</table></div>`;

  return { text, html };
}
