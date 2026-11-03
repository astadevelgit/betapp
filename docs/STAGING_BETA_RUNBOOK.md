# Staging Beta Runbook

Operational guide for taking BetApp from a verified local build to a private,
100-player staging beta.

**Last updated:** 2026-11-03  
**Applies to:** Next.js 16.4.4, Supabase Postgres/Auth, Vercel Hobby for staging
(Pro for scheduled crons), Sentry 10, PostHog, Sportmonks or The Odds API.

> BetApp is play-money only. BET coins have no cash value and cannot be
> purchased, cashed out, or exchanged for prizes. The beta is 18+ and intended
> for Nigeria.

---

## 1. Beta guardrails

Keep these invariants true for the whole beta:

| Guardrail | Expected state | Where to verify |
|---|---|---|
| Beta cap | `beta_cap = 100` | Admin → Settings |
| Beta gate | `beta_enabled = true` | Admin → Settings |
| New players after cap | Sent to the waitlist, not rejected silently | `/waitlist`, `waitlist` table |
| Search indexing | `noindex, nofollow` meta + `X-Robots-Tag` | Response headers, `robots.ts` |
| Public discovery | Unlisted URL, shared directly with testers | Vercel domain settings |
| Money model | Play money only, no purchase or cash-out path | Product review |
| Minimum age | 18+ acknowledgement at signup | `/auth/register` |
| Maintenance | `maintenance_mode = false` unless betting is intentionally paused | Admin → Settings |

The URL is unlisted, not access-controlled. Do not post it publicly, submit it
to search engines, or link it from a public site. `noindex` prevents indexing
but does not make a URL secret.

### Production economy settings

| Setting | Value |
|---|---|
| `signup_bonus` | 10,000 BET |
| `daily_claim` | 2,000 BET |
| `min_stake` | 100 BET |
| `max_stake` | 50,000 BET |
| `max_payout` | 1,000,000 BET per bet |
| `odds_stale_seconds` | 900 (15-minute betting cutoff) |
| `beta_cap` | 100 |

Daily claims reset on the Africa/Lagos calendar day.

---

## 2. Prerequisites

Collect these before deployment:

- [ ] Vercel account with access to the project. **Hobby** can host the app but
      only allows daily crons; **Pro** is required for the five production
      schedules in section 4.3.
- [ ] Vercel CLI authenticated and the project linked: `npx vercel whoami`.
- [ ] Supabase project (staging project, separate from any future production
      project) and the Supabase CLI linked.
- [ ] A football data provider key:
      Sportmonks (full markets) **or** The Odds API (1X2 and O/U 2.5 only).
- [ ] Any credential that was echoed in terminal output has been rotated before
      testers are invited. See section 4.4.
- [ ] `CRON_SECRET` — at least 32 random characters.
- [ ] `RATE_LIMIT_SALT` — a second random value, not reused from `CRON_SECRET`.
- [ ] Resend account and a verified sending domain, configured as Supabase Auth
      SMTP.
- [ ] Sentry project and DSN.
- [ ] PostHog project and project API key (EU host).
- [ ] Admin bootstrap email, password, display name, and date of birth.
- [ ] Nigerian counsel review scheduled for the legal placeholders.

Generate secrets locally, for example:

```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

Do not commit real values. `.env.local` is ignored by git.

---

## 3. Supabase setup

### 3.1 Create the project

1. Create a new Supabase project for staging.
2. Save the project URL, publishable/anon key, secret/service-role key, and both
   Postgres connection strings.
3. Keep the service-role key server-side only. It bypasses RLS.

### 3.2 Apply migrations

Apply every file in `supabase/migrations/` in numeric order, followed by
`supabase/seed.sql`. Use the Supabase CLI or the SQL editor.

The staging project is fully migrated through
`20261102000008_odds_cutoff.sql`. Migration 7 adds the atomic stale-odds guard
to `place_bet`; migration 8 moves the betting cutoff from 300 to 900 seconds.
They were applied with `supabase db query --file`, so the remote migration
history may be empty. Do not run `supabase db push` blindly against this
project; apply new files explicitly and record the result.

After applying, confirm:

```sql
-- Settings row count and economy values
select key, value from public.app_settings order by key;

-- RLS is enabled on every user table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- No public execute on privileged functions
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by routine_name;
```

Expected economy values: `signup_bonus=10000`, `daily_claim=2000`,
`min_stake=100`, `max_stake=50000`, `max_payout=1000000`, `beta_cap=100`,
`beta_enabled=true`, `maintenance_mode=false`, `odds_stale_seconds=900`.

### 3.3 Configure Auth

The staging project is already configured with:

- Site URL: `https://betapp-staging.vercel.app`
- Redirect URLs: `https://betapp-staging.vercel.app/auth/callback` and
  `http://localhost:3000/auth/callback`

To change these without resetting unrelated Auth settings, use a minimal
temporary config and the CLI's config workflow:

```powershell
$dir = Join-Path $env:TEMP "betapp-supabase-config"
npx supabase init --workdir $dir --yes
# Write only auth.site_url and auth.additional_redirect_urls to
# $dir\supabase\config.toml, then preview and apply:
npx supabase config diff --remote=<project-ref> --workdir $dir
npx supabase config push --remote=<project-ref> --workdir $dir --yes
```

`config push` leaves remote properties that are not declared in the temporary
file unchanged. Do not commit a partial `supabase/config.toml` to the repo.

1. **Auth → URL Configuration**
   - Site URL: the staging URL, e.g. `https://betapp-staging.vercel.app`.
   - Redirect URLs: `https://<staging-host>/auth/callback` and
     `http://localhost:3000/auth/callback` for local work.
2. **Auth → Email**
   - Configure Resend SMTP.
   - Verify the sender domain in Resend first.
   - Keep email confirmation enabled for the beta.
3. **Auth → Providers**
   - Enable email/password.
   - Disable providers that are not part of the beta.
4. Send a real test signup and confirm the email arrives, the callback works,
   and the 10,000 BET signup bonus is credited exactly once.

### 3.4 Bootstrap the admin

Run locally against the staging database:

```powershell
$env:DATABASE_URL = "<transaction-pooler-url>"
$env:DATABASE_URL_DIRECT = "<direct-url>"
$env:ADMIN_EMAIL = "<admin-email>"
$env:ADMIN_PASSWORD = "<strong-password>"
$env:ADMIN_DISPLAY_NAME = "BetApp Admin"
$env:ADMIN_DOB = "1990-01-01"
npm run seed:admin
```

Alternatively, create the user in Supabase Auth, then promote it with the
script. Verify the admin can reach `/admin` and that a normal player receives a
redirect or 403.

### 3.5 Confirm the waitlist and beta gate

- With `beta_enabled = true` and capacity remaining, a new signup creates a
  profile and wallet.
- With `beta_enabled = false`, a new signup is added to the waitlist.
- At `beta_cap`, a new signup is added to the waitlist.
- Re-submitting the same waitlist email is idempotent.
- The waitlist is rate-limited to 5 submissions per minute per hashed IP.

Test the cap in staging only. Changing `beta_cap` in the admin console is
audited; restore it to 100 immediately afterwards.

---

## 4. Vercel deployment

### 4.1 Current staging project

| Item | Value |
|---|---|
| Vercel project | `asta-2e53/betapp-staging` |
| Production URL | `https://betapp-staging.vercel.app` |
| Plan | Hobby (per-minute crons blocked) |
| Region | `iad1` |
| Node.js | 26.x |
| Framework | Next.js, build `npm run build` |
| Provider | `FOOTBALL_PROVIDER=the-odds-api` |
| Sport key | `soccer_epl` |
| Fixture cap | `ODDS_SYNC_MAX_FIXTURES=40` |

The deployment is public and unlisted. `X-Robots-Tag: noindex` and
`robots.txt` are verified.

To recreate the project: link it with
`npx vercel link --yes --scope asta-2e53 --project betapp-staging`, set the
environment variables in **Settings → Environment Variables** for Production
and Preview, deploy, then set `NEXT_PUBLIC_SITE_URL` to the final URL and
redeploy. `NEXT_PUBLIC_*` values are inlined at build time; editing one in the
dashboard alone does not update the running app.

### 4.2 Required environment variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public | Final staging URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service-role key or `sb_secret_...` key |
| `DATABASE_URL` | Local/tooling | Transaction pooler, port 6543; not set on Vercel staging |
| `DATABASE_URL_DIRECT` | Local/tooling | Direct connection, port 5432, for Drizzle tooling |
| `CRON_SECRET` | Server | Vercel sends it as `Authorization: Bearer ...` |
| `RATE_LIMIT_SALT` | Server | Salt for hashed waitlist IPs |
| `FOOTBALL_PROVIDER` | Server | `sportmonks`, `api-football`, or `the-odds-api` |
| `SPORTMONKS_API_TOKEN` | Server | If using Sportmonks |
| `SPORTMONKS_LEAGUE_IDS` | Server | e.g. `271,501` on the free plan |
| `THE_ODDS_API_KEY` | Server | If using The Odds API |
| `THE_ODDS_API_SPORT_KEYS` | Server | e.g. `soccer_epl` |
| `THE_ODDS_API_REGIONS` | Server | Default `eu`; each region multiplies odds cost |
| `THE_ODDS_API_MARKETS` | Server | `h2h,totals` only |
| `ODDS_SYNC_MAX_FIXTURES` | Server | `40` on staging; limits rows processed, not provider cost |
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Browser errors |
| `SENTRY_DSN` | Server | Server/edge errors; may equal the public DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Public | `staging` |
| `SENTRY_ENVIRONMENT` | Server | `staging` |
| `NEXT_PUBLIC_SENTRY_RELEASE` | Public | Optional; deployed commit SHA |
| `SENTRY_RELEASE` | Server | Optional; defaults to Vercel commit SHA |
| `SENTRY_ORG` | Build | Source-map upload only |
| `SENTRY_PROJECT` | Build | Source-map upload only |
| `SENTRY_AUTH_TOKEN` | Build | Source-map upload only; keep secret |
| `NEXT_PUBLIC_POSTHOG_KEY` | Public | PostHog project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | Public | `https://eu.i.posthog.com` |

The app runs without Sentry and PostHog keys: both are no-ops when unset. It
cannot authenticate users without Supabase, and it cannot sync fixtures or odds
without `CRON_SECRET` and a provider key. Staging currently has the Supabase,
provider, cron, rate-limit, and PostHog-host values; Sentry, PostHog key, and
Resend are still missing.

### 4.3 Crons and the Hobby limit

`vercel.json` defines the full production schedule:

| Job | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync-live` | Every 2 minutes | Live scores and today's final results |
| `/api/cron/sync-odds` | Every 10 minutes | Refresh pre-match odds older than 5 minutes |
| `/api/cron/sync-fixtures` | Every 6 hours | Next 7 days of fixtures |
| `/api/cron/settle` | Every 5 minutes | Settle finished bets |
| `/api/cron/cleanup` | Daily at 03:00 UTC | Expired rate limits and unverified signups |

**Hobby accounts reject any schedule that runs more than once per day:**

```text
Hobby accounts are limited to daily cron jobs. This cron expression
(*/2 * * * *) would run more than once per day.
```

Staging therefore deploys with **no crons**. `vercel.staging.json` holds the
empty schedule, and the wrapper swaps it into `vercel.json` for the deploy and
restores the Pro schedule afterwards, even on failure:

```powershell
npm run deploy:staging
```

Do not use `npx vercel deploy --prod -A vercel.staging.json` for this. The
`--local-config` flag does not suppress the root `vercel.json`; Vercel still
validates its cron entries and rejects the deployment.

Manual invocation until Pro is enabled:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
$base = "https://betapp-staging.vercel.app"
foreach ($job in "sync-fixtures", "sync-odds", "sync-live", "settle", "cleanup") {
  Invoke-RestMethod -Uri "$base/api/cron/$job" -Headers $headers
}
```

Expected: `{ ok: true, job: "...", recordsProcessed: N, ... }`. A missing or
wrong secret returns `401`; a missing `CRON_SECRET` returns `503`. Provider
failures return `500` and are captured in Sentry with a `cron_job` tag once
Sentry is configured.

Once the project is on Pro, deploy normally with `npx vercel deploy --prod`.
Open **Cron Jobs** and confirm all five appear with recent invocations.

Check Admin → Matches for recent `sync_runs`: fixtures, live scores, odds,
settlement, and cleanup. The cleanup card shows how many expired rate-limit
buckets and unverified profiles were removed. Cross-check with the Vercel cron
log or a read-only SQL query during incident review.

### 4.4 Rotate exposed credentials

The first CLI `vercel env add --value` calls echoed secrets into terminal
output. Treat those values as compromised. `CRON_SECRET` was rotated on
2026-11-03 and the new value successfully triggered `sync-odds`; the old value
is no longer in Vercel.

| Credential | Status | Rotation path |
|---|---|---|
| `CRON_SECRET` | Rotated and verified | Generate locally, update Production and Preview, redeploy |
| Supabase service-role / secret key | **Pending** | Supabase Dashboard → Settings → API keys; create a new secret key |
| `SPORTMONKS_API_TOKEN` | **Pending** | Sportmonks dashboard → API token |
| `THE_ODDS_API_KEY` | **Pending** | The Odds API dashboard → API key |

For each replacement:

1. Create the new value in the provider dashboard.
2. Update `.env.local`.
3. Pipe the value on stdin to Vercel; never use `--value`:

   ```powershell
   foreach ($target in "production", "preview") {
     Get-Content .\secret.txt | npx vercel env add NAME --environment $target `
       --force --type secret --scope asta-2e53 --project betapp-staging
   }
   Remove-Item .\secret.txt
   ```

4. Redeploy with `npm run deploy:staging`.
5. Verify the affected flow, then revoke the old value.

Rotating the Supabase JWT secret invalidates both legacy anon and service-role
keys and signs users out. Prefer creating an `sb_secret_...` key, switching
`SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), and only then disabling
the legacy keys. If the publishable/anon key stays on the current JWT, it can
remain in place.

---

## 5. Provider setup

### 5.1 Choose one provider explicitly

Set `FOOTBALL_PROVIDER` so a leftover key cannot silently change the data
source. Automatic priority is Sportmonks → API-Football → The Odds API.

**Current staging selection:** `FOOTBALL_PROVIDER=the-odds-api`,
`THE_ODDS_API_SPORT_KEYS=soccer_epl`, `ODDS_SYNC_MAX_FIXTURES=40`. Live
validation on 2026-11-03 produced **10 EPL fixtures, 20 markets, 50
selections**, and zero odds failures. The events endpoint requires
`YYYY-MM-DDTHH:MM:SSZ`; ISO timestamps with milliseconds return HTTP 422.

**Sportmonks** is the only provider that supplies all four BetApp markets
(1X2, O/U 2.5, BTTS, Double Chance). The free plan covers only leagues `271`
(Denmark) and `501` (Scotland). Confirm the selected league IDs are in season.

**The Odds API** is suitable as an optional odds/1X2 provider:

- Bulk `/odds` supports `h2h` and `totals` only.
- BTTS and Double Chance require per-event add-ons and are intentionally not
  requested.
- `/sports` and `/events` are free.
- `/odds` costs 1 credit per market per region.
- `/scores?daysFrom=1` costs 2 credits and serves both live and result paths.
- One bulk `/odds` response is shared by every fixture in a run. Raise
  `ODDS_SYNC_MAX_FIXTURES` (for example to `40`) to cover a full slate without
  increasing credit cost.
- The free 500-credit plan cannot sustain the default cron schedule. Use the
  100K plan ($59/month) for one sport key at the default cadence, or slow the
  crons on the 20K plan.
- There is no Nigerian league coverage; `soccer_epl` is the default.
- Switching providers on an existing catalog creates new provider-specific
  rows for future fixtures. Use a fresh staging database when comparing
  providers.

### 5.2 Verify the data path

On staging, the expected first-run result is 10 matches, 20 markets (1X2 and
O/U 2.5), and 50 selections. A successful `sync-odds` reports
`recordsProcessed: 10` and `failures: 0`.

1. Run `sync-fixtures`. Check that competitions, teams, matches, markets, and
   selections appear.
2. Run `sync-odds`. Check that each scheduled match has prices and an
   `updated_at` timestamp.
3. Open a match. Confirm the prices shown match the provider, markets close at
   kickoff, and the page is usable on a phone.
4. During a live match, confirm `sync-live` updates the score and minute and
   closes pre-match markets.
5. After full time, confirm the final score appears, `settle` resolves affected
   bets once, and a second settle run does not credit twice.

The Odds API does not report halftime, postponed, or cancelled states. A
postponed or abandoned match may stay pending until an admin voids it or the
provider marks it complete.

---

## 6. Sentry setup

> **Staging status:** no DSN or auth token is configured yet. Error delivery,
> source maps, and alerting are unverified. Complete this section before
> inviting testers.

### 6.1 Create the project

1. Create a Next.js project in Sentry.
2. Copy the DSN into `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`.
3. Set `SENTRY_ENVIRONMENT=staging` and
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging`.
4. For source maps, create an internal integration token with release access and
   set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in the Vercel
   build environment. Without all three, source-map upload is disabled and the
   build still succeeds.
5. Redeploy.

Sentry is configured with `sendDefaultPii: false`, logs disabled, and a 10%
trace sample in production. Do not add emails, names, request bodies, or wallet
balances to Sentry events.

### 6.2 Error boundaries

Every boundary reports to Sentry with a `boundary` tag and shows a branded
fallback with **Try again** and **Back to lobby**:

| Boundary | File | Tag |
|---|---|---|
| Root document | `app/global-error.tsx` | `global` |
| Root app | `app/error.tsx` | `root` |
| Public pages | `app/(public)/error.tsx` | `public` |
| Authenticated app | `app/(app)/error.tsx` | `app` |
| Auth pages | `app/(auth)/error.tsx` | `auth` |
| Admin | `app/admin/error.tsx` | `admin` |

Server Component, Server Action, Route Handler, and Proxy errors are also
captured by `onRequestError` in `instrumentation.ts`. The digest is shown to the
user as a reference; it is not PII.

### 6.3 Alerts

Create at least these alert rules, filtered to `environment:staging`:

1. **New issue** — notify immediately on first seen.
2. **Error spike** — more than 5 events in 5 minutes.
3. **Cron failure** — any event tagged `cron_job`, notify immediately.
4. **Settlement failure** — event or message containing
   `Settlement completed with failed bets`.
5. **Placement failure** — events tagged `flow:place_bet`.

Route alerts to a monitored channel, not an unread inbox. Record the channel in
the beta ops notes.

### 6.4 Test delivery

In a **Preview** deployment only:

1. Add a temporary route that throws in a Server Component, or trigger a
   controlled error from a temporary button.
2. Visit it, confirm the branded boundary and reference digest render.
3. Confirm the Sentry event appears with the expected `boundary` tag,
   environment, and a readable stack trace (source maps working).
4. Delete the probe and redeploy. Never merge a deliberate error probe.

Production Sentry delivery has not been verified while credentials are absent;
the first staging smoke test must confirm it.

---

## 7. PostHog setup

> **Staging status:** only `NEXT_PUBLIC_POSTHOG_HOST` is set. Without a project
> key, analytics calls are no-ops and no events have been delivered.

1. Create a PostHog project on the EU host.
2. Set `NEXT_PUBLIC_POSTHOG_KEY` and
   `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`.
3. Redeploy.
4. Open **Live Events** and walk through the flows below.
5. Confirm the signed-in distinct ID is the Supabase user UUID. It must never be
   an email address, display name, or phone number.

PostHog is configured with autocapture off, session recording off, exception
capture off, `person_profiles: "identified_only"`, and DNT respected. Pageviews
use History API changes, which fits App Router navigation.

Product events:

| Event | Where | Key properties |
|---|---|---|
| `signup_started` | Register page | none |
| `signup_completed` | Signup action | `country`, `email_confirmation_required` |
| `login` | Login action | `role` |
| `match_viewed` | Match page | `matchId`, `competition`, `status` |
| `bet_slip_add` | Selection button | selection/match snapshot |
| `bet_placed` | Place-bet action | `betId`, `betType`, `stake`, `totalOdds`, `potentialPayout`, `legCount`, `duplicate` |
| `bet_failed` | Place-bet action | `code` |
| `daily_claim` | Wallet action | claim amount |
| `bet_settled` | Settlement | `betId`, `status`, `payout` |
| `waitlist_join` | Signup action | `source`; anonymous, no person profile |

No event includes an email address. Waitlist events deliberately use a random
distinct ID and `$process_person_profile: false`.

If PostHog is down or misconfigured, analytics calls log and continue; they must
never block signup, betting, settlement, or wallet operations.

---

## 8. Smoke test checklist

Run this on the staging URL after every deploy that changes auth, betting,
settlement, provider sync, or headers. Use a real inbox you control.

### Staging verification status (2026-11-03)

| Check | Result |
|---|---|
| Home, `/live`, `/auth/login`, `/auth/register`, match detail, `/api/live` | Pass, HTTP 200 |
| EPL teams, 1X2, and O/U 2.5 render from provider data | Pass |
| Live fixture and odds sync | Pass: 10 fixtures, 20 markets, 50 selections, 0 odds failures |
| Admin Supabase login | Pass |
| Atomic `place_bet` rollback smoke test | Pass: 100 BET at 4.75; wallet restored to 12,000 BET / 0 bets |
| Stale-odds guard | Pass: stale attempt returned `ODDS_STALE`; fresh attempt accepted |
| `robots.txt` and `X-Robots-Tag` | Pass |
| Signup and reset email delivery | Pending: Resend/SMTP not configured |
| Sentry delivery and alerts | Pending: no DSN |
| PostHog event delivery | Pending: no project key |
| Automatic settlement of a completed match | Pending: no staging match has finished yet |
| Scheduled crons | Blocked: Hobby plan |
| Credential rotation | Partial: `CRON_SECRET` done; provider keys pending |

### Public and SEO

- [ ] `/` loads fixtures and markets; no horizontal scroll at 360px width.
- [ ] `/live` loads and polls scores.
- [ ] Match detail opens from the lobby; markets close after kickoff.
- [ ] `/legal` and `/waitlist` render.
- [ ] Response headers include `X-Robots-Tag: noindex, nofollow, noarchive`,
      CSP, HSTS, `X-Frame-Options: DENY`, and `nosniff`.
- [ ] `/robots.txt` disallows indexing.

### Auth and wallet

- [ ] Register a new player, confirm the email, and land signed in.
- [ ] Wallet starts at 10,000 BET; signup bonus appears once in the ledger.
- [ ] Claim 2,000 BET once; a second claim the same Lagos day is rejected.
- [ ] Forgot-password email arrives and the reset flow works.
- [ ] Logout and login work; suspended users cannot sign in.
- [ ] An unverified signup is not counted against the beta cap indefinitely
      (cleanup removes it after 24 hours).

### Betting

- [ ] Place a 100 BET single; wallet debits exactly once.
- [ ] Place a 2-leg accumulator from different matches.
- [ ] Adding a second selection from the same match replaces the first.
- [ ] Stakes below 100 and above 50,000 are rejected.
- [ ] A payout above 1,000,000 is capped.
- [ ] A changed price opens the odds-change review dialog and does not debit.
- [ ] Stale odds are rejected with `ODDS_STALE` and no debit. To test, set
      `odds_stale_seconds = 30`, pause `sync-odds` for 30+ seconds, attempt a
      bet, then restore the cutoff to 900 and re-enable the cron. The odds
      refresh window stays fixed at 5 minutes.
- [ ] Double-submitting the same slip does not create two bets.
- [ ] The 11th placement attempt in one minute is rate-limited.
- [ ] With `maintenance_mode = true`, new bets are blocked and existing bets
      still settle. Restore it to `false`.

### Settlement and admin

- [ ] Admin → Bets can settle an open bet from the provider result.
- [ ] Admin → Bets can void a bet; stake is refunded once.
- [ ] A settled bet cannot be paid twice by a repeated cron run.
- [ ] Admin → Users can adjust a balance and suspend/restore a player; both
      actions require a reason and appear in the audit log.
- [ ] Admin → Transactions shows the ledger with filters.
- [ ] Admin → Matches shows sync history and supports manual fixture/live/odds
      sync.
- [ ] Admin → Settings saves are audited and validated.
- [ ] The admin wallet is 12,000 BET with zero bets before smoke testing; use
      small stakes and clean up test bets if you need it back.

### Beta gate

- [ ] A new signup beyond the cap goes to the waitlist.
- [ ] Waitlist submissions are rate-limited at 5/minute/IP.
- [ ] `beta_enabled = false` routes new signups to the waitlist.
- [ ] Restore `beta_cap = 100`, `beta_enabled = true`, and
      `maintenance_mode = false` after testing.

### Observability

- [ ] A controlled Preview error appears in Sentry with the right tag and
      readable source.
- [ ] `signup_completed`, `login`, `match_viewed`, `bet_slip_add`,
      `bet_placed`, `daily_claim`, and `waitlist_join` appear in PostHog.
- [ ] PostHog distinct IDs are Supabase UUIDs; no email addresses are present.
- [ ] A failed cron appears in Sentry with `cron_job`.
- [ ] No Sentry or PostHog failure blocks a user flow.

---

## 9. Incident handling

### First five minutes

1. Check Vercel deployment status and runtime logs.
2. Check Sentry for new issues and cron failures; note the `boundary` or
   `cron_job` tag.
3. Check Supabase status and recent database errors.
4. Check Admin → Matches for the latest sync and settlement runs.
5. If betting integrity is at risk, set `maintenance_mode = true` in Admin →
   Settings (audited). Existing bets still settle.
6. Post a short status note to the beta channel: what is affected, what is safe,
   and when the next update will come.

### Provider outage or stale odds

Symptoms: `sync-*` returns 500, `sync_runs` shows failed runs, odds stop
updating, Sentry shows `cron_job`.

1. Confirm the provider status page and the API key/quota.
2. Check `sync_runs` metadata and the Vercel cron log.
3. Once odds pass `odds_stale_seconds`, `place_bet` rejects new bets with
   `ODDS_STALE` automatically. Do not raise the threshold to work around an
   outage; use `maintenance_mode` if the whole provider is down.
4. If fixtures cannot sync, do not manually invent matches. Wait for recovery or
   switch providers on a fresh staging catalog.
5. Verify recovery with a manual `sync-fixtures`, `sync-odds`, and `sync-live`,
   then confirm a test bet is accepted at fresh odds.

### Settlement failures

Symptoms: bets stay open after full time, Sentry warning
`Settlement completed with failed bets`, failures in the settle response.

1. Open Admin → Bets and inspect the affected legs and match status.
2. Confirm the provider reports a complete final score. Incomplete scores are
   intentionally skipped so bets stay pending.
3. If the provider result is correct but the bet is stuck, settle manually from
   the provider result and record the reason.
4. If the result is wrong or the match was abandoned, void the affected bets and
   record the reason. Never edit balances silently.
5. Re-run settle and confirm no double payout.

### Auth or email failure

1. Check Supabase Auth logs and the Resend dashboard.
2. Confirm the staging URL and `/auth/callback` are in Supabase redirect URLs.
3. Confirm the sender domain is still verified.
4. If confirmation emails fail, do not disable confirmation for the beta
   without an explicit decision; unverified accounts are cleaned up.

### Supabase outage

1. Set `maintenance_mode = true` if the admin console is still reachable.
2. Do not attempt local writes or manual ledger edits.
3. Wait for Supabase recovery, then verify wallet balances, open bets, and the
   latest settlement run before reopening.
4. Reconcile any bet placed during a partial outage from `wallet_transactions`
   and `bets`; escalate anomalies rather than guessing.

### Bad deploy

1. Roll back to the previous Vercel deployment.
2. If a migration shipped, do not roll it back blindly; assess compatibility
   first.
3. Re-run the smoke checklist on the rolled-back deployment.
4. Record the incident and the root cause before the next deploy.

### Sentry or PostHog outage

Sentry and PostHog are optional. Confirm users can still sign up, bet, claim,
and settle. Do not block the beta on analytics delivery; record the gap and
backfill decisions from database records if needed.

---

## 10. Beta exit criteria

Do not widen access beyond the 100-player beta until all of these are true:

- [ ] Full smoke checklist passed on the staging URL.
- [ ] Sentry receives client, server, and cron errors; source maps resolve.
- [ ] PostHog receives the core funnel events with no PII.
- [ ] At least one full match cycle settled automatically without manual
      intervention.
- [ ] No open P1/P2 incidents; no unresolved settlement failures.
- [ ] Provider quota and cron cadence are sustainable for the expected match
      volume.
- [ ] Beta cap and waitlist behave correctly under concurrency.
- [ ] Legal pages have Nigerian counsel review; 18+ and play-money messaging is
      clear.
- [x] Next.js 16.4.4 security patch applied and redeployed (2026-11-03).
- [ ] Vercel Pro enabled and all five crons running on schedule.
- [ ] Exposed Supabase service-role key, Sportmonks token, and The Odds API key
      rotated; old values revoked.
- [ ] Resend SMTP configured; signup confirmation and password reset delivered.
- [ ] Backup/restore and admin access procedures are documented and tested.

Until then, keep the URL unlisted, `noindex` in place, and the cap at 100.

---

## 11. Appendix

### Useful admin routes

| Route | Purpose |
|---|---|
| `/admin` | Dashboard, open liability, sync status |
| `/admin/matches` | Fixture coverage, manual sync |
| `/admin/bets` | Settle/void queue |
| `/admin/users` | Balances, adjustments, suspensions |
| `/admin/transactions` | Coin ledger |
| `/admin/settings` | Economy, beta gate, maintenance |
| `/admin/audit` | Every admin mutation |

### Read-only checks

```sql
-- Recent sync runs
select job, status, records_processed, started_at, finished_at, error
from public.sync_runs
order by started_at desc
limit 20;

-- Open bets and their matches
select b.id, b.status, b.stake, b.created_at,
       count(bl.id) as legs
from public.bets b
left join public.bet_legs bl on bl.bet_id = b.id
where b.status = 'open'
group by b.id
order by b.created_at desc;

-- Wallet ledger for one player
select type, amount, balance_after, created_at, metadata
from public.wallet_transactions
where user_id = '<user-uuid>'
order by created_at desc;
```

Use read-only queries for diagnosis. All mutations must go through the audited
admin console or the existing RPCs.

### Rollback and cleanup

- Vercel: promote the previous deployment.
- Catalog: `npm run seed:demo -- --clean` removes demo rows only.
- Test players: suspend them; do not delete profiles that have bets or ledger
  entries. Deleting auth users with financial history breaks referential
  integrity.
- Settings: restore the exact values in section 1 and record the reason in the
  audit log.

### Known gaps at the time of writing

- Staging runs on Vercel **Hobby**, so the five crons are disabled and syncs are
  manual. The deployment itself is healthy at
  `https://betapp-staging.vercel.app`.
- The Supabase service-role key, Sportmonks token, and The Odds API key still
  need rotation if they were echoed by the CLI. `CRON_SECRET` is rotated.
- Sentry and PostHog credentials are absent, so error delivery, alerting, and
  product events are unverified.
- Resend/SMTP is not configured; signup and password-reset email delivery is
  untested.
- No completed staging match has exercised automatic settlement end to end.
- The Odds API live sync is validated (10 fixtures, 20 markets, 50 selections),
  but its free plan cannot sustain the default cron cadence. BTTS and Double
  Chance are not in its bulk feed.
- Sportmonks free-plan coverage is limited to Denmark and Scotland.
- No permanent E2E suite is checked in; smoke tests are manual.
- Legal pages remain beta placeholders.
