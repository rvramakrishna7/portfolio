# Ramakrishna: portfolio and Job Desk

This repository holds two things in one Next.js app:

1. **The public portfolio** at https://rramakrishna.vercel.app. Projects are shown as problems solved, with results.
2. **Job Desk**, a private dashboard at `/admin`. It replaces the many job sites, alert emails and spreadsheets a job seeker normally juggles with one place that finds jobs, ranks them, drafts the outreach, sends it, and tracks the replies.

## The problem Job Desk solves

Looking for a job means watching many platforms at once: job boards, company career pages, LinkedIn, email alerts, chat groups. The leads are scattered, most are not a fit, and follow-ups get lost. Job Desk pulls them into one queue, filters by hard rules (remote only, entry level, India eligible), ranks the rest, and keeps the whole outreach history in one place.

## What Job Desk does

| Area | What it does |
|---|---|
| Find | Greenhouse, Lever, Ashby, Hacker News, remote boards, LinkedIn through Apify, Gmail job alerts, Telegram and WhatsApp forwards, pasted links |
| Filter and rank | Rule engine for location, seniority, freshness and language, plus an LLM check (Groq) for unclear postings. Jobs land in Shortlist, Maybe or Hidden, always with a reason |
| Draft | Cold email, LinkedIn note and LinkedIn message per job, written from verified project facts only. A validator blocks invented numbers, links and contact details |
| Send | Email drafts are sent from the owner's own Gmail after an explicit two step confirm. Daily cap, no double send, no attachments |
| Track | Tracked portfolio links (no cookies, no IP stored, bots flagged), reply detection from Gmail, Telegram alerts, a pipeline from applied to offer |

## Safety rules built into the sender

- Only an approved email draft with a valid recipient can be sent.
- A draft is claimed in one atomic SQL statement before the mail leaves, so a double click or two requests send it once.
- If the mail definitely did not leave, the claim is released. If the outcome is unknown, the draft stays marked sent and the owner checks Gmail Sent. It is never retried blindly.
- Header injection is blocked, and error messages never include provider text or secrets.
- End to end tests use a fake transport and never send real mail.

## Stack

Next.js (App Router), React, TypeScript, Neon serverless Postgres, Groq, Nodemailer and ImapFlow for Gmail, Telegram Bot API, Vitest, Playwright, Vercel.

## Getting started

Requirements: Node.js 20 or newer, a Neon Postgres database.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate
npm run dev
```

Create the admin password hash with `node scripts/hash-password.mjs`.

If you put the hash in `.env.local`, escape every `$` as `\$`, because Next.js expands `$name` in env files. Vercel environment variables need no escaping.

## Environment variables

See `.env.example` for the full list with comments. The main ones:

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Neon Postgres connection |
| `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` | Admin login (scrypt hash, signed cookie) |
| `GROQ_API_KEY` | Job triage and draft writing |
| `GMAIL_IMAP_USER`, `GMAIL_IMAP_APP_PASSWORD` | Reading job alerts and replies, and sending email |
| `OUTREACH_DAILY_SEND_CAP` | Optional daily send limit (default 20, maximum 100) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` | Alerts and forwards |
| `APIFY_API_TOKEN` | LinkedIn job search |
| `CRON_SECRET` | Protects the daily search endpoint |
| `NEXT_PUBLIC_SITE_URL` | The production domain |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` and `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright). The config builds and starts the app |
| `npm run check:flat`, `check:copy`, `check:numbers` | Design, copy and number consistency checks |
| `npm run db:migrate` | Apply SQL migrations in `db/migrations` |

## Project structure

```
src/app/            Pages, admin dashboard and API routes
src/lib/jobs/       Job repository (in memory and Neon, kept in parity), rules, classifier
src/lib/outreach/   Draft generation, answers, email formatting and sending
src/lib/inbound/    Gmail alerts, replies, Telegram and WhatsApp inputs
src/lib/tracking/   Tracked links and bot detection
db/migrations/      Ordered SQL migrations
e2e/                Playwright tests
scripts/            Migration, password and check scripts
```

## Privacy

The public site shows no phone number and no email address. Contact goes through a form that emails the owner, and LinkedIn. Tracked links store no IP address and set no cookies.

## Deployment

The app deploys to Vercel from this repository. Add the environment variables above in the Vercel project settings, apply the migrations to the production database, and the daily search runs from `vercel.json`.
