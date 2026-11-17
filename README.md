# LinkedinStyle
Open-source job search and LinkedIn presence assistant. Collects and scores openings from public ATS boards against your resume, drafts and schedules posts through LinkedIn’s official API, and prepares applications and outreach up to the point where a human confirms.

# job-radar

Open-source job search and LinkedIn presence assistant.

Job hunting while employed is mostly repetitive work: reading the same
postings, rewriting the same answers, keeping a presence alive on a network
you barely have time for. This project automates that work and stops exactly
where a human has to decide.

## What it does

**Finds and scores openings.** Daily collectors read the public job board APIs
that Greenhouse, Lever, Ashby, Workable and Gupy publish, plus any career feed
you add. Each opening is scored 0 to 100 against your resume and your filters,
and the score comes with a written rationale so you can calibrate it instead
of trusting a number.

**Prepares applications.** For Greenhouse postings it reads the job's own
questions schema and builds the whole application filled in: identity, the
right resume for the posting's language, and answers drawn from your profile.
Anything it cannot answer with confidence becomes a question to you, never a
guess, and your answer is stored for next time.

**Writes and schedules content.** Generates posts in your primary language
plus a version in a second one, renders the artwork, and publishes on a
schedule through LinkedIn's official API, followed by the translated version
as the first comment. A topic radar pulls news from sources you register and
suggests angles that match your content pillars.

**Suggests who to talk to.** Ranks people worth approaching based on the
openings collected and your target companies, and drafts both the connection
note and the follow-up message.

## Where it stops on purpose

This tool does not submit applications and does not send connection requests.

That is a design decision, not a missing feature.

Greenhouse and Lever do expose application endpoints, but the key is issued by
the employer for their own careers page, not to candidates. LinkedIn exposes no
API for Easy Apply or for connection invites at all. Every remaining path is
browser automation or a third party service that solves captchas, which
violates platform terms and puts the user's own account at risk. The account
being burned would be yours, not the tool's.

So the tool does everything up to the irreversible action and hands it over.
In practice that is one click, with every field already filled.

## Security model

- Content fetched from the web is data, never instruction. A job description
  cannot change what the application does.
- Irreversible actions require explicit human confirmation.
- Credentials never travel through prompts or logs. LinkedIn tokens are stored
  encrypted per user and refreshed server side.
- Every table is scoped by row level security. No user reads another user's
  resume.
- No personal data in seeds or fixtures.

## Status

Early. See the issues for what is being built.

## Cost control

Searching and filtering openings is free. Scoring with Claude is paid, so the app splits the two: it shows an estimated cost (tokens and USD, from the model's published price) and runs only after the user authorizes that amount. If the estimate changes before the run, it cancels and asks again. The daily cron only collects, it never calls the model. After each run the app shows the real cost reported by the API.

## Running your own copy

1. Create a Supabase project and run the files in `supabase/migrations` in order (`0001`, `0002`). They create the `ls_*` tables with row level security and a private `resumes` bucket.
2. `cp .env.example .env.local` and fill in the project URL and the publishable key.
3. Generate the encryption key used for per-user secrets: `openssl rand -base64 32`, and set it as `TOKEN_ENCRYPTION_KEY`.
4. `npm install && npm run dev`, then `npm test`.

No user data lives in this repo. Each person creates an account and goes through onboarding: resumes (Portuguese and/or English, validated by the user), job preferences and salary floor, blocked companies, content pillars and posting cadence, and their own API key. When an opening comes in, the app detects whether it is in English or Portuguese and picks the matching resume; with only one language on file it uses that one and says so.

The app explains the "where it stops" decision in the UI too, at `/limites`.

## Deploying (Vercel)

Connect the repo to a Vercel project and set these variables:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. Losing it makes stored API keys unreadable |
| `CRON_SECRET` | Long random string. Vercel sends it as a Bearer token to `/api/cron/daily` |
| `SUPABASE_SERVICE_ROLE_KEY` | Only the daily cron uses it. Server side only, never exposed |

`vercel.json` schedules the collection once a day. On mobile, open the deployed URL and use "Add to Home Screen" to install it as a PWA.
