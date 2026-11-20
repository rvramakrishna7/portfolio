# Content: the only source of words, numbers and links for the site

Rules: copy text exactly. Never invent, round or add a number. If something you need is missing, STOP and ask. Every number below was verified in the repos, in a test run on 2026-11-19, or timed by hand by the owner (marked).

## Identity
- Name: Ramakrishna (only this name)
- Role line: Full-stack and AI automation developer
- Base: Mumbai, India
- GitHub: https://github.com/rvramakrishna7
- LinkedIn: https://www.linkedin.com/in/rvramakrishna
- Resume file: /resume.pdf (the owner adds the PDF into /public before launch)
- Contact: form only (plus LinkedIn). No email address, no phone number, no photo on the site.
- Status pill text: Open to full-stack and AI automation roles

## Home: hero
- H1: Traders lost a minute every time they moved a strike. Now it takes a few seconds. (the words "a few seconds" are highlighted in the accent colour)
- Intro: I'm Ramakrishna. I make AI-powered products work in the real world, and I keep the numbers to prove it. Below are four of them, told as problems that got solved.
- Buttons: Read the four stories (to #work) | Get in touch (to #contact)
- Title block (blueprint style, bottom right of hero): DEVELOPER Ramakrishna | BASE Mumbai, India | PROJECTS 04 shipped | TESTS PASSING 1,212
- Scroll cue: Scroll down

## Home: the short version (proof strip)
Section label: The short version. Heading: Four numbers, and how I got them.
Each card has a toggle labelled "How was this measured?" (changes to "Hide") that reveals the sentence below it.

- **1,212** | automated tests passing
  - How measured: In the MCP gateway project. I ran all of them on 2026-11-19: 497 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers.
  - Count-up animation allowed: yes, integer only
- **98–100** | Lighthouse on three live apps
  - How measured: Desktop preset. Zync 100, Restart Options 99, Vouch 98. Measured 2026-11-19.
  - Count-up animation allowed: no, show as written
- **18.8 s → 3.35 s** | AI review time in Vouch
  - How measured: The first number is one run before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct.
  - Count-up animation allowed: no, show as written
- **45–60 s → 2–3 s** | moving a strike in Restart Options
  - How measured: Timed with a stopwatch: by hand before, automatic after.
  - Count-up animation allowed: no, show as written

## Home: work section
Label: Work. Heading: Four problems, and what happened next. Intro: Each one starts with a person who had a real problem. Scroll, and each story opens.
Footer note: Earlier work: Book My Nest, a property listing site built with Node.js, Express, MongoDB, Passport.js, Cloudinary and Mapbox. Link: https://bookmynest.onrender.com (say the free host can take a moment to wake up). No performance claim for this project.

### Story 01: Restart Options  (slug: restart-options)
- Tag: Options trading automation
- Hook: Traders moved strikes by hand. Each shift took a minute while the market kept moving.
- Problem: Options traders shifted strikes by hand. Each shift took 45 to 60 seconds, and the market kept moving the whole time.
- Constraint: Market data comes over a live feed that can drop. If the feed or the server restarts, open positions must not be lost or forgotten.
- What I did:
  - Automated adjustments and exits for 5 NIFTY and BANKNIFTY strategies: debit spread, straddle, strangle, iron fly and calendar spread. Each runs in paper mode and live mode.
  - When the internet drops, the live feed reconnects and re-subscribes every open position, so monitoring carries on by itself.
  - After a server restart, open positions and P&L come back from MongoDB.
  - Added a short cooldown between adjustments, so the same adjustment does not fire twice in a row.
- Results (big value | label):
  - 45–60 s → 2–3 s | Strike shifting time (timed by hand)
  - 38 | REST endpoints, with JWT login and owner/user roles
  - 99 | Lighthouse performance score, desktop
- Built with: React, Node.js, Express, MongoDB, WebSocket, JWT
- Live site: https://restartoptions.vercel.app
- Code: https://github.com/rvramakrishna7/restart
- SEO description (meta, under 160 chars): How I took options strike shifting from 45 to 60 seconds by hand to 2 to 3 seconds, with a trading platform that survives network drops and restarts.

### Story 02: Zync  (slug: zync)
- Tag: Video meetings that write their own notes
- Hook: Nobody wants to take notes in a meeting. So the meeting writes them.
- Problem: In most meetings, someone has to take notes, and the notes are either missing or wrong.
- Constraint: Video is heavy. The server had to stay small, so video should never pass through it.
- What I did:
  - Video and audio go peer to peer over WebRTC. The server only passes the signals that connect people.
  - When a call ends, Groq Llama 3.3 70B turns the meeting into key points, action items and decisions.
  - Added chat, reactions, raise hand, JWT login and Google login.
- Results (big value | label):
  - under 3 s | From call end to summary on screen (timed by hand)
  - 100 | Lighthouse performance score, desktop
  - 0.3 s | Largest contentful paint
- Built with: React, Socket.io, WebRTC, MongoDB, Groq
- Live site: https://zync-video-conferencing.vercel.app
- Code: https://github.com/rvramakrishna7/zync-video-conferencing
- SEO description (meta, under 160 chars): A peer-to-peer video meeting app that writes the meeting summary within 3 seconds of the call ending. Lighthouse 100.

### Story 03: Vouch  (slug: vouch)
- Tag: Checking marketing claims against a brand's own facts
- Hook: AI checkers love to invent citations. This one is not allowed to.
- Problem: Brand teams publish claims like "India's No.1" or "keeps drinks cold for 48 hours". Generic AI checkers fix the tone, but they cannot say which approved fact proves a claim, and they make up citations.
- Constraint: Built alone for a hackathon, on free tiers. The AI had to be fast, and it had to be checkable.
- What I did:
  - The AI only suggests. Code checks every citation against the brand's approved facts and rules before anything is shown.
  - Moved the main AI call to Groq, with Gemini as an automatic fallback when Groq is slow or rate-limited.
  - Wrote 100 server tests and 14 end-to-end Playwright tests, plus a run against the live app with the real AI.
- Results (big value | label):
  - 18.8 s → 3.35 s | Review time, average of 10 runs
  - 10 / 10 | Runs with every claim judged correctly
  - 98 | Lighthouse performance score, desktop
- Built with: React, Express, PostgreSQL, Groq, Gemini, Playwright
- Live site: https://vouch-app-beta.vercel.app
- Code: https://github.com/rvramakrishna7/vouch
- SEO description (meta, under 160 chars): An AI reviewer that checks marketing claims against approved facts, where code validates every citation. Review time cut from 18.8 s to 3.35 s.

### Story 04: Team MCP Gateway  (slug: mcp-gateway)
- Tag: One secure front door for AI tools
- Hook: When an AI agent can touch a real store, someone has to keep a record of every move.
- Problem: AI agents that call tools touching real stores need rules: who may call what, and a record of every call.
- Constraint: It had to run the same way on a laptop cluster and on a small rented server with TLS, and it could not trust anything on the network by default.
- What I did:
  - Put 3 MCP servers (WooCommerce, currency rates, web fetch) behind one gateway, with a React dashboard and a Groq chat agent.
  - Deployed with Helm, locally on k3d and on a k3s server with TLS.
  - Default-deny network policies, and stored credentials encrypted with AES-256-GCM.
  - The web-fetch server comes with an SSRF drill that tries loopback, private and cloud-metadata addresses, and redirects to them.
- Results (big value | label):
  - 1,212 | Automated tests, all passing (run on 2026-11-19)
  - 3 | Tool servers behind one login
  - Every call | Written to an audit log
- Built with: Kubernetes, Helm, TypeScript, React, PostgreSQL, Groq
- Live site: none (no live site; show only the code link)
- Code: https://github.com/rvramakrishna7/urumi-mcp-gateway
- SEO description (meta, under 160 chars): A Kubernetes gateway that puts three AI tool servers behind one login with an audit log. 1,212 automated tests, all passing.

## Home: experience
- Section label: Experience, then the dates
- Role: AI and Automation Engineer Intern
- Company: Luxecurio Pvt Ltd (SonicVocal)
- Dates: Aug 2026 – Nov 2026, remote
- Intro: I worked on an AI phone-calling product for US businesses. The agent books appointments over the phone, so the product has to be right even when a call is retried, late or dropped.
- Items:
  - Built the part that follows every call through its states, and ignores late messages so a finished call never flips back to active.
  - Built 8 voice tools for the agent (booking, availability, leads, opt-outs, transfer and more) with replay protection, so a retried call never books twice. Connected Cal.com so the agent books live; 2 staging calls ended in real bookings.
  - Added checks before any call is placed: number format, consent, the suppression list and the recipient's own 9am to 6pm window. That stops wasted credits and carrier trouble.
  - Found a gateway that answered 200 with no login token, and added JWT and role checks.
  - Chose hosting from numbers: FastAPI on Cloudflare Workers took 4 s to start but answered warm requests in 110 to 130 ms. Backed the work with 2,000+ automated tests.
- NDA note (show it): This work is under NDA, so there is no public link. I'm happy to walk through it in an interview.
- Never add a link to the company's product website.

## Home: skills
Label: Skills. Heading: What I work with. Intro: I use AI coding tools (Claude, Google Antigravity and ChatGPT), and I read, review and test everything they write before it ships.
- Languages: JavaScript, TypeScript, Python, SQL, HTML, CSS
- Frontend and backend: React, Next.js, Vite, Node.js, Express, FastAPI, Tailwind CSS, REST, JWT
- Real-time and AI: WebSocket, Socket.io, WebRTC, Vapi, Telnyx, Cal.com API, Groq, Gemini, Claude API, MCP, LLM tool calling, webhooks
- Data and DevOps: MongoDB, PostgreSQL (Supabase, pgvector), Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Render, Git
- Testing: pytest, Jest, Vitest, Playwright, Postman, ESLint

## Home: education and certifications
- Education: BSc in Computer Science, BITS Pilani. Graduated 2026.
- Certifications: NISM Series VIII: Equity Derivatives (SEBI). Meta Backend Developer Professional Certificate. Google IT Automation with Python.

## Home: contact
- Label: Contact. Heading: Got a role, or a hard problem?
- Sub text: Send a message and it lands straight in my inbox. I reply fast.
- Big links: LinkedIn, GitHub, Resume (PDF)
- Form fields: Your name, Your email, Message. Button: Send message.
- Success text: Thanks. Your message is on its way, and I'll reply soon.
- Error text: That did not send. Please try again, or message me on LinkedIn.
- Small note: I only use your details to reply to you.

## Footer
- Text: (c) <year> Ramakrishna. Built by hand with Next.js and plain CSS.
- Links: GitHub, LinkedIn

## SEO text
- Home title: Ramakrishna | Full-stack and AI automation developer
- Home description: Full-stack and AI automation developer in Mumbai. Four projects told as problems solved: strike shifting in 2-3 s, AI review in 3.35 s, 1,212 passing tests.
- Story page title pattern: <Project title>: <tag> | Ramakrishna
- 404 title: Page not found | Ramakrishna. Text: That page is not on this sheet. The link may be old. Start from the top, or jump straight to the work.


## Form messages (added by the planner on 2026-11-20, approved microcopy; use exactly these, nothing else)
- Field errors: "Your name is required" | "Name must be at most 80 characters" | "Your email is required" | "Email must be at most 254 characters" | "Please enter a valid email address" | "Message must be at least 10 characters" | "Message must be at most 4000 characters"
- Any send failure (rate limit, server, network, timeout): show only the error text from the contact section above. Never show server error strings in the page.
