# Career Compass

Career Compass is an AI-assisted career operations workspace for discovering relevant roles, evaluating fit from a search profile and resume, tracking application decisions, and turning job-search email into a prioritized action queue.

## What it does

- **Command Center** — creates or refines a reusable search profile: target roles, locations, skills, work mode, salary floor, and a “posted in the last 24 hours” preference. Non-resume preferences are stored in browser local storage; resume files are not.
- **Resume-aware matching** — uploads text-based PDF or DOCX resumes, extracts their text server-side, and uses it as evidence during match scoring. The app accepts PDF and DOCX; scanned/image-only PDFs need OCR before they can be read.
- **Opportunity discovery** — searches Indeed, Greenhouse, and Ashby through Apify, normalizes the results, removes duplicates, retains postings from the last 24 hours by default, and persists results in Postgres.
- **AI match analysis** — sends the candidate profile and posting to OpenRouter for a structured 0–100 score, recommendation, three concise strengths, gaps, and concerns. A local rule-based analysis is used if the LLM request fails.
- **Opportunity tracking** — orders saved jobs by highest match score, supports **Mark applied** and **Skip role**, links to the original posting, and provides a copyable networking prompt for referral research and personalized LinkedIn outreach.
- **LinkedIn Scan** — runs a separate, cost-controlled Apify LinkedIn search, saves every returned posting, filters to positions posted in the last 24 hours, scores each result, and displays them in a dedicated view.
- **Next Actions** — connects Gmail with read-only OAuth and uses hybrid triage: deterministic rules remove obvious alerts, newsletters, confirmations, and rejections; OpenRouter then decides whether the remaining career emails need a reply, follow-up, review, or no action. The queue prioritizes interviews, offers, recruiter outreach, LinkedIn InMail, deadlines, and overdue follow-ups.
- **Reply drafting** — generates an in-app, send-ready reply with the sender greeting and candidate signature. Drafts can be expanded, copied, and reviewed in the exact Gmail thread; the app never sends an email or creates a native Gmail draft.
- **Planner + Google Calendar** — combines read-only events from the same Google account used for Gmail with personal career focus blocks across Today, Week, Month, and Inbox views. Existing calendar commitments remain visually distinct and cannot be edited by the app.

## App routes

| Route | Product name | Purpose |
| --- | --- | --- |
| `/` | Command Center | Create/refine the search profile; launch multi-board or LinkedIn discovery. |
| `/listings` | Opportunities | Persisted multi-board jobs, sorted by score. |
| `/linkedin-listings` | LinkedIn Scan | Persisted LinkedIn jobs, sorted by score. |
| `/action-ops` | Next Actions | Prioritized Gmail actions, draft replies, and direct Gmail links. |
| `/planner` | Planner | Read-only Google Calendar events, daily execution, weekly/monthly planning, and an unscheduled task Inbox. |

## Job workflow

1. Upload a resume and create a search profile in **Command Center**.
2. Choose **Find opportunities** to search Indeed, Greenhouse, and Ashby, or **Scan LinkedIn** for the separate LinkedIn source.
3. Multi-board discovery honors the profile’s “posted in the last 24 hours” preference. LinkedIn Scan always retains only results posted in the last 24 hours.
4. Each retained job is analyzed and sorted by match score. Salary is the only hard filter: a job is excluded only when its disclosed maximum salary is below the stated minimum. If no jobs pass that filter, the app analyzes the fetched jobs instead of returning an empty screen.
5. Review the score, recommendation, and match details; open the original posting, mark a role applied, skip it, or copy a networking prompt.
6. In **Next Actions**, connect Gmail and refresh inbox signals. Review the most urgent job-related emails, open the exact Gmail thread, and generate/copy replies when appropriate.

## Run locally

Requires Node.js 20+ and a Postgres database for persistence.

```bash
git clone https://github.com/kajalpatel222/career-compass.git
cd career-compass
npm install
cp .env.example .env
```

Fill in `.env`, then generate the Prisma client and apply the schema to your development database:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run lint
npm run build
```

`npm run build` is the production-equivalent verification step and should pass before a Vercel deployment.

## Configuration

Never commit `.env` or publish its values. Copy `.env.example` and replace the placeholders.

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Postgres persistence, Gmail connection, listings, application tracking | Use a hosted Postgres URL such as Neon for local and Vercel environments. Include `?sslmode=require` when supplied by the provider. |
| `APIFY_API_TOKEN` | Job discovery | Used by Indeed, Greenhouse, Ashby, and LinkedIn sources. |
| `APIFY_INDEED_ACTOR_ID` | Indeed discovery | Optional actor override. |
| `APIFY_GREENHOUSE_ACTOR_ID` | Greenhouse discovery | Optional actor override. |
| `APIFY_ASHBY_ACTOR_ID` | Ashby discovery | Optional actor override. |
| `APIFY_LINKEDIN_ACTOR_ID` | LinkedIn Scan | Optional override; defaults to `themineworks~linkedin-jobs-scraper`. |
| `LINKEDIN_RESULTS_PER_SEARCH` | LinkedIn Scan cost control | Defaults to `10`; clamped between `1` and `25`. |
| `OPENROUTER_API_KEY` | AI scoring and reply drafts | Keep server-only. |
| `OPENROUTER_MODEL` | AI scoring and reply drafts | Any OpenRouter model identifier; `openrouter/free` is the default. |
| `GOOGLE_CLIENT_ID` | Gmail and Calendar OAuth | Google OAuth Web application client ID. |
| `GOOGLE_CLIENT_SECRET` | Gmail and Calendar OAuth | Google OAuth Web application secret. |
| `GOOGLE_REDIRECT_URI` | Gmail and Calendar OAuth | Local: `http://localhost:3000/api/gmail/callback`. Production: `https://YOUR-DOMAIN/api/gmail/callback`. Add this exact value in Google Cloud. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Google OAuth token storage | Base64-encoded 32-byte key used to encrypt the stored refresh token. Generate with `openssl rand -base64 32`. |
| `CANDIDATE_NAME` | Reply drafting | Optional signature name; defaults to `Kajal Patel`. |

## Google OAuth setup

1. Create/select a Google Cloud project and enable both the **Gmail API** and **Google Calendar API**.
2. Configure an OAuth consent screen and add the `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/calendar.readonly` scopes.
3. Create a **Web application** OAuth client.
4. Add the redirect URI from `GOOGLE_REDIRECT_URI` to the client’s authorized redirect URIs.
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `GMAIL_TOKEN_ENCRYPTION_KEY` to `.env`.
6. In **Next Actions**, select **Connect Gmail**, or use **Connect Calendar** in Planner. Approve both read-only requests, then refresh the relevant view.

The app stores one encrypted Google refresh token in Postgres for the connected account. It reads mailbox metadata and snippets only for the job-search query and reads events from the primary calendar. It does not send email, modify messages, create Gmail drafts, or change calendar events.

## Deploy on Vercel

1. Import `kajalpatel222/career-compass` into Vercel and set `main` as the production branch.
2. Add the required `.env` values in **Project Settings → Environment Variables** for Production. Add them to Preview/Development too if those environments need integrations.
3. Set `GOOGLE_REDIRECT_URI` to the deployed callback URL and add that exact URL to the Google OAuth client.
4. Confirm the remote `DATABASE_URL` points to the hosted Postgres database used by the app.
5. Push to `main`; Vercel builds with `npm run build`.

Before the first deployment, run `npx prisma db push` against the target database so the schema exists.

## Technology

- Next.js 16 App Router + TypeScript
- Prisma + PostgreSQL/Neon
- Apify for job discovery
- OpenRouter for job analysis and email reply generation
- Google Gmail and Calendar APIs with OAuth 2.0 and read-only access
- `pdf-parse` and Mammoth for PDF/DOCX resume extraction

## Privacy and cost notes

- Resume text, job content, and selected email metadata are sent to OpenRouter only when AI analysis or draft generation is requested.
- LinkedIn Scan may consume Apify credits; set `LINKEDIN_RESULTS_PER_SEARCH` conservatively.
- Gmail and Calendar access are read-only. Email sending remains a manual action in Gmail, and calendar events cannot be changed by the app.
