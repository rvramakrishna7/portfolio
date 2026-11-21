# Audit v1: Portfolio Codebase & Ecosystem State (Phase R0)

Generated: 2026-11-21 by Antigravity (Phase R0 Audit). Real facts from direct inspection and command execution only.

---

## 1. Current Portfolio Architecture

### 1.1 Routes
- `/` (Home page: Hero, ProofStrip, Work [4 chapters], Experience, Skills, Contact)
- `/work/restart-options` (Story 01: Restart Options)
- `/work/zync` (Story 02: Zync)
- `/work/vouch` (Story 03: Vouch)
- `/work/mcp-gateway` (Story 04: Team MCP Gateway)
- `/api/contact` (POST handler: zod validation, honeypot, rate limiting, Resend delivery)
- `/resume.pdf` (Static asset: `public/resume.pdf`, 80,558 bytes)
- `/opengraph-image` (Edge dynamic image generator: Satori flat layout, 1200x630)
- `/robots.txt` (Static route: `src/app/robots.ts`)
- `/sitemap.xml` (Static route: `src/app/sitemap.ts`)
- `/icon.svg` (Static route: `src/app/icon.svg`)
- `not-found` (`src/app/not-found.tsx` for unknown paths e.g. `/nope`)

### 1.2 Components (`src/components/`, 15 files)
- `BackToTop.tsx` (930 B)
- `ChapterReveal.tsx` (1,247 B)
- `CommandPalette.tsx` (6,963 B)
- `Contact.tsx` (1,163 B)
- `ContactForm.tsx` (4,729 B)
- `CountUp.tsx` (1,616 B)
- `Experience.tsx` (2,081 B)
- `Footer.tsx` (793 B)
- `Header.tsx` (1,726 B)
- `Hero.tsx` (2,873 B)
- `ProofStrip.tsx` (2,364 B)
- `ReadingProgress.tsx` (952 B)
- `Skills.tsx` (2,111 B)
- `SkipLink.tsx` (123 B)
- `Work.tsx` (3,774 B)

### 1.3 Styles & CSS Size (`src/styles/`)
- `src/styles/tokens.css`: 563 bytes
- `src/styles/globals.css`: 24,212 bytes
- Total CSS: 24,775 bytes (~24.2 KB uncompressed)

### 1.4 Dependencies (`package.json`)
- Production runtime dependencies (3):
  - `next`: `16.4.6`
  - `react`: `19.3.0`
  - `react-dom`: `19.3.0`
  - `zod`: `^4.3.6`
- Dev dependencies (8):
  - `@axe-core/playwright`: `^4.11.2`
  - `@playwright/test`: `^1.59.1`
  - `@types/node`: `^22.19.17`
  - `@types/react`: `^19`
  - `@types/react-dom`: `^19`
  - `eslint`: `^9`
  - `eslint-config-next`: `16.4.6`
  - `typescript`: `^5`
  - `vitest`: `^5.1.1`

### 1.5 Test Counts by File
#### Vitest Unit Tests (16 tests across 2 files, all passing)
- `scripts/check-flat.test.ts`: 2 tests
- `src/app/api/contact/route.test.ts`: 14 tests

#### Playwright E2E Tests (84 tests across 13 files, all passing)
- `e2e/accessibility.spec.ts`: 5 tests
- `e2e/contact.spec.ts`: 8 tests
- `e2e/forced-colors-zoom.spec.ts`: 2 tests
- `e2e/headers.spec.ts`: 5 tests
- `e2e/health.spec.ts`: 7 tests
- `e2e/hero.spec.ts`: 6 tests
- `e2e/print.spec.ts`: 2 tests
- `e2e/seo.spec.ts`: 4 tests
- `e2e/shell.spec.ts`: 8 tests
- `e2e/smoke.spec.ts`: 1 test
- `e2e/stories.spec.ts`: 19 tests
- `e2e/viewport-extremes.spec.ts`: 9 tests
- `e2e/work.spec.ts`: 8 tests

Total portfolio test suite: 100 tests (16 unit + 84 e2e).

### 1.6 External Links & Live HTTP Status
Tested via direct HEAD/GET requests from terminal:
1. `https://github.com/rvramakrishna7`: **200 OK**
2. `https://www.linkedin.com/in/rvramakrishna`: **999** (LinkedIn anti-bot status for automated requests; standard behavior for curl/HEAD)
3. `https://restartoptions.vercel.app`: **200 OK**
4. `https://github.com/rvramakrishna7/restart`: **200 OK**
5. `https://zync-video-conferencing.vercel.app`: **200 OK**
6. `https://github.com/rvramakrishna7/zync-video-conferencing`: **200 OK**
7. `https://vouch-app-beta.vercel.app`: **200 OK**
8. `https://github.com/rvramakrishna7/vouch`: **200 OK**
9. `https://github.com/rvramakrishna7/urumi-mcp-gateway`: **200 OK**
10. `https://bookmynest.onrender.com`: **200 OK** (302 redirect to listings, wakes from sleep in ~30s on free tier)

### 1.7 Current Meta Tags per Page
- **`/` (Home)**:
  - `<title>`: `Ramakrishna | Full-stack and AI automation developer` (52 chars)
  - `<meta name="description">`: `Full-stack and AI automation developer in Mumbai. Four projects told as problems solved: strike shifting in 2-3 s, AI review in 3.35 s, 1,212 passing tests.` (159 chars)
  - Canonical: `http://localhost:3000/` (local default) / `https://ramakrishna.vercel.app/` (live)
  - OpenGraph / Twitter: `og:title`, `og:description`, `og:url`, `og:image` (`/opengraph-image`), `twitter:card` (`summary_large_image`)
  - JSON-LD: `@graph` with `WebSite` and `Person` (Mumbai, India, LinkedIn, GitHub)
- **`/work/restart-options`**:
  - `<title>`: `Restart Options: Options trading automation | Ramakrishna`
  - `<meta name="description">`: `How I took options strike shifting from 45 to 60 seconds by hand to 2 to 3 seconds, with a trading platform that survives network drops and restarts.`
  - Canonical: `/work/restart-options`
- **`/work/zync`**:
  - `<title>`: `Zync: Video meetings that write their own notes | Ramakrishna`
  - `<meta name="description">`: `A peer-to-peer video meeting app that writes the meeting summary within 3 seconds of the call ending. Lighthouse 100.`
  - Canonical: `/work/zync`
- **`/work/vouch`**:
  - `<title>`: `Vouch: Checking marketing claims against a brand's own facts | Ramakrishna`
  - `<meta name="description">`: `An AI reviewer that checks marketing claims against approved facts, where code validates every citation. Review time cut from 18.8 s to 3.35 s.`
  - Canonical: `/work/vouch`
- **`/work/mcp-gateway`**:
  - `<title>`: `Team MCP Gateway: One secure front door for AI tools | Ramakrishna`
  - `<meta name="description">`: `A Kubernetes gateway that puts three AI tool servers behind one login with an audit log. 1,212 automated tests, all passing.`
  - Canonical: `/work/mcp-gateway`
- **`not-found` (`/nope`)**:
  - `<title>`: `Page not found | Ramakrishna`
  - `<meta name="description">`: `That page is not on this sheet. The link may be old. Start from the top, or jump straight to the work.`
  - `<meta name="robots" content="noindex">`

---

## 2. Domain Check: `NEXT_PUBLIC_SITE_URL`

### Inspection Findings
- In `src/lib/site.ts`:
  ```ts
  export function getSiteUrl(): string {
    const url = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return url.replace(/\/+$/, "");
  }
  ```
- In `src/app/layout.tsx`:
  `metadataBase: new URL(getSiteUrl())`
- When `NEXT_PUBLIC_SITE_URL` is set:
  1. Next.js App Router resolves all relative metadata URLs (`canonical: "/"`, `canonical: "/work/..."`, `openGraph.url`) using `metadataBase`.
  2. `absoluteUrl(path)` outputs the base URL for `sitemap.xml`, `robots.txt`, JSON-LD schemas, and OpenGraph images.
- In the local build without the variable, it outputs `http://localhost:3000`.
- In the live build on Vercel, it currently resolves to `https://ramakrishna.vercel.app` (single "r").
- The true live Vercel URL is **`https://rramakrishna.vercel.app`** (two "r").

### Action Required by Owner in Vercel Dashboard
In **Vercel Dashboard -> portfolio -> Settings -> Environment Variables**:
- Target variable: `NEXT_PUBLIC_SITE_URL`
- Current value: `https://ramakrishna.vercel.app`
- **Change to:** `https://rramakrishna.vercel.app`
- Environments: Production, Preview, Development.
- Redeploy `main` to apply.

---

## 3. Project Ecosystem Test Counts & Benchmarks

Local repos located under `C:\Users\91937\Documents`:

| Project / Component | Local Path | Test Framework / Command | Real Test Count | Real Result |
|---|---|---|---|---|
| **Vouch Server** | `tech-circuit-hackathon\vouch\server` | `npm test` (`vitest run --fileParallelism false`) | **104 tests** (13 files) | **103 passed, 1 failed** (`test/db.test.ts` failed on existing test-database seed row count) |
| **Vouch Client E2E** | `tech-circuit-hackathon\vouch\client` | `npm run test:e2e` (`playwright test --project=chromium`) | **14 tests** (5 files) | **14 passed** in 1.5m |
| **MCP Gateway** | `WooCommerce\services\gateway` | `npm test` (`node --test`) | **185 tests** (54 suites) | **185 passed** (unit suite without DB; 497 total when DB integration tests run via `npm run test:db`) |
| **MCP Dashboard** | `WooCommerce\services\dashboard` | `npm test` (`vitest run`) | **396 tests** (19 files) | **396 passed** in 24.53s |
| **WooCommerce MCP** | `WooCommerce\services\woo-mcp` | `npm test` (`node --test`) | **225 tests** (31 suites) | **225 passed** in 1.95s |
| **FX MCP Server** | `WooCommerce\services\fx-mcp` | `npm test` (`node --test`) | **94 tests** (22 suites) | **94 passed** in 1.65s |
| **Restart Options** | `Software Development Engineer\Main Projects\restartoptions` | `npm test` (`jest`) | **7 tests** (3 suites) | **7 passed** in 3.6s |
| **Zync** | `Software Development Engineer\Main Projects\Zync` | No test scripts defined in `Backend/package.json` or `Frontend/package.json` | 0 tests | N/A |

### Reconciliation of MCP Test Counts (1,212 vs 900)
- **Without live PostgreSQL (Unit test run)**:
  - Gateway unit tests: **185**
  - Dashboard tests: **396**
  - WooCommerce server tests: **225**
  - FX server tests: **94**
  - **Total: 185 + 396 + 225 + 94 = 900 tests** (Matches the owner's newer notes exactly: "gateway has 185 unit tests and total is 900").
- **With live PostgreSQL (`test:db` script)**:
  - Gateway integration tests add 312 tests: 185 + 312 = **497 tests**
  - Total: 497 + 396 + 225 + 94 = **1,212 tests** (Matches the dated run on 2026-11-19).

### Hackathon Wording Findings
- In `C:\Users\91937\Documents\tech-circuit-hackathon\vouch\README.md` (line 5):
  > `Built by team **RESTART CODE** (R V Ramakrishna) for the TechCircuit hackathon, problem statement by Inkloom AI (brand-governance content review).`
- In `C:\Users\91937\Documents\tech-circuit-hackathon\docs\round2-form-answers.md` (line 1):
  > `# Vouch: Round 2 submission form answers`
- In `C:\Users\91937\Documents\tech-circuit-hackathon\vouch\docs\plan.md` (line 3):
  > `Source: Round 1 plan (Vouch_RESTART_CODE_Round1.pdf) + Round 2 brief. Judging: core workflow 30, technical depth 25, progress from Round 1 20, three improvements 15, usability 10.`
- **Note on "Top 50 finalist"**: This specific phrase does not appear in repository files; the submission progressed from Round 1 to Round 2 ("The Build"). Keep gated until confirmed by owner.

### Cold-Start Benchmark Findings
- In `C:\Users\91937\Documents\tech-circuit-hackathon\vouch\docs\status.md` (lines 330-336):
  > `Cold-start live measurements (S12e.1):`
  > `Live measurements after 20-minute idle period:`
  > `- Run 1 (Cold): 931 ms (Click -> Content list fully shown; Server-Timing: db 34.8ms, total 35.1ms; OPTIONS 97ms, POST demo 191ms, GET contents 137ms) -> PASS (vs <= 3 s target).`
  > `- Run 2 (Warm): 401 ms (OPTIONS 60ms, POST demo 134ms, GET contents 128ms) -> PASS (vs <= 1 s target).`
  > `- Run 3 (Warm): 412 ms (OPTIONS 60ms, POST demo 116ms, GET contents 120ms) -> PASS (vs <= 1 s target).`
- In `C:\Users\91937\Documents\tech-circuit-hackathon\vouch\docs\decision-log.md` (DEC-012, lines 53-58):
  > `Context: Render free tier sleeps after 15 min and takes 50+ s to wake. Judges would hit that on first click.`
- In `C:\Users\91937\Documents\tech-circuit-hackathon\docs\round2-form-answers.md` (line 56):
  > `server keep-warm to avoid cold starts.`
- **Note on "10 to 12 seconds"**: The phrase "10 to 12 seconds" does not appear in any Vouch document. The benchmark documented in `vouch/docs/status.md` is a 931 ms cold start after 20 minutes idle on Vercel Functions in `bom1` (Mumbai) with pre-warm/keep-warm, compared against typical Render free-tier cold wake times (50+ seconds) or un-warmed serverless starts.

---

## 4. Skills Comparison: `src/components/Skills.tsx` vs `docs/content-v2.md`

| Aspect | `src/components/Skills.tsx` (Current v1) | `docs/content-v2.md` (Proposed v2) | Difference Analysis |
|---|---|---|---|
| **Structure** | 5 broad categories (`Languages`, `Frontend and backend`, `Real-time and AI`, `Data and DevOps`, `Testing`) | 8 focused groups (`Languages`, `Frontend`, `Backend`, `Real-time systems`, `AI and integrations`, `Databases`, `Infrastructure`, `Testing`) | Clean separation of Frontend/Backend, Real-time/AI, Data/Infra. |
| **Languages** | `JavaScript, TypeScript, Python, SQL, HTML, CSS` | `JavaScript, TypeScript, Python, SQL, HTML, CSS` | Identical. |
| **Frontend** | Combined with Backend (`React, Next.js, Vite... Tailwind CSS`) | `React, Next.js, Vite, Tailwind CSS` | Dedicated Frontend group. |
| **Backend** | Combined with Frontend (`Node.js, Express, FastAPI... REST, JWT`) | `Node.js, Express, FastAPI, REST APIs, JWT` | "REST" expanded to "REST APIs". |
| **Real-time** | Combined with AI (`WebSocket, Socket.io, WebRTC... webhooks`) | `WebSocket, Socket.io, WebRTC, webhooks` | Dedicated group for Real-time systems. |
| **AI & Integrations** | Combined with Real-time (`Groq, Gemini, Claude API, MCP, LLM tool calling...`) | `Groq, Gemini, Vapi, Telnyx, Cal.com API, MCP, pgvector, LLM tool calling` | `Claude API` removed; `pgvector` added here; Vapi, Telnyx, Cal.com API grouped with AI & Integrations. |
| **Databases** | Combined in Data and DevOps (`MongoDB, PostgreSQL (Supabase, pgvector)...`) | `MongoDB, PostgreSQL, Supabase` | Dedicated Databases group. `Supabase` is a top-level item; `pgvector` moved to AI. |
| **Infrastructure** | Combined with Data (`Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Render, Git`) | `Docker, Kubernetes, Helm, Cloudflare Workers, Vercel, Git` | `Render` removed. |
| **Testing** | `pytest, Jest, Vitest, Playwright, Postman, ESLint` | `pytest, Jest, Vitest, Playwright, Postman` | `ESLint` removed. |
| **AI Tools in Copy** | Paragraph: "Claude, Google Antigravity and ChatGPT" | Moved to About section: "I use AI coding tools too..." | Refined wording in separate About component. |
| **Education & Certs** | Embedded inside `<div className="edu">` in `Skills.tsx` | Moved to standalone `About` section | Clear separation of skills from education & certifications. |

---

## 5. Summary of Gated / Open Items for Owner Approval Before Publishing

1. **Vouch Test Count**: Old copy said "100 server tests and 14 Playwright tests". Actual count is 104 server tests (103 passing + 1 seed count issue) and 14 Playwright tests (14 passing). Recommendation: state "Over 100 automated server tests and 14 Playwright end-to-end tests".
2. **Vouch Cold-Start Benchmark**: Benchmark in `status.md` is 931 ms after 20 minutes idle. "10 to 12 seconds" is unverified in files. Recommendation: keep gated or describe as "Cold start under 1 second (931 ms measured) on Vercel Mumbai with database pre-warming".
3. **Hackathon Wording**: Documented as "team RESTART CODE (R V Ramakrishna) for the TechCircuit hackathon, problem statement by Inkloom AI (brand-governance content review)", Round 1 to Round 2 finalist.
4. **Team MCP Gateway Test Count**: Unit tests without DB = 900 tests; total with PostgreSQL = 1,212 tests. Content-v2 text "More than 900 automated tests" is verified and accurate.
5. **SonicVocal Employer Approval**: Owner to confirm whether SonicVocal internal details and test counts (2,026 owned / 2,239 total) are permitted under NDA.
6. **Domain URL**: Update `NEXT_PUBLIC_SITE_URL` in Vercel to `https://rramakrishna.vercel.app`.
