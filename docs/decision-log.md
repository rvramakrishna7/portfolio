# Decision log

| ID | Date | Decision | Status |
|---|---|---|---|
| DEC-001 | 2026-11-20 | Stack: Next.js (App Router) with TypeScript, plain CSS tokens, zod. Not a plain React single-page app, because search engines and recruiters' link previews need real HTML from the server. Not Python: a portfolio is mostly front end and Python adds nothing. No MongoDB: the site stores no data, so a database would only slow it down. | Accepted |
| DEC-002 | 2026-11-20 | Flat design with no gradients of any kind (owner's rule). `npm run check:flat` enforces it. | Accepted |
| DEC-003 | 2026-11-20 | Look: dark, one amber accent, blueprint grid hero drawn with SVG lines, full-screen opening statement, chapters that open on scroll, command palette. Based on the owner's picks (lelandjansen.com and tamalsen.dev). | Accepted |
| DEC-004 | 2026-11-20 | Hosting: Vercel Hobby (free). Code on GitHub. | Accepted |
| DEC-005 | 2026-11-20 | Contact form posts to our own `/api/contact`, which forwards to Web3Forms using a server-side access key. No email address is shown on the site. | Accepted |
| DEC-006 | 2026-11-20 | All site copy and numbers come only from `docs/content.md`. Numbers come from the repos, the 2026-11-19 test run, or the owner's hand timing. | Accepted |
| DEC-007 | 2026-11-20 | NDA: the SonicVocal product site is never linked or described. The company name and the owner's own work are allowed. | Accepted |
| DEC-008 | 2026-11-20 | Name on the site is "Ramakrishna" only. No photo, no phone number. | Accepted |
| DEC-009 | 2026-11-20 | Motion: CSS scroll-driven animation where supported, IntersectionObserver fallback, nothing under reduced motion. No animation library. | Accepted |
| DEC-010 | 2026-11-20 | Open question for the owner: a site he remembers where something opens as you scroll. Not found yet. The chapter-opening effect is the current answer. | Proposed |
| DEC-011 | 2026-11-20 | Without JavaScript the contact form cannot send; LinkedIn and GitHub links sit beside it. Accepted by the planner. | Accepted |
| DEC-012 | 2026-11-20 | Contact delivery moved from Web3Forms to Resend because Web3Forms free plan blocks server-side calls; DEC-011 otherwise unchanged. | Accepted |
| DEC-013 | 2026-11-20 | OG image tagline rendered as five flex word items with 11px column gap because Satori ignores CSS word-spacing on plain text runs. | Accepted |
| DEC-014 | 2026-11-21 | Redesign: clean Apple-like palette, light/dark toggle, blue accent, system fonts, old structure and identity kept (blueprint hero, chapters, proof strip, flat design with zero gradients). | Accepted |
| DEC-015 | 2026-11-21 | NO email address anywhere on the site. Contact is the form, LinkedIn, GitHub and the resume. | Accepted |
| DEC-016 | 2026-11-21 | Mobile Lighthouse Performance 83 to 87 accepted by the owner as a known limitation (reason: React 19 hydration runtime evaluation TBT 520 to 710 ms under simulated 4x CPU throttle; FCP/LCP 0.8 s, CLS 0; desktop 99 to 100; A/BP/SEO 100). | Accepted |
