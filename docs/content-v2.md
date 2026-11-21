# Content v2 (PROMOTED to docs/content.md in Phase R4)

Status: written by the planner on 2026-11-21 from the owner's brief. It replaces docs/content.md ONLY when phase R4 promotes it (copy this file over docs/content.md, keep the old file in git history).

## OWNER OVERRIDES 2026-11-21 (these win over anything below)
1. NO email address anywhere on the site (reverses the earlier request). Contact = the form, LinkedIn, GitHub and the resume. Remove every mailto and every Email link from this file's plan. JSON-LD has no email.
2. Project order everywhere (cards, chapters, palette, pager, sitemap order): 1 Restart Options, 2 Team MCP Gateway, 3 Vouch, 4 Zync. Chapter numbers 01 to 04 follow this order. (Sections below are written in the old order; reorder them when building.)
3. Keep the old site's structure and identity; only clean it up (see docs/design-v2.md overrides). So KEEP the "short version" proof strip, in the new copy given in "Proof strip" below. Chapters stay chapters (not a card grid).
4. Facts reconciled by the R0 audit (docs/audit-v1.md) and approved by the owner:
   - MCP gateway tests: 1,212 total. 900 run without a database (185 gateway + 396 dashboard + 225 WooCommerce server + 94 FX server). The gateway has 312 more integration tests that need PostgreSQL (497 in total with them). Say exactly that in the "How was this measured?" text. Show 1,212 as the headline number.
   - Vouch cold start: show "931 ms" as "cold-start launch after 20 minutes idle, from my project status log". Do NOT show the "10 to 12 seconds" baseline (no source exists).
   - Vouch hackathon line allowed: "Built solo for the TechCircuit hackathon, on the Inkloom AI problem statement (brand-governance content review), as team RESTART CODE." Do NOT write "Top 50 finalist" until the owner confirms.
   - Vouch tests: show "14 end-to-end Playwright tests, all passing, plus a run against the live app". Do not show a server test count (one server test failed in the audit run on a test-database row count). Do not claim all server tests pass.
   - Skills: restore Claude API (AI and integrations), Render (Infrastructure) and ESLint (Testing).
5. SonicVocal: owner approved the 2,026 of 2,239 test figures and the seven contribution points as written.

## Proof strip (home, after the hero; keep the "How was this measured?" toggle on each)
Label: The short version. Heading: Four numbers, and how I got them.
- 1,212 | automated tests passing (integer count-up allowed). How measured: In the MCP gateway project. 900 run without a database: 185 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers. 312 more gateway tests need PostgreSQL, which gives 1,212. The full 1,212 run was on 2026-11-19; the 900 figure was re-run in the R0 audit on 2026-11-21.
- 98 to 100 | Lighthouse on three live apps. How measured: Desktop preset. Zync 100, Restart Options 99, Vouch 98. Measured 2026-11-19. (static text)
- 18.83 s → 3.35 s | AI review time in Vouch. How measured: The first number is one measurement before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct. (static text)
- 45 to 60 s → 2 to 3 s | moving a strike in Restart Options. How measured: Timed with a stopwatch: by hand before, automatic after. (static text)

## Hero title block (blueprint style, bottom right, replaces the old stats table)
Three rows: BASED India | EDUCATION BITS Pilani, Computer Science | GRADUATED 2026. No test count, no project count.

## Rules for this file
- Copy text exactly. Never invent, round or add a number, a feature or a claim.
- No em dashes (the long dash character) anywhere in site copy. Use a full stop, a comma, or the word "to" for ranges in prose. A small arrow (the right-arrow character) is allowed inside metric values.
- Banned phrases: passionate, innovative, cutting-edge, leveraging, revolutionizing, seamless, "highly scalable", "I thrive on".
- Items marked [GATED] are NOT shown on the site until the owner approves them. Default is to leave them out.
- Items marked [OPEN] are facts the planner could not verify. Do not guess. List them in your report.

## Identity
- Name: Ramakrishna (only this name). No photo. No phone number.
- Role line: Software Engineer. Full-stack, backend and AI systems.
- Location: India
- Education line: BSc Computer Science, BITS Pilani, 2026 graduate
- Status pill: Open to software engineering opportunities
- GitHub: https://github.com/rvramakrishna7
- LinkedIn: https://www.linkedin.com/in/rvramakrishna
- Email: NOT shown on the site (owner decision 2026-11-21)
- Resume: /resume.pdf
- Site address: the REAL live address is https://rramakrishna.vercel.app (two r). NEXT_PUBLIC_SITE_URL must equal it. See phase R0.

## Navigation
Home | Work | Experience | Skills | Contact, then a theme toggle, then a Resume link. Brand text "Ramakrishna" links to the top. Keep the Ctrl+K "Jump to" palette (entries: the four stories, Experience, Skills, About, Contact, Resume).

## Home: hero
- Eyebrow (status pill): Open to software engineering opportunities
- H1: I build software that makes complex work faster, simpler and more reliable.
- Intro, paragraph 1: I take workflows that are slow, repetitive or easy to get wrong and turn them into software people can rely on.
- Intro, paragraph 2: My work covers full-stack apps, backend systems, real-time communication, AI automation and infrastructure. I start with the problem, make sensible engineering decisions, and measure whether the result is actually better.
- Primary button: View my work (to #work)
- Secondary button: Download resume (to /resume.pdf, with the download attribute)
- Info row (three small items, no icons needed): India | BITS Pilani, Computer Science | 2026 graduate
- No stats table, no test count, no trading-specific headline in the hero. The first screen must fit without scrolling on a 1280x720 window.

## Home: selected work
- Label: Selected work
- Heading: Four problems, what I built, and what I measured.
- Order: Restart Options, Team MCP Gateway, Vouch, Zync.
- Each card shows: number, category, headline, "The problem" (1 to 2 sentences), "What I built" (1 to 2 sentences), one or two metrics with a one-line method label, tech tags, links (Read the story, Live site if any, Code).

### Card 1: Restart Options (slug: restart-options)
- Category: Options trading automation
- Headline: Turned a manual options adjustment into a 2 to 3 second workflow.
- Problem: When the market moves, a trader has to find the right strikes again by hand. One adjustment took 45 to 60 seconds while prices kept changing.
- Built: Strategy rules pick the strikes. The trader confirms with one click, and a configured loss limit can trigger an automatic exit.
- Metrics: "45 to 60 s → 2 to 3 s" | Strike adjustment, manual versus automated, timed with a stopwatch. And "38" | REST endpoints with JWT login and owner and user roles.
- Tags: React, Node.js, Express, MongoDB, WebSocket, JWT
- Live: https://restartoptions.vercel.app  Code: https://github.com/rvramakrishna7/restart

### Card 2: Vouch (slug: vouch)
- Category: AI brand content verification
- Headline: An AI reviewer shouldn't approve a claim without being able to prove it.
- Problem: Marketing teams publish claims like "keeps drinks cold for 48 hours". Generic AI tools can write a convincing citation that points to nothing, and a reviewer cannot tell.
- Built: An evidence-first review system. The model suggests and analyses. Backend code checks every citation against approved, unexpired company facts before anything is shown.
- Metrics: "18.83 s → 3.35 s" | First review measurement, then the average of 10 optimised runs. And "10 of 10" | Runs where every claim was judged correctly (50 verdicts).
- Tags: React 19, TypeScript, Vite, Express, PostgreSQL, Supabase, pgvector, Groq, Gemini, Playwright
- Live: https://vouch-app-beta.vercel.app  Code: use the existing codeUrl in src/content/stories.ts

### Card 3: Team MCP Gateway (slug: mcp-gateway)
- Category: Infrastructure, security and AI tool integration
- Headline: One controlled entry point for a team's AI tools.
- Problem: Every team member had to set up each MCP server on their own. Credentials ended up spread across laptops, and nobody had a shared record of which tools were used.
- Built: A gateway. An admin registers the servers once. Members connect through one URL and see only the tools their role allows. Upstream credentials stay encrypted on the gateway.
- Metrics: "22 ms" | Tool-list lookup with a deliberately slow upstream, served from the database cache. And "3" | MCP servers behind one login.
- Tags: TypeScript, React, PostgreSQL, Node.js, MCP, Docker, Kubernetes, Helm, Groq
- Live: none. Code: https://github.com/rvramakrishna7/urumi-mcp-gateway

### Card 4: Zync (slug: zync)
- Category: Real-time video meetings with AI notes
- Headline: People came to meetings to participate, not to write minutes.
- Problem: In an online meeting someone has to take notes while also listening and talking. Decisions and action items get missed.
- Built: A video meeting app that writes the notes when the call ends: key points, decisions and action items.
- Metrics: "Under 3 s" | From call end to summary on screen, timed by hand. And "100" | Lighthouse performance, desktop (LCP 0.3 s).
- Tags: React, Socket.io, WebRTC, MongoDB, Groq, Llama 3.3 70B
- Live: https://zync-video-conferencing.vercel.app  Code: https://github.com/rvramakrishna7/zync-video-conferencing

### Additional projects (compact, one row, no metrics)
- Book My Nest: A property listing site where people browse listings and view property details. Node.js, Express, MongoDB, Passport.js, Cloudinary, Mapbox. Live: https://bookmynest.onrender.com (free host, can take a moment to wake). Do not describe any feature beyond this.

## Home: experience (SonicVocal)
- Label: Experience
- Heading: A business shouldn't lose a customer just because nobody can answer the phone.
- Role line: AI and Automation Engineer Intern, Luxecurio Pvt Ltd (SonicVocal). Remote. August 2026 to November 2026.
- Problem paragraph: Businesses lose opportunities when calls go unanswered because the owner or staff are busy. Someone has to pick up, understand the request, check the calendar and book the appointment by hand.
- What the product does: SonicVocal is an AI voice platform for businesses. Its agent answers real phone calls, understands what the caller needs, answers common questions from a knowledge base, checks availability and books appointments through Cal.com, records leads and contacts, takes callback and opt-out requests, and transfers to a human when needed. It also runs outbound calling campaigns.
- My work (7 items, in this order):
  1. Stopped finished calls from flipping back to active. I built the call-state handling for Vapi webhooks, so a late or out-of-order event cannot reopen a call that has ended.
  2. Made the agent's tools safe to retry. I worked on eight tools (booking, availability, leads, contacts, opt-outs, callbacks, transfers and more) and added idempotency checks so a retried request cannot book or record the same thing twice.
  3. Connected Cal.com v2 for live availability and booking. Two staging calls ended in confirmed bookings.
  4. Added checks before every outbound call: phone number format, consent, suppression list, the recipient's local calling window, and capacity limits.
  5. Worked on campaign pause, resume and cancel, and added protection against duplicate campaign jobs.
  6. Closed an authorization gap in the Cloudflare Worker gateway, which answered requests that carried no login token, by adding JWT and role checks.
  7. Measured FastAPI on Cloudflare Workers before choosing it: about 4 seconds for a cold start and 110 to 130 ms for warm requests in the benchmark I ran.
- Testing line: 2,026 automated tests in the modules I owned, out of 2,239 in the full repository suite as reported. [OPEN: owner to confirm these two numbers are current]
- NDA note (show it): Some implementation details are confidential. I'm happy to walk through my engineering contributions and the architecture in an interview.
- Never link to or describe the SonicVocal product website beyond the text above. [OPEN: owner to confirm the employer allows these details and the test counts to be public]

## Home: skills (grouped, no logo wall)
- Label: Engineering capabilities
- Heading: What I work with
- Groups (label | items):
  - Languages | JavaScript, TypeScript, Python, SQL, HTML, CSS
  - Frontend | React, Next.js, Vite, Tailwind CSS
  - Backend | Node.js, Express, FastAPI, REST APIs, JWT
  - Real-time systems | WebSocket, Socket.io, WebRTC, webhooks
  - AI and integrations | Groq, Gemini, Vapi, Telnyx, Cal.com API, MCP, pgvector, LLM tool calling
  - Databases | MongoDB, PostgreSQL, Supabase
  - Infrastructure | Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Git
  - Testing | pytest, Jest, Vitest, Playwright, Postman
- The old site also listed Material UI, Render, GitHub, ESLint, Claude API and Antigravity. Compare with src/components/Skills.tsx and REPORT every difference; do not silently drop or add a technology.

## Home: about
- Label: About
- Heading: How I work
- Paragraph 1: I like to understand how something works before I decide how to build it.
- Paragraph 2: Most of my projects started with a workflow that took too much manual effort, or one that broke when something unexpected happened. I enjoy working through those details, building the system and testing it under real conditions.
- Paragraph 3: I use AI coding tools too. I review the decisions they make, read the code, and check behaviour with tests and real runs.
- Education: BSc Computer Science, BITS Pilani, 2026.
- Certifications: NISM Series VIII Equity Derivatives (SEBI). Meta Backend Developer Professional Certificate. Google IT Automation with Python.

## Home: contact
- Heading: Have a problem worth solving?
- Text: I'm open to software engineering opportunities. Tell me about your team, the role or the problem you're working on.
- Links: LinkedIn, GitHub, Download resume. No email.
- Form: keep the existing form, fields, validation, honeypot and error texts exactly as in docs/content.md "Form messages". Success text stays as today.

## Footer
(c) 2026 Ramakrishna. Built with Next.js and plain CSS. GitHub, LinkedIn, back to top.

## Story pages: shared structure (every /work/[slug] page, same order)
1. Breadcrumb, category tag, H1 (project title), headline sentence, tech tags.
2. The problem
3. Why the usual way fell short
4. What I built
5. Engineering decisions
6. Reliability, security and failure handling (omit a heading if a project has nothing real to say)
7. Results (table: measure | value | how it was measured)
8. Built with, then links (live site, code)
9. Pager (previous and next story, order: Restart Options, MCP Gateway, Vouch, Zync, wrapping around)
Use short paragraphs and short bullet lists. No API-doc tone.

### Story: Restart Options
- Problem: Options traders running strategies such as straddles, strangles, iron flies, debit spreads and calendar spreads often have to read the option chain and pick strikes by hand. When the market moves they have to do it again: search for the strikes, check them against their rules, then place the orders.
- Why the usual way fell short: Prices keep changing while the trader does this. One manual strike adjustment took about 45 to 60 seconds.
- What I built: Strategy-specific rules that pick the strikes automatically, one-click execution of the adjustment, and automatic exits when a configured loss limit is reached. Five strategies: debit spread, straddle, strangle, iron fly and calendar spread. Both paper and live modes.
- Decisions:
  - The rules for each strategy choose the strikes, so the trader confirms an adjustment instead of calculating it.
  - Paper mode and live mode run the same workflow, so a strategy can be tried without real orders.
  - Open positions and P&L are stored in MongoDB, so a server restart does not lose them.
  - A short cooldown stops the same adjustment from firing twice in a row.
- Reliability: When the internet drops, the live feed reconnects and re-subscribes every open position, so monitoring carries on by itself. After a restart, positions and P&L are loaded back from MongoDB. Access uses JWT login with owner and user roles across 38 REST endpoints.
- Results: Strike adjustment 45 to 60 s manual, 2 to 3 s automated (stopwatch, by hand). REST endpoints: 38. Lighthouse performance 99 (desktop).
- Honest note (show it): This project automates execution. It does not predict markets, and I make no claim about trading returns.
- Diagram: simple before and after bars: 45 to 60 s versus 2 to 3 s. Draw bars to scale from the midpoint 52.5 s and 2.5 s, label them with the real ranges, caption "Timed with a stopwatch".

### Story: Vouch
- Problem: Marketing teams publish claims such as "India's No. 1 sustainable smart water bottle", "keeps drinks cold for 48 hours" and "made from 100% recycled ocean plastic". A brand reviewer needs to know whether each claim is backed by an approved fact, whether that fact has expired, whether the claim contradicts product data, whether the wording breaks a brand rule, and who approved the final text.
- Why the usual way fell short: Generic AI writing tools can produce a plausible citation that is made up. Nothing checks it.
- What I built: An evidence-first brand content review system. The AI can suggest and analyse. Deterministic backend code validates the final evidence.
- Pipeline (diagram, left to right): Submitted content, Claim Ledger (extract claims, retrieve approved facts with pgvector), AI suggests a verdict and citation, Deterministic checks, Approval, Audit trail.
- Deterministic checks (list): the citation points to a fact that was actually retrieved; the quoted text exists in the source; the approved fact has not expired; numeric claims agree; regulated terms cannot get a "supported" verdict without the required evidence.
- Decisions:
  - Brand Kit stores approved facts, their sources and expiry dates, and numbered brand rules.
  - pgvector semantic search finds the facts relevant to each claim.
  - Structured AI responses are validated with Zod, and suggested corrections are fact-checked before they are accepted, so a fix cannot add an unsupported claim, an expired fact or a banned term.
  - Groq is the primary AI provider with Gemini as fallback.
- Reliability and security: Creator, Reviewer and Brand Manager roles. Tenant isolation with PostgreSQL Row Level Security. An append-only audit log that blocks updates and deletes on audit rows. Performance timing is recorded per review.
- Honest note (show it): The model does not guarantee that a claim is true. The code checks the evidence it is given.
- Results: First review measurement 18.83 s. Average after optimising, 3.35 s over 10 runs (do not call 18.83 s an average). Every claim judged correctly in 10 of 10 runs (50 verdicts). Lighthouse performance 98 (desktop).
- Testing line: Automated server tests, Playwright end-to-end tests and a live acceptance run. [GATED: show exact test counts only after the owner confirms them; the old site said 100 server tests and 14 Playwright tests, the owner's notes disagree]
- Cold start: see override 4 (show 931 ms only).
- (see override 4, do not write Top 50 finalist) Hackathon line: "TechCircuit hackathon, Inkloom AI problem statement, solo team RESTART CODE, Top 50 finalist". Show only after the owner confirms the exact wording.

### Story: Team MCP Gateway
- Problem: A team using several MCP servers had every member configure each one separately. Credentials were scattered, access was hard to manage in one place, and nobody could see which tools were being used. A slow or broken upstream service also got in the way of people's work.
- What I built: A central MCP gateway. An admin registers the servers once. Members connect through a single gateway URL and use the tools their role allows. Upstream API credentials stay on the gateway, encrypted.
- Architecture (diagram): Members and the Groq chat agent and the React admin dashboard, then the Gateway (authentication, role-based tool filter, audit log, health checks, cached tool lists), then three MCP servers (WooCommerce, currency exchange, web fetch). PostgreSQL sits beside the gateway for keys, audit and the tool cache.
- Decisions:
  - Tool discovery is served from a database-backed cache, so a slow upstream does not slow down listing tools.
  - Tool access is restricted by role, with separate admin and member permissions.
  - Upstream credentials are encrypted with AES-256-GCM. API keys are stored hashed. Passwords use Argon2id.
- Security and infrastructure: Session security and CSRF protection, network policies, SSRF protection (the web-fetch server has a drill that tries loopback, private and cloud-metadata addresses and redirects to them), Helm deployments, local k3d and remote k3s, TLS with Let's Encrypt.
- Results: Tool-list lookup about 22 ms even with a slow upstream. Three MCP servers behind one login. Every tool call written to a PostgreSQL audit log.
- Testing line: More than 900 automated tests across the gateway, the dashboard and the tool servers. [GATED: show an exact count only after phase R0 reconciles it. The dated run on 2026-11-19 gave 1,212 (497 gateway, 396 dashboard, 225 and 94 in two tool servers). The owner's newer notes give 900 (185 gateway, 396, 225, 94). The gateway number is the difference.]
- Still on my list (show as a short, calm list titled "What I would harden next"): a rate limit on the MCP endpoint; some network-policy and security-context work; rollback scenarios that I have not tested; recording every admin action in the database audit table.
- Do NOT call it a hardened enterprise security platform.

### Story: Zync
- Problem: In an online meeting, people take notes while they listen and speak. Important decisions and action items get missed.
- Why the usual way fell short: Notes are either missing or wrong, and the person taking them is not fully part of the conversation.
- What I built: A video meeting app that writes the notes when the call ends. The summary lists key points, decisions and action items and appears within about 3 seconds in my timed run. It also has real-time chat, reactions, raise hand, JWT login and Google login.
- Decisions:
  - Audio and video go peer to peer over WebRTC. The application server only handles signalling, which means it only helps participants find and connect to each other. The media does not pass through it. That keeps the server small. I make no scale claims.
  - Groq with Llama 3.3 70B writes the summary.
- Diagram: participants connected to each other by WebRTC (audio, video), and each connected to the signalling server (Socket.io) with a thin line. Label the thick line "media" and the thin line "signals only".
- Results: Under 3 s from call end to summary on screen (timed by hand). Lighthouse performance 100 (desktop). LCP 0.3 s (that measurement).
- [OPEN] What exactly goes into the summary request (transcript or something else) is not in the brief. Do not describe it. Say "turns the meeting into key points, decisions and action items".

## SEO and metadata
- Home title (under 60 chars): Ramakrishna | Software Engineer (Full-Stack, Backend, AI)
- Home description (under 160 chars, count it): Software engineer in India (BITS Pilani, 2026). Four projects told as problems solved: options automation, AI claim checks, an MCP gateway, video meetings.
- Story titles (under 75 chars, project name first): pattern "<Project>: <short plain claim> | Ramakrishna". Write one per story using only numbers exactly as written on this page. Never round (for example never write "60 seconds to 3").
- Story descriptions (under 160 chars each): write from each card's problem and metric. No new numbers.
- JSON-LD: WebSite and Person (addressCountry India, no street address, no phone), BreadcrumbList on story pages.
- OG image: flat, uses the new tokens (dark variant is fine), name, role line, one short tagline. No gradients.
