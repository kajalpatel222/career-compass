# Personal Assistant

An AI-assisted job-search workspace: discover roles, score fit against a resume, track applications, and prioritize job-related Gmail actions.

## Features

- Searches Indeed, Greenhouse, and Ashby through Apify.
- Saves jobs in Postgres, scores fit with an LLM, and sorts listings by score.
- Match analysis considers role, skills, location, compensation, resume evidence, and explicit visa-sponsorship language.
- Tracks saved, applied, and not-pursuing roles; includes copyable referral-research prompts.
- Dedicated LinkedIn search and `/linkedin-listings` route. Paid results are saved and a Postgres-enforced 24-hour limit controls spend.
- Gmail read-only OAuth plus Action Ops: prioritized replies, recruiter outreach, follow-ups, app drafts, copy actions, and direct Gmail links.

## Routes

- `/` profile and searches
- `/listings` multi-board listings
- `/linkedin-listings` saved LinkedIn listings
- `/action-ops` Gmail priority queue

## Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local development uses Webpack for stability.

```bash
npx tsc --noEmit
npm run lint
npx next build --webpack
```

## Configuration

Never commit `.env` or share its values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Hosted Postgres persistence, Gmail, and LinkedIn daily limit. |
| `APIFY_API_TOKEN` | Apify job discovery. |
| `APIFY_INDEED_ACTOR_ID` | Indeed actor override. |
| `APIFY_LINKEDIN_ACTOR_ID` | LinkedIn actor override; default is `themineworks~linkedin-jobs-scraper`. |
| `LINKEDIN_RESULTS_PER_SEARCH` | LinkedIn cost control; default 10, capped at 25. |
| `OPENROUTER_API_KEY` | LLM job analysis and drafts. |
| `OPENROUTER_MODEL` | OpenRouter model identifier. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail OAuth web-client credentials. |
| `GOOGLE_REDIRECT_URI` | OAuth callback: local `http://localhost:3000/api/gmail/callback`; use the deployed domain in production. |

After schema changes:

```bash
npx prisma db push
```

## Gmail OAuth

Enable Gmail API in Google Cloud, configure the OAuth consent screen with `gmail.readonly`, create a **Web application** OAuth client, add the callback URI, and add its credentials to `.env`. Connect Gmail from Action Ops. The app reads mail only; it never sends messages or writes native Gmail drafts.

## LinkedIn

LinkedIn is intentionally separate from general search. Selecting **LinkedIn search** calls the configured paid Apify actor once, saves every returned listing, scores the roles, and locks another run for 24 hours.

## Deployment

Add the same variables in Vercel Project Settings → Environment Variables. Set `GOOGLE_REDIRECT_URI` to the production callback URL before deploying.
