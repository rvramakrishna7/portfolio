# AGENTS.md: Rules for the Portfolio workspace

These rules apply to every task in this workspace. Read this file fully before you act. If an instruction in a task prompt conflicts with this file, STOP and ask.

> **ZERO TOLERANCE.** Every rule in this file is mandatory, not advice. The owner and Claude check every report against this file. A report that breaks any rule is **REJECTED** and the task is redone, even if the feature works. Section 11 lists mistakes this same agent already made on the owner's other project (Vouch). Repeating one of them is the most serious failure.
>
> **First line of every task reply:** `AGENTS.md read in full. Rules I must watch in this task: <list section numbers>.`

## 1. Who does what
| Role | Who | Responsibility |
|---|---|---|
| Owner | Ramakrishna | Final say. Approves scope and merges. Checks live pages by hand. |
| Planner / reviewer | Claude (chat, no repo access) | Plans steps, writes your task prompts, reviews your reports, keeps the decision log. |
| Worker | You (Antigravity agent) | Do ONLY the approved task. Inspect, write code, run real commands, test, report verbatim. |

You do not make product, design or architecture decisions. If a choice is needed, propose it as a `DEC-xxx (Proposed)` entry in your report and wait. Before proposing, re-read `docs/decision-log.md` from disk and use the next free number.

## 2. Read before every task (in this order)
1. `AGENTS.md` (this file)
2. `docs/status.md` (where we are, what is next)
3. `docs/decision-log.md` (decisions already taken; never contradict an Accepted one)
4. `docs/plan.md` (steps and acceptance tests)
5. `docs/design.md` (the look and the page structure)
6. `docs/content.md` (the ONLY source of every word, number and link on the site)

## 3. Product in one paragraph
A personal portfolio site for Ramakrishna, a full-stack and AI automation developer in Mumbai, aimed at recruiters and hiring managers. It tells four project stories as problems solved, each with measured results, plus experience, skills and a contact form. The goal is a site that feels memorable in ten seconds, loads instantly, and ranks well in search.

## 4. Non-negotiable invariants
1. **Identity.** The name is **Ramakrishna** only. No photo of any person. No phone number. No email address anywhere on the site (contact is the form plus LinkedIn). 
2. **NDA.** Never link to, name the domain of, or describe the look of the SonicVocal live product. The company name and the owner's own work, as written in `docs/content.md`, are allowed.
3. **Content comes only from `docs/content.md`.** Never invent, round, reword a number, "improve" a claim, or add a metric from memory. If the text you need is not there, STOP and ask.
4. **No gradients. Ever.** Banned anywhere (CSS, inline styles, SVG, images you generate): `linear-gradient`, `radial-gradient`, `conic-gradient`, `repeating-*-gradient`, SVG `<linearGradient>` or `<radialGradient>`, glow effects made with blurred shadows, glassmorphism blur. Solid colours only. `npm run check:flat` must pass and be part of every report.
5. **No visible placeholders.** No "Lorem", "TODO", "YOUR_", "example.com" or empty sections in the rendered site.
6. **Content works without JavaScript.** All text is in the HTML sent by the server. Animation and the command palette are enhancements only.
7. **Motion respects `prefers-reduced-motion`.** With reduced motion, nothing animates and nothing is hidden.
8. **Free only.** Hosting is Vercel Hobby. No paid service, no new third-party service, no analytics or tracking script, without an Accepted DEC.
9. **Stack is locked** (DEC-001): Next.js (App Router, TypeScript), plain CSS with design tokens, zod for validation. No Tailwind, no UI kit, no animation library, no font download. Any new dependency needs a Proposed DEC first.
10. **Secrets** live only in `.env.local` (git-ignored) and the Vercel dashboard. Commit `.env.example` with empty values.

## 5. Scope discipline
- Build only what the task prompt names. No "while I'm here" changes, no extra pages, no extra sections.
- Do not start the next step in `docs/plan.md` until the owner approves this one.
- If something takes much longer than the prompt expects, or a command fails twice, STOP and report. Do not improvise.
- `reference/prototype/` is a design reference made by the planner. You may read it to match the look. You must not copy files from it blindly: port the ideas into the Next.js structure and tests. Never serve it.

## 6. How you work (every task)
1. **Inspect** the files you will touch. Never edit from memory.
2. **Plan**: list the files you will create or change, then do it.
3. **Implement** the smallest change that works.
4. **Run the real commands** of this repo (lint, typecheck, test, build, check:flat). Never claim a command passed without running it.
5. **Verify** the behaviour in a real browser (Playwright) and record exact output.
6. **Update** `docs/status.md`. Never mark a test PASS without evidence.
7. **Report** using the format in section 10.

STOP and report when: a precondition fails, a secret is needed, a command fails twice, a requirement is unclear, or the task conflicts with this file or the decision log.

## 7. Honest reporting (mandatory)
1. A test is PASS only if you ran it in THIS task and pasted its output. A successful build is NOT a test pass.
2. Use exactly one of: `PASS (evidence: <command/output>)`, `FAIL`, `NOT RUN`, `PENDING OWNER CHECK`.
3. **Never write command output from memory.** Paste the real output, or write NOT RUN. Never invent versions, file names, counts, timings or test totals.
4. If a command exits with a non-zero code, say so and paste its output. Never report only the commands that passed.
5. A missed target (speed, score, width) is **FAIL** with the real numbers, never "ok".
6. Never write names, numbers or links from memory. Copy them from `docs/content.md` or from command output.
7. If you are not sure something works, say so. "Not verified" beats a wrong PASS.

## 7a. UI Definition of Done
1. Every task that changes UI adds or updates a **Playwright test** that does what the owner will do (open the page, scroll, click, press keys). Run it headless and paste the output verbatim.
2. Save a full-page screenshot per key step at **375, 768, 1024, 1280 and 1440 px** in `e2e/screenshots/` (git-ignored) and list the paths.
3. **Look at your own screenshots** before reporting. Anything empty, cut off, overlapping, or placeholder-like is a FAIL. Fix it first.
4. The page must never show `undefined`, `null`, `NaN`, `[object Object]`, `Lorem`, `TODO`, raw JSON, or `Invalid Date`. The test must assert this on visible text.
5. A UI task is DONE only if the build passes AND the Playwright test passes AND the screenshots look right. Otherwise Status = PARTIAL.

## 7b. Responsive (every page, every task)
1. Works at **375, 768, 1024, 1280 and 1440 px**. No horizontal page scroll at any width: `document.documentElement.scrollWidth <= clientWidth`, asserted in the test.
2. Touch targets at least 44 px high on phone. Body text never below 16 px. Nothing overlaps or is cut off.
3. Long words, URLs and numbers wrap or truncate with the full value in a `title`.
4. One spacing scale (4, 8, 12, 16, 24, 32, 48, 64 px) and the tokens in `docs/design.md`. No magic numbers.

## 7c. Speed and quality targets (measured, not guessed)
Measure on a **production build** (`npm run build && npm start`) with Lighthouse, mobile and desktop presets, and paste the scores.
- Performance: desktop >= 95, mobile >= 90. Accessibility 100. Best Practices >= 95. SEO 100.
- JavaScript on the home page: under 150 KB gzipped. No layout shift (CLS under 0.05).
- Images: only if needed, with `width`/`height`, modern formats, and `alt` text. Fonts: system stacks only.
If a target is missed, report FAIL with the numbers and what you will do about it. Do not lower the target.

## 7d. SEO (every page)
Unique `<title>` (under 60 characters) and meta description (under 160), one `<h1>`, canonical URL, Open Graph and Twitter tags, `lang="en"`, semantic landmarks (`header`, `main`, `nav`, `footer`), descriptive link text, valid JSON-LD (Person on the home page, BreadcrumbList on story pages), `sitemap.xml`, `robots.txt`, a `noindex` 404 page. A test must check these on every built page.

## 7e. Accessibility
Skip link, visible focus on every control, full keyboard use (the palette opens with Ctrl/Cmd+K and Escape closes it and returns focus), correct heading order, colour contrast WCAG AA (check with axe in the Playwright test), buttons for actions and links for navigation, `aria-expanded` on toggles.

## 7f. Files and commands safety
1. Work only inside this folder. Never read, edit or delete anything outside it.
2. Never run `rm -rf`, delete folders, or overwrite `AGENTS.md`, `docs/` or `reference/` unless the task says so.
3. Temporary scripts and generators (for example `create-next-app`) must be listed in the report with file name and purpose, even if you delete them afterwards.
4. Never open, print or commit secrets. If you need one, STOP and ask.

## 8. Git rules
- One task = one branch (`feat/...`, `fix/...`, `docs/...`, `chore/...`). Merge to `main` with `git merge --no-ff` only after the task's checks pass and the owner approves.
- `git add <specific files>` only, never `git add .` or `-A`. Check `git diff --staged` before committing.
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
- **Forbidden without explicit owner approval:** `git push --force`, `git reset --hard`, `git clean -fd`, `git branch -D`, rewriting pushed history.

## 9. Security
- Contact route: validate every field with zod, cap the body size, include a honeypot field, add a simple rate limit, send the access key only from the server, never log message content or keys.
- Add standard security headers in `next.config` (no inline scripts unless a nonce is used).
- No `dangerouslySetInnerHTML` with anything that is not a fixed string you wrote.
- External links use `rel="noopener noreferrer"`.

## 10. Report format (end every task with this, exactly)
```
## REPORT: <task name>
Status: DONE | PARTIAL | BLOCKED
Branch / commit: <branch> / <short hash>
Files changed: <list>
Commands run and results (VERBATIM, last relevant lines, including any non-zero exit):
  $ <command>
  <output>
Tests: <id>: PASS (evidence) | FAIL | NOT RUN | PENDING OWNER CHECK
Lighthouse (production build): mobile P/A/BP/SEO = ..., desktop P/A/BP/SEO = ...   (or NOT RUN, why)
Manual check: <exact steps the owner can repeat, and the expected result>
Deviations from the prompt: <none | list with reason>
Decisions needed: <none | DEC-xxx (Proposed): problem, options, recommendation>
Dependencies / generators / AI tools to disclose: <list>
Temporary scripts: <none | file name + purpose>
Screenshots reviewed by me: <yes, list anything that looked wrong and how you fixed it>
Rule compliance: 4 <ok/why not>, 7 <ok/why not>, 7a <ok/why not>, 7b <ok/why not>, 7c <ok/why not>, 7d <ok/why not>, 7e <ok/why not>, 7f <ok/why not>, 8 <ok/why not>
Next step suggested: <one line>
```
Put the report at the end of your final message. Do not summarise command output; paste it.

## 11. Violations log (inherited from the owner's Vouch project; same agent, same risks)
| Rule | What happened before | What it means here |
|---|---|---|
| 7.3 (most serious) | Pasted command output that was not real: wrong tool versions, wrong script names, wrong test counts. | Invented output is never acceptable. Real output or NOT RUN. |
| 7.4 | A full test run exited with code 1 but only the passing file's output was pasted. | Hiding a failing command is the worst violation. |
| 7.5 | Reported "ok" while a speed target was missed (7.7 s against a 4 s target). | Missed target = FAIL with numbers. |
| 7a.3 | Wrote screenshots "clean" while text was cut off and placeholder values were visible. | Look at the screenshots. |
| 7f.3 | Used about ten temporary scripts and reported "none". | List every one. |
| 6 | Changed server code and reported "Deviations: none". | Every deviation goes in the report. |
| 5 | Silently loosened a test assertion to make it pass. | Never weaken a test to get a PASS. Report the failure. |

Each new violation is added here with the task ID.
