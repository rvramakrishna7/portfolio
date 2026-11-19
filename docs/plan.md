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
- TEST-009 SEO check on every built page: unique title under 60 chars, description under 160, one h1, canonical, Open Graph and Twitter tags, valid JSON-LD, listed in `sitemap.xml`.
- TEST-010 Contact form: valid input shows the success text (API mocked in the test); invalid input shows field errors; a filled honeypot is accepted silently and never forwarded; over-limit requests are refused. Real email delivery is `PENDING OWNER CHECK`.
- TEST-011 Lighthouse on a production build meets the targets in `AGENTS.md` section 7c, mobile and desktop, with the real scores pasted.
- TEST-012 Every internal link returns 200. Every external link is listed in the report.
- TEST-013 Every number on the site matches `docs/content.md` exactly (the planner checks this by reading the built HTML).
