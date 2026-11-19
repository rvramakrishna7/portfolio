# Design: how the site looks and behaves

Locked by the owner: likes the **blueprint-grid opening** of lelandjansen.com and the **full-screen opening statement with subtle reveals** of tamalsen.dev. **No gradients at all.** Flat, dark, one accent colour. A visual reference built by the planner is in `reference/prototype/` (open `index.html` through a local server to see it). Match its look; do not copy its files.

## Tokens (put these in `src/styles/tokens.css` as CSS variables, nothing else may hard-code colours)
| Token | Value | Use |
|---|---|---|
| --bg | #0b0d10 | page |
| --panel | #11141a | cards, header, dialog |
| --panel-2 | #171b22 | hover, result cells |
| --line | #262c35 | thin borders |
| --line-2 | #363e4a | stronger borders, big chapter numbers |
| --text | #ece8df | main text |
| --muted | #9aa2ad | secondary text |
| --accent | #f2b705 | the one accent: buttons, highlights, labels |
| --accent-ink | #1a1400 | text on accent |
| --ok | #7bd88f | success, the status dot |
| Error text | #ff8a7a | form errors |

Fonts: **system stacks only**. Headings: `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. Body: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Labels and numbers: `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace`. No webfont downloads.
Layout: max width 1180 px, side padding `clamp(1.1rem, 4vw, 3rem)`. Fluid type with `clamp()`. Headings use `text-wrap: balance`.

## Page structure (home, in order)
1. **Skip link**, thin amber **reading-progress bar** at the very top.
2. **Floating header**: a pill, centred, fixed. Brand text "Ramakrishna". Links Work, Experience, Skills (hidden on phones), a "Jump to" button showing the hint "Ctrl K" (hint hidden on phones), and a primary Contact button.
3. **Hero**, full screen (`100svh`). Background is a **blueprint grid drawn with inline SVG `<pattern>` lines** (minor cell 32 px, major cell 160 px, both thin solid lines, no gradient). Content: status pill with a small green dot (pulses only if motion is allowed), the H1 with "a few seconds" in the accent colour, the intro paragraph, two buttons. Bottom right: a **blueprint title block** (small bordered table). Bottom left: scroll cue. On phones the title block sits below the content, not over it.
4. **Proof strip**: four cards in an auto-fit grid. Big accent number, a one-line meaning, and a "How was this measured?" toggle that reveals the sentence from `docs/content.md`. Only the integer 1,212 counts up; ranges and arrows are static text.
5. **Work**: heading, then four chapters. Each chapter: left column (big muted chapter number, title, tag, tech chips) that stays sticky on screens 900 px and wider; right column is the **panel** (hook line in italic serif, Problem, What I did, Result cells, links: Read the full story, Open the live site (if any), See the code).
6. **Experience**: two columns (left: role, company, intro, NDA note in a dashed box; right: numbered list).
7. **Skills**: definition list with mono labels, then Education and Certifications boxes.
8. **Contact**: left (heading, text, three big links), right (form).
9. **Footer** and a round back-to-top button after 700 px of scroll.

## Story pages (`/work/[slug]`)
Breadcrumb, mono tag, H1 with the project title, the hook, chips, then sections in a two-column layout on wide screens: The problem, The constraint, What I did, The result, Proof. A pager (previous / next story) at the bottom. 404 page in the same style.

## Motion (all optional, all off under reduced motion)
- **Chapters open as you scroll**: the panel starts as a thin vertical slit (`clip-path: inset(0 50% 0 50%)`) and opens to full width (`inset(0)`). Where `animation-timeline: view()` is supported, scroll position drives it; otherwise an IntersectionObserver adds a class and a 1 s transition does it. The left column fades up. Without JavaScript or under reduced motion, everything is simply visible.
- Count-up on 1,212 only. Pulse on the status dot. Header border brightens after the first 20 px of scroll.
- Nothing else moves. No parallax, no cursor effects, no auto-playing anything.

## Command palette (a surprise for developers)
`<dialog>` opened by Ctrl/Cmd+K or the Jump to button. A search box and a list: Work, each of the four stories, Experience, Skills, Contact, LinkedIn, GitHub. Typing filters, Enter opens the first match, ArrowDown moves into the list, Escape closes and focus returns to the button.

## Banned
Gradients of any kind, glow or blurred shadows, glassmorphism, stock photos, emoji in the UI, icon fonts, carousels, auto-play video or sound, cookie banners (the site sets no cookies), Lorem ipsum, any person's photo.

## Responsive notes
Phones (up to 760 px): hide inline nav links, keep brand + Jump to + Contact; at 420 px and below hide the Jump to button label if it crowds the header. Result cells go to two columns at 420 px and below. All tap targets at least 44 px. Test at 375, 768, 1024, 1280 and 1440 px.
