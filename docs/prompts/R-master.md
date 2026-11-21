# R-master: portfolio redesign (phases R0 to R5)

PROGRESS  [░░░░░░] Redesign: 0 of 6 phases (0%)  |  Site v1 is live; this is a rewrite of copy, structure and look.

You are Antigravity, the builder. The planner (Claude) wrote the specs. You build exactly what they say. Read in this order before anything else: AGENTS.md (all of it, including 6a), docs/content-v2.md, docs/design-v2.md, docs/plan.md, docs/decision-log.md, docs/status.md, then the current code.

## OWNER OVERRIDES 2026-11-21 (these win over anything below, read docs/content-v2.md and docs/design-v2.md overrides first)
- This is a CLEAN-UP, not a rewrite. Keep the old site's structure, blueprint hero, chapters, proof strip, palette idea and motion. Add: light and dark theme with toggle, the blue accent, new copy, new project order, the new story-page structure.
- NO email anywhere on the site. Project order: Restart Options, Team MCP Gateway, Vouch, Zync.
- Where this file says delete ProofStrip or CountUp, build WorkGrid or ProjectCard, or remove the blueprint hero: DO NOT. Keep and restyle them.
- The gated items were resolved by the owner, see content-v2.md override 4. Everything else gated stays out.
- The live address is https://rramakrishna.vercel.app. Phase R0 is done (docs/audit-v1.md). Start at the phase the owner names.

## Objective
Turn the live portfolio into a recruiter-focused, Apple-style (restrained, light and dark) software engineer portfolio. First 30 seconds: who I am, what kind of engineer, the problems I solve, that I am open to roles. Each project is told as problem, what I built, measured result. Do not rewrite what already works. Keep Next.js 16, App Router, TypeScript, zod, Vitest, Playwright, plain CSS, system fonts, free Vercel hosting. No new runtime dependencies. If you believe one is needed, STOP and ask.

## How to run this prompt (important)
Work in phases. After EACH phase: commit, run the checks listed for it, write the AGENTS.md section 10 report, then STOP and wait for the owner to say "GO R<next>". Never start the next phase on your own. One branch per phase: feat/r0-audit, feat/r1-theme, feat/r2-home, feat/r3-stories, feat/r4-qa, feat/r5-ship, each from main after the previous phase is merged by the owner's instruction. One commit per item. No push until the owner says so.

Reporting rules (they were broken before, so they are strict): paste only real terminal output, never retype it; use the real TEST ids from docs/plan.md; give evidence for every PASS; never write "verified earlier"; never claim a visual fix without viewing the screenshot and saying what you saw; list every deviation. If a file or fact is missing, STOP and say so. Do not invent numbers, features or copy. All site text comes from docs/content-v2.md.

## Facts that must hold in every phase
1. Name "Ramakrishna" only. No photo. No phone number.
2. Zero gradients, blurs or glows (npm run check:flat must pass; extend it only to add checks, never to loosen).
3. No em dash character anywhere in site copy or content files. Add scripts/check-copy.mjs plus npm run check:copy that fails on the em dash character and on the banned phrases listed in docs/content-v2.md (scan src/ and docs/content-v2.md). Add it to the final checks.
4. Content works with JavaScript off (the contact form needs JS: DEC-011). Theme falls back to the OS setting without JS.
5. NDA: never link or describe the SonicVocal product site beyond the text in content-v2.
6. Items marked [GATED] or [OPEN] in content-v2.md are NOT published. Report each one you left out.
7. Security headers and the /api/contact route (zod, honeypot, 10 KB limit, Origin check, rate limit, Resend, content.md error text) must not change except for text. Do not touch .env.local. Never print keys.
8. Keep routes: /, /work/restart-options, /work/vouch, /work/mcp-gateway, /work/zync, /api/contact, /resume.pdf, /robots.txt, /sitemap.xml, /opengraph-image. Keep every external link in src/content/stories.ts unless content-v2.md gives a new one.

## PHASE R0: audit and facts (no site changes)
1. git status clean on main. Create feat/r0-audit.
2. Write docs/audit-v1.md (your own inspection, real facts only): routes, components, CSS size, dependencies, test count by file, every external link and whether it returns 200 (use the existing link test or a one-line fetch per link), current meta tags per page.
3. DOMAIN CHECK: report the value of NEXT_PUBLIC_SITE_URL as used in the built HTML of the local build (canonical, og:url, sitemap). The real live address is https://rramakrishna.vercel.app (two r). The live page currently shows canonical https://ramakrishna.vercel.app. Say what the code does when the variable is set, and give the owner the exact Vercel environment variable change needed. Do not change Vercel yourself.
4. TEST COUNTS: look for the local project repos (restart, zync, vouch, urumi-mcp-gateway, SonicVocal is out of scope) under C:\Users\91937\Documents. For each one you find, read package.json test scripts and run them, one per call, and paste the real summary lines. Needed: Vouch server tests and Playwright tests; MCP gateway, dashboard, WooCommerce server and FX server tests (the dated run on 2026-11-19 said 497, 396, 225 and 94 = 1,212; the owner's newer notes say the gateway has 185 unit tests and the total is 900). If a repo is not found or a test run fails, say so and do not guess. Also look in each repo for the hackathon wording and the Vouch cold-start benchmark (931 ms vs 10 to 12 s) and report what the files actually say, with file paths.
5. Compare src/components/Skills.tsx against the skills in docs/content-v2.md and list every difference.
6. Commit docs/audit-v1.md only. STOP. Report.

## PHASE R1: tokens, theme and shell
Build exactly docs/design-v2.md sections Tokens, Typography, Layout, Theme system, Motion (base), and components Header (with ThemeToggle and Resume link), Footer, BackToTop, SkipLink, CommandPalette, not-found, layout.tsx. Content of the page body is NOT redesigned yet: the old sections just need to stay readable with the new tokens (temporary styling is fine, they are replaced in R2).
Checks: lint, typecheck, unit tests, check:flat, check:copy, build. New e2e e2e/theme.spec.ts: (a) with an OS dark preference and no saved choice the page is dark, with light preference it is light, (b) clicking the toggle changes the theme, saves "theme" in localStorage, and the choice survives a reload and navigation to /work/zync and back, (c) the inline script runs before first paint: load with localStorage theme=dark and prefers-color-scheme light and assert that the first screenshot or the computed background right after DOMContentLoaded is already dark (no flash), (d) the toggle has the correct aria-label for each state and works with Enter and Space, (e) with JavaScript disabled the OS theme applies. Screenshots of header and footer in both themes at 375 and 1280, which you must open and describe. Add the new tests to docs/plan.md as TEST-014 (theme), TEST-015 (axe on all pages in both themes), TEST-016 (no horizontal scroll at 375, 768, 1024, 1280, 1440 in both themes), TEST-017 (check:copy). Update existing e2e tests that break because of restyling; do not weaken them. Merge-ready commit, then STOP.

## PHASE R2: home page
Build docs/design-v2.md "Components" for Hero, WorkGrid and ProjectCard, Experience, Skills, About, Contact exactly with the copy in docs/content-v2.md. Delete ProofStrip, CountUp and their tests. Hero must fit 1280x720 without scrolling, and must not contain a stats table or trading headline. Card order: Restart Options, Vouch, Team MCP Gateway, Zync. Book My Nest compact row. Update src/content/stories.ts so the cards read from it (extend the type; do not duplicate text). Update e2e tests so they compare against docs/content-v2.md text, keeping the old test names. Contact keeps the existing form and behaviour; add the email and resume links.
Checks: all of R1 plus e2e for the home page at five widths in both themes (screenshots of every section at 375 and 1280 in both themes: open and describe at least hero, one card, experience, contact). STOP.

## PHASE R3: story pages
Rebuild /work/[slug] with the nine-part structure and the four diagrams from docs/content-v2.md and docs/design-v2.md. Diagrams are inline SVG using tokens, with role="img" and a text alternative, and must say only what content-v2.md says. Pager order: restart-options, vouch, mcp-gateway, zync, wrapping. generateStaticParams stays. Keep JSON-LD BreadcrumbList.
Honest notes ("This project automates execution...", "The model does not guarantee...", MCP "What I would harden next") are required. Gated items stay out unless the owner has said GO with approved values (the owner's reply to the R0 report will list them).
Checks: all of R2 plus story e2e for all four pages, both themes, five widths, axe both themes, diagram screenshots at 375 and 1280 which you open and describe. STOP.

## PHASE R4: SEO, QA, content promotion
1. Promote: copy docs/content-v2.md over docs/content.md, adding back the "Form messages" section that exists in the current content.md (do not lose it). Update TEST-013 to compare the built HTML numbers against the new content.md.
2. SEO: titles under 60 (home) and under 75 (stories), descriptions under 160 (count them in the test), canonical from NEXT_PUBLIC_SITE_URL, Open Graph, Twitter, favicon, sitemap (5 URLs), robots, JSON-LD (WebSite, Person with addressCountry India and no phone or street, BreadcrumbList). Restyle opengraph-image.tsx per design-v2.md and view og.png.
3. Full run, one command per call: lint, typecheck, npm test, check:flat, check:copy, build, full npm run e2e. Then Lighthouse on the production build (desktop and mobile, three runs for mobile, median) for /, /work/restart-options, /work/vouch, /work/mcp-gateway, /work/zync in light AND dark if possible (emulate prefers-color-scheme). Targets: Performance 90 or more mobile, 95 or more desktop, Accessibility, Best Practices and SEO 100. First-load JS per page, real number. Report any page that misses and why.
4. TEST-013 equivalent for the new copy: a test that extracts every number in the built HTML of the five pages and checks it appears in docs/content.md.
STOP.

## PHASE R5: resume and ship
1. The planner will place the new public/resume.pdf. You only verify it opens (200, application/pdf), check git tracks it, and keep the download link working. Do not edit the PDF.
2. Update docs/status.md, docs/decision-log.md (DEC-014 redesign direction, DEC-015 email now shown on site), docs/plan.md.
3. Merge branches to main in order with --no-ff. Ask the owner before pushing. Push only after the owner says yes. After Vercel deploys, run a live check (the live URL will be given by the owner): all five pages 200, canonical equals the live address, og:image loads, /resume.pdf is a PDF, sitemap and robots, the contact form sends ONE real test message. Report real output. STOP.

## Final acceptance (the planner and owner will check these)
Content accuracy against docs/content.md; every number traceable; no gated item published; first screen readable without scrolling; mobile usable at 375; both themes correct on every page; theme persists across pages and reloads with no flash; all project links work; resume downloads; contact form works; keyboard and focus visible everywhere; axe zero violations in both themes; no horizontal scroll at five widths in both themes; build, lint, tests, e2e all green; Lighthouse targets or an explained miss; no em dash, no banned phrase, no gradient.
