# Plan: Portfolio site

One step at a time. Do not start a step until the owner approves the previous one.

| Step | Name | What gets built |
|---|---|---|
| S0 | Scaffold | Next.js + TypeScript app in this folder, scripts, tokens file, `check:flat`, `.env.example`, git, empty home with one H1. No real content yet. |
| S1 | Shell and design system | Global styles, header pill, command palette, footer, back-to-top, progress bar, skip link, 404 page. |
| S2 | Hero and proof strip | Home hero with the SVG blueprint grid and title block, the four proof cards with the "how measured" toggle. |
| S3 | Four chapters | Work section with the opening-panel effect, from `docs/content.md`. |
| S4 | Story pages | `/work/[slug]` for the four stories with pager and breadcrumbs. |
| S5 | Experience, skills, contact | Remaining home sections and the contact form with its API route. |
| S6 | SEO and sharing | Metadata for every page, JSON-LD, sitemap, robots, Open Graph image. |
| S7 | Quality pass | Responsive at five widths, accessibility, Lighthouse targets, full Playwright suite. |
| S8 | Deploy | GitHub repo, Vercel Hobby project, environment variables, live checks. |

## Acceptance tests (a step only claims the tests it actually touches)
- TEST-001 `npm run lint`, `npm run typecheck`, `npm run build` all exit 0.
- TEST-002 `npm run check:flat` exits 0 (no gradient anywhere in `src/` or `public/`).
- TEST-003 With JavaScript disabled, every heading, paragraph, number and link from `docs/content.md` for the touched sections is present in the page.
- TEST-004 With `prefers-reduced-motion: reduce`, nothing is hidden and nothing animates.
- TEST-005 No horizontal scroll at 375, 768, 1024, 1280, 1440 px, on every page.
- TEST-006 Visible text never contains `undefined`, `null`, `NaN`, `[object Object]`, `Lorem`, `TODO`, `YOUR_`.
- TEST-007 Keyboard: Ctrl/Cmd+K opens the palette, typing filters, Enter navigates, Escape closes and returns focus. Tab order is logical and focus is always visible.
- TEST-008 Accessibility: axe finds no violations on every page at 375 and 1440 px.
- TEST-009 SEO check on every built page: unique title (home under 60 chars; story pages under 75, project name first), description under 160, one h1, canonical, Open Graph and Twitter tags, valid JSON-LD, listed in `sitemap.xml`.
- TEST-010 Contact form: valid input shows the success text (API mocked in the test); invalid input shows field errors; a filled honeypot is accepted silently and never forwarded; over-limit requests are refused. Real email delivery is `PENDING OWNER CHECK`.
- TEST-011 Lighthouse on a production build meets the targets in `AGENTS.md` section 7c, mobile and desktop, with the real scores pasted.
- TEST-012 Every internal link returns 200. Every external link is listed in the report.
- TEST-013 Every number on the site matches `docs/content.md` exactly (the planner checks this by reading the built HTML).
- TEST-014 Theme system (e2e/theme.spec.ts): OS preference applies without saved choice; toggle switches theme, saves in localStorage, and survives reload and cross-page navigation; inline head script prevents flash of unstyled content; toggle has correct aria-label for next state and responds to Space and Enter; OS theme applies cleanly with JavaScript disabled.
- TEST-015 Accessibility in both themes: axe scan finds zero violations across all built pages (home, 4 stories, not-found) in both light and dark themes; computed color contrast asserts WCAG AA compliance.
- TEST-016 Responsive in both themes: zero horizontal scroll at 375, 768, 1024, 1280, 1440 px in both light and dark themes; header, footer, and hero screenshots captured.
- TEST-017 Copy and character audit: `npm run check:copy` exits 0 (no em dash character `\u2014` and no banned buzzwords in `src/` or content specs).
- TEST-018 Story pages nine-part structure and diagrams (e2e/stories.spec.ts): metadata under limits, exactly one h1, nine-part layout, inline SVG diagrams with role='img' and titles, results table with measure/value/howMeasured, honest notes, tech chips and links, bidirectional pager order (restart-options > mcp-gateway > vouch > zync > restart-options), and content safety scan (zero email, zero mailto, zero unconfirmed hackathon claims).
