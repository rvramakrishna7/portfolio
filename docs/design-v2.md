# Design v2: Apple-style restraint, light and dark

Status: written by the planner on 2026-11-21. Supersedes docs/design.md for look and motion. Keep from docs/design.md: system fonts only (no webfont downloads), zero gradients, the skip link, the Ctrl+K palette, the contact form, works-without-JS for all content. The earlier blueprint grid, amber accent, serif headings and slit-opening chapters are retired (owner decision 2026-11-21, DEC-014).

## OWNER OVERRIDES 2026-11-21 (these win over anything below)
The owner said "Apple style" means clean and appealing, NOT a full redesign. Keep the old site's identity and structure. Change only what is listed here.
KEEP from the current site: the blueprint-grid hero (inline SVG pattern lines, no gradient) with the title block at the bottom right; the chapter layout in the Work section (sticky left column on 900px and wider, panel on the right) with the slit-opening reveal and its fallbacks; the proof strip with "How was this measured?" toggles and the integer count-up on the test number; the Ctrl+K palette; the floating pill header; mono labels; the italic serif hook line at the top of each chapter panel (system serif stack, this is the ONLY serif use); the reading-progress bar; the sticky layout of Experience, Skills and Contact; the 404 style.
CHANGE: (1) Colours move to the tokens below, with a real light and dark theme and a toggle. (2) The accent is blue (#0071E3 light, #2997FF dark) everywhere amber was used; amber is removed (it fails contrast on white). (3) Headings use the system sans stack, weight 650, tighter tracking, instead of serif. (4) Slightly more whitespace and a calmer rhythm: section padding clamp(4rem, 9vw, 8rem), card radius 18px, 1px borders, no shadows in dark. (5) The blueprint grid lines use --border at low opacity so they work in both themes and stay subtle in light mode. (6) New copy and the new project order from docs/content-v2.md. (7) The status dot stays green (--ok).
Ignore any later line in this file that tells you to delete ProofStrip, CountUp or ChapterReveal, to build a card grid (WorkGrid, ProjectCard), or to remove the blueprint hero. Work stays as chapters: left column (number, title, category, tags), right panel (italic hook, The problem, What I built, results, links). Story pages keep the old layout but with the nine-part structure.

## Tokens (src/styles/tokens.css; nothing else may hard-code a colour)
| Token | Light | Dark |
|---|---|---|
| --bg | #F5F5F7 | #0B0B0D |
| --card | #FFFFFF | #161618 |
| --text | #1D1D1F | #F5F5F7 |
| --text-2 | #6E6E73 | #A1A1A6 |
| --text-3 | #86868B | #86868B |
| --border | #D2D2D7 | #303034 |
| --accent | #0071E3 | #2997FF |
| --accent-ink | #FFFFFF | #0B0B0D |
| --ok | #1B7F3A | #5FD07F |
| --error | #C4291C | #FF8A7A |

Contrast rules (WCAG AA): normal text 4.5:1, large text (24px, or 19px bold) 3:1, UI borders that carry meaning 3:1. Known risk: --text-3 on white is about 3.5:1, so use --text-3 only for large text or purely decorative labels, and use --text-2 for small metadata. Check accent text on --card and on --bg in both themes with axe plus a computed-ratio assertion. If a token fails, darken it minimally, record the new value in tokens.css and in the report. Do not ask permission for that.

## Typography (system stack only, no downloads)
- Font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif
- Mono (technical labels only, sparingly): ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace
- Scale with clamp(): hero h1 clamp(2.25rem, 5.6vw, 4.25rem), weight 650, line-height 1.08, letter-spacing -0.02em. Section h2 clamp(1.75rem, 3.6vw, 2.75rem), weight 650, -0.015em. Card headline clamp(1.35rem, 2.2vw, 1.75rem), weight 600. Body 1.0625rem (17px), line-height 1.55. Metadata 0.875rem. Labels 0.8125rem uppercase with 0.06em tracking.
- Reading width: paragraphs max 62ch. Headings use text-wrap: balance. Body text uses text-wrap: pretty.

## Layout and spacing
- Container 1120px max, side padding clamp(1.25rem, 5vw, 3rem). Spacing scale 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 (px, as CSS variables). Section vertical padding clamp(4rem, 9vw, 8rem).
- Radius 18px for cards, 12px for buttons and inputs, 999px for pills. 1px borders using --border. No shadows in light mode except a very soft 0 1px 2px rgba(0,0,0,0.04) on cards; no shadows in dark mode.
- Hero: fits one 1280x720 screen without scrolling. Text is left aligned. The h1 must not exceed 3 lines at 1280px and 5 lines at 375px.
- Work cards: desktop 2 columns (2x2 grid), tablet 2 columns, mobile 1 column. Card padding clamp(1.25rem, 2.5vw, 2rem). Each card is one block with these rows: number and category, headline, "The problem", "What I built", metrics row (1 to 2 metrics), tags, links. Whole-card hover only lifts the border colour; do not move the card.
- Metrics: value in 1.75rem weight 650, label in --text-2 0.875rem.
- Experience: two columns on wide screens (role and problem on the left, numbered list on the right), one column below 900px. NDA note in a card with a dashed --border.
- Skills: eight groups in a 2 or 4 column definition grid. Plain text lists, no logos, no coloured chips. Group label in mono uppercase --text-2.
- About: two columns (copy, then education and certifications card).
- Contact: left copy and links, right form. Same form styles as today, restyled with the new tokens.
- Header: sticky, full-width bar, 56px tall, 1px bottom border, solid --bg (NO blur, NO backdrop-filter). Left brand, centre links (Work, Experience, Skills, Contact; Skills and Experience hide below 640px), right: Jump to (Ctrl K), theme toggle, Resume. On phones collapse to brand, theme toggle, Contact.

## Theme system (all of these are required)
1. Three states in code: "light", "dark", and no saved choice (follow the OS).
2. CSS: define light variables on :root. Dark variables in @media (prefers-color-scheme: dark) on :root:not([data-theme="light"]), and also on :root[data-theme="dark"]. Add <meta name="color-scheme" content="light dark"> and CSS color-scheme. Without JavaScript the page still follows the OS theme.
3. No flash: a tiny inline script in <head> (before any stylesheet paint) reads localStorage key "theme" inside try/catch and sets document.documentElement.dataset.theme to "light" or "dark" only when a value is saved. In Next.js App Router, put it in layout.tsx as a <script> with dangerouslySetInnerHTML in <head>, and add suppressHydrationWarning on <html>. The current CSP has no script-src, so inline is allowed; do NOT add a script-src.
4. Toggle: a <button type="button"> in the header. aria-label "Switch to dark theme" or "Switch to light theme" (the next state), aria-pressed NOT used. Icon is inline SVG (sun or moon), 44x44px hit area, visible focus ring (2px --accent, 2px offset). Click sets data-theme, saves to localStorage (try/catch), updates the aria-label and the theme-color meta. First click from "follow the OS" goes to the opposite of the current OS theme.
5. Keep the choice across pages (the script runs on every page load). Listen to matchMedia changes only while no choice is saved.
6. Transition: only background-color, color and border-color, 200ms ease, and none under prefers-reduced-motion. Disable transitions during the first paint (add a class after load) so the page does not animate in.
7. Every page and component must look correct in both themes, including the 404 page, forms, the palette dialog, focus rings and the OG image.

## Motion (subtle, all optional)
- Sections and cards fade up 12px over 500ms once when they enter the viewport (IntersectionObserver adds a class). Content is visible with JS off and under reduced motion. No clip-path slits, no count-up, no parallax, no pulsing, no cursor effects.
- Keep the thin reading-progress bar at the top (2px, --accent).
- Buttons: 150ms background change. Links: underline offset change.

## Components to build or change (reuse names where they exist)
- tokens.css and globals.css: rewrite on the new tokens. Remove amber, blueprint patterns and serif.
- layout.tsx: theme script, theme-color meta, new metadata.
- Header.tsx: new bar, ThemeToggle (new component), Resume link.
- Hero.tsx: new copy and layout; delete ProofStrip.tsx and CountUp.tsx and their tests.
- Work.tsx and ChapterReveal.tsx: replace with WorkGrid and ProjectCard (ChapterReveal may be reused as a simple Reveal).
- Experience.tsx: new copy, 7-item numbered list.
- Skills.tsx: eight groups.
- About.tsx: new component.
- Contact.tsx and ContactForm.tsx: new copy and links, same behaviour.
- Story page template: the nine-part structure in docs/content-v2.md, plus small inline SVG diagrams (BeforeAfterBars for Restart Options, VouchPipeline, McpArchitecture, ZyncMediaFlow). Diagrams use tokens only, have role="img" with a text alternative, and stay readable at 375px (stack vertically on small screens). They must match the facts in docs/content-v2.md and nothing else.
- src/content/stories.ts: extend the Story type with the new fields (category, headline, problem, whyItFellShort, built, decisions, reliability, results with method, note, links); keep slugs and URLs; new order restart-options, vouch, mcp-gateway, zync.
- CommandPalette.tsx: restyle, same keyboard behaviour, add Resume and About.
- Footer.tsx, BackToTop.tsx, not-found.tsx: restyle.
- opengraph-image.tsx: dark flat card, five word items with the 11px gap pattern from DEC-013.
