# BetApp

A closed-loop, play-money football sportsbook for a Nigeria-focused private
beta. BET coins have no cash value. There are no purchases, cash-outs, prizes,
or real-money wagers.

**Status:** Staging is deployed at **https://betapp-staging.vercel.app** on
Vercel Hobby. The foundation, catalog, provider sync, lobby, match detail,
betting engine, settlement, admin console, Epic 6 security hardening, and Epic 7
observability are in place. Next.js **16.4.4** is applied, and The Odds API has
been validated live with EPL fixtures and odds. Hobby accounts cannot run the
per-minute cron schedule, so staging syncs are manual until Vercel Pro is
enabled. Remaining work is credential rotation, Pro cron enablement,
Sentry/PostHog/Resend configuration, a mobile viewport pass, and Nigerian legal
review.

## Stack

- Next.js **16.4.4** (App Router, Cache Components, Proxy, Server Actions)
- React **19.3**, TypeScript, Tailwind CSS **v4**
- shadcn/ui (Base UI variant), lucide-react
- Supabase Postgres + Auth, `@supabase/ssr`
- Drizzle ORM + `postgres` driver
- Zod, React Hook Form, Zustand (installed for the bet slip)
- Vercel **Hobby** for staging, **Pro** for scheduled crons; Sportmonks,
  API-Football, The Odds API, Resend, Sentry, PostHog

The full product and delivery plan is in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Staging setup,
smoke tests, and incident handling are in
[`docs/STAGING_BETA_RUNBOOK.md`](docs/STAGING_BETA_RUNBOOK.md).

## What is in this foundation

- Dark/green, mobile-first design system and responsive public/app/admin shells.
- Email/password auth pages: register, login, verify callback, forgot password,
  reset password.
- Supabase SSR clients (browser, server, service-role) and a Next.js `proxy.ts`
  that refreshes sessions and optimistically protects private routes.
- Authoritative `requireUser()` / `requireAdmin()` checks in protected layouts
  and Server Actions.
- Foundation migration:
  - `profiles`, `wallets`, `wallet_transactions`, `daily_claims`
  - `app_settings`, `waitlist`, `admin_audit_logs`, `sync_runs`
  - beta-cap enforcement, idempotent signup bonus, daily claim function
  - RLS policies and least-privilege grants
- Drizzle schema mirror and lazy server database client.
- Wallet page with balance, daily claim, and ledger activity.
- Catalog schema for competitions, teams, matches, markets, and selections.
- Provider adapters for Sportmonks, API-Football, and The Odds API behind one
  normalized interface, with explicit `FOOTBALL_PROVIDER` selection.
- Protected cron sync jobs with `sync_runs` logging and rate-limit-aware
  scheduling.
- Public lobby, live centre, and match detail with markets and 60-second live
  score polling.
- Persisted bet slip with Singles/Accumulator tabs, stake and payout preview,
  login prompt, and an odds-change review dialog.
- Atomic `place_bet` RPC with idempotency, odds snapshots, wallet locking,
  duplicate-match rejection, stake limits, and a capped payout.
- My Bets with open/settled tabs, leg results, and payout summaries.
- Automatic settlement cron for 1X2, O/U 2.5, BTTS, and Double Chance, with
  void-leg recalculation and full void/refund handling.
- Admin console: dashboard, bet settlement queue, matches and sync status,
  users with audited balance adjustments and suspensions, ledger transactions,
  settings, and the audit log.
- Demo catalog seeder for local UI work.
- RLS on every user table, DB-backed fixed-window rate limits, a serialized beta
  cap, daily cleanup of expired buckets and unverified signups, and a strict
  `noindex` policy.
- A static Content Security Policy plus COOP/CORP, HSTS, frame, MIME, referrer,
  and permissions headers. The CSP deliberately keeps `'unsafe-inline'` for
  Next.js hydration because nonce-based CSP is incompatible with Cache
  Components/PPR.
- One-time admin bootstrap script.
- Sentry on the client, server, edge runtime, and every error boundary, plus
  PostHog product events that identify users by Supabase ID only.
- Verified end-to-end against Supabase: admin login, protected-route redirects,
  wallet balance and ledger, idempotent daily claim, and the confirmed-email
  signup bonus (10,000 BET). A production build was used to verify a hydrated
  error boundary with a real digest.

## Prerequisites

- Node.js 22+ (this repo was built on Node 26)
- npm 10+
- A Supabase project (remote is fine)
- Supabase CLI (optional but recommended) or the Supabase SQL editor

Docker is **not required** for this setup. Supabase local development is
deferred until Docker Desktop is available.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in the Supabase values in `.env.local`:

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL and publishable key (or legacy anon key), plus the
   secret key (or legacy service-role key) from **Project Settings → API**.
   Use `SUPABASE_SERVICE_ROLE_KEY` for either secret value.
3. Copy the pooler connection string (port `6543`) to `DATABASE_URL` and the
   direct connection string (port `5432`) to `DATABASE_URL_DIRECT`.
4. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local development.
5. Add `SPORTMONKS_API_TOKEN` and set `SPORTMONKS_LEAGUE_IDS=271,501` for the
   free plan. The provider prefers Sportmonks when this token is present.
   `API_FOOTBALL_KEY` remains an optional legacy fallback.

### Apply the database migration

With the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`db push` needs the database password. If you do not have it, apply SQL through
the Management API instead (this is the path this project used):

```bash
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261101000001_foundation.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000001_catalog.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000002_sportmonks.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000003_betting.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000004_settlement.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000005_admin.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000006_security.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000007_stale_odds.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/migrations/20261102000008_odds_cutoff.sql --yes
npx supabase db query --linked --project-ref <your-project-ref> \
  --file supabase/seed.sql --yes
```

Or paste these files into the Supabase SQL editor, in order:

1. `supabase/migrations/20261101000001_foundation.sql`
2. `supabase/migrations/20261102000001_catalog.sql`
3. `supabase/migrations/20261102000002_sportmonks.sql`
4. `supabase/migrations/20261102000003_betting.sql`
5. `supabase/migrations/20261102000004_settlement.sql`
6. `supabase/migrations/20261102000005_admin.sql`
7. `supabase/migrations/20261102000006_security.sql`
8. `supabase/migrations/20261102000007_stale_odds.sql`
9. `supabase/migrations/20261102000008_odds_cutoff.sql`
10. `supabase/seed.sql`

The hosted CLI asks for explicit confirmation before write statements; pass
`--yes` only after reviewing the file. Read-only checks can use `--read-only`
without confirmation.

The migration creates triggers on `auth.users`, so it must run with the
Supabase migration role (the CLI or SQL editor does this).

### Configure Supabase Auth

In **Authentication → URL Configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://<your-production-domain>/auth/callback`

Keep email confirmation **enabled**. The signup bonus is granted when
`email_confirmed_at` is set, and the callback also calls the idempotent grant
function as a fallback.

For production email delivery, configure Resend as Supabase Auth's SMTP
provider and set SPF/DKIM/DMARC on the sending domain.

### Create the admin

```bash
# .env.local needs ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME, ADMIN_DOB
npm run seed:admin
```

The script creates or updates the auth user, promotes the matching profile to
`admin`, and ensures a wallet exists.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Staging deployment

Staging is live at **https://betapp-staging.vercel.app** (Vercel project
`asta-2e53/betapp-staging`). It is publicly reachable but unlisted and marked
`noindex`.

| Item | Staging value |
|---|---|
| Provider | `FOOTBALL_PROVIDER=the-odds-api` |
| Sport key | `soccer_epl` |
| Fixture cap | `ODDS_SYNC_MAX_FIXTURES=40` |
| Catalog | 10 EPL matches, 20 markets, 50 selections |
| Next.js | 16.4.4 |
| Cron jobs | Disabled on Hobby; run manually |

`NEXT_PUBLIC_SITE_URL` is the staging URL, and Supabase Auth uses it as the Site
URL with `https://betapp-staging.vercel.app/auth/callback` and
`http://localhost:3000/auth/callback` allow-listed.

### Deploy on Hobby

Hobby accounts reject any cron schedule that runs more than once per day. The
full Pro schedule stays in `vercel.json`; `vercel.staging.json` contains an empty
schedule. Vercel's `--local-config` flag does **not** suppress the root
`vercel.json` during deploy, so use the wrapper, which swaps in the staging
config and restores the Pro config even when the deploy fails:

```bash
npm run deploy:staging
```

Do not edit `vercel.json` by hand before deploying.

### Trigger jobs manually

Until Vercel Pro is enabled, invoke the jobs with the same bearer secret Vercel
would send. Set `CRON_SECRET` in the shell first, then:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
$base = "https://betapp-staging.vercel.app"
foreach ($job in "sync-fixtures", "sync-odds", "sync-live", "settle", "cleanup") {
  Invoke-RestMethod -Uri "$base/api/cron/$job" -Headers $headers
}
```

Run `sync-fixtures` every 6 hours, `sync-odds` every 10 minutes, `sync-live`
every 2 minutes while matches are in play, `settle` every 5 minutes, and
`cleanup` once a day. On Pro, deploy normally with `npx vercel deploy --prod`;
the five crons in `vercel.json` are registered automatically.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run check` | Lint + typecheck |
| `npm run deploy:staging` | Deploy to Vercel staging with Hobby-safe crons |
| `npm run db:generate` | Generate Drizzle SQL diff into `drizzle/` |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed:admin` | Create/promote the seeded admin |
| `npm run seed:demo` | Seed demo fixtures, teams, markets, and odds |
| `npm run seed:demo -- --clean` | Remove demo catalog rows |

## Database workflow

- **Supabase migrations are the source of truth.** Add numbered SQL files under
  `supabase/migrations/`.
- `lib/db/schema.ts` mirrors the foundation tables for typed queries. Keep it in
  sync with SQL.
- Coins are integer `bigint` values. Never use floats for balances.
- All wallet mutations must be atomic Postgres functions with an idempotency
  key. Do not mutate balances directly from the client.
- `place_bet` and `apply_bet_settlement` are the only writers for bets and
  bet-leg outcomes. Do not settle via direct table updates.
- RLS is enabled on every user table. The service-role key is server-only and
  bypasses RLS, so it must follow an explicit authorization check.

## Security and abuse prevention

- **Authorization:** every Server Action calls `requireUser()` or
  `requireAdmin()`; user IDs come from the session, never from browser input.
  Admin RPCs re-check the caller's role inside Postgres.
- **RLS:** private tables have select-own policies and revoked direct grants.
  Catalog tables are public-read. `rate_limit_buckets` has no authenticated or
  anonymous policy and is service-role-only.
- **Rate limits:** `consume_rate_limit` is an atomic Postgres fixed-window
  counter. Bet placement is capped at **10 attempts/minute/user**; the waitlist
  is capped at **5 submissions/minute/IP**. The IP is SHA-256 hashed with
  `RATE_LIMIT_SALT` (falling back to `CRON_SECRET`) before storage.
- **Beta cap:** `handle_new_user` takes a transaction-scoped advisory lock
  before counting profiles, so concurrent signups cannot exceed `beta_cap`.
- **Cleanup:** `/api/cron/cleanup` runs daily at 03:00 UTC. It deletes expired
  rate-limit buckets and unverified `auth.users` older than 24 hours. Profiles
  with bets are skipped.
- **Headers:** CSP, COOP, CORP, Origin-Agent-Cluster,
  X-Permitted-Cross-Domain-Policies, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  referrer, permissions, and `X-Robots-Tag: noindex`.
- **Noindex:** metadata, `robots.ts`, and the response header all disallow
  indexing.

### Credential rotation

`CRON_SECRET` was rotated and verified on 2026-11-03. The Supabase service-role
key, Sportmonks token, and any The Odds API key that was printed by a CLI must
still be treated as exposed until they are replaced.

1. Create the replacement value in the provider dashboard.
2. Update `.env.local`.
3. Update Vercel Production and Preview by piping the value on stdin; never pass
   a secret with `--value`, because the CLI echoes it into terminal output.
4. Redeploy and verify the affected flow.
5. Revoke the old value only after every deployment uses the replacement.

Rotating the Supabase JWT secret invalidates both legacy anon and service-role
keys and signs users out. Prefer creating a new `sb_secret_...` key, switching
`SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), then revoking the old
key. The publishable/anon key can stay in place if the JWT secret is unchanged.

CSP uses `'unsafe-inline'` for scripts and styles rather than a per-request
nonce. Next.js nonces require every page to render dynamically and are
documented as incompatible with PPR, which this app uses through Cache
Components. Revisit the CSP if the rendering model changes.

Epic 6 was verified against the hosted project with rollback SQL assertions
(grants, beta cap, purge, limiter), a two-session signup race, 11 bet attempts
(10 accepted, 11th limited), 6 waitlist submissions (5 accepted, 6th limited),
and a cleanup cron run that removed one expired bucket and one stale unverified
account.

## Observability

Sentry and PostHog are optional. Without their keys, both integrations are
no-ops; they never block signup, betting, settlement, or wallet operations.

**Sentry** covers the browser, Node server, and edge runtime. `instrumentation.ts`
registers the server/edge SDK and captures Server Component, Server Action,
Route Handler, and Proxy errors through `onRequestError`. Every error boundary
uses `components/system/error-state.tsx`, reports with a `boundary` tag, and
shows **Try again** plus a digest reference:

| Boundary | Scope tag |
|---|---|
| `app/global-error.tsx` | `global` |
| `app/error.tsx` | `root` |
| `app/(public)/error.tsx` | `public` |
| `app/(app)/error.tsx` | `app` |
| `app/(auth)/error.tsx` | `auth` |
| `app/admin/error.tsx` | `admin` |

Cron errors are captured with a `cron_job` tag; settlement failures are reported
as a warning when any bet fails to settle. `sendDefaultPii` is `false` and logs
are disabled. Source maps upload only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
`SENTRY_PROJECT` are all present.

**PostHog** captures ten named product events: `signup_started`,
`signup_completed`, `login`, `match_viewed`, `bet_slip_add`, `bet_placed`,
`bet_failed`, `daily_claim`, `bet_settled`, and `waitlist_join`. Signed-in users
are identified by their Supabase UUID, never by email. Autocapture, session
recording, exception capture, and person profiles for anonymous users are
disabled. The waitlist uses a random distinct ID with
`$process_person_profile: false`. Pageviews follow History API changes so App
Router navigation is captured without a blocking route hook.

CSP allows connections to `https://*.sentry.io` and `https://*.posthog.com`.
The full staging setup, alert rules, smoke tests, and incident procedures are in
the [staging beta runbook](docs/STAGING_BETA_RUNBOOK.md).

## Route map

| Route | Access |
|---|---|
| `/` | Public lobby |
| `/live` | Public live centre |
| `/waitlist` | Public waitlist |
| `/legal` | Public beta legal placeholders |
| `/auth/login`, `/auth/register` | Guests |
| `/auth/forgot-password`, `/auth/reset-password` | Public recovery flow |
| `/my-bets`, `/wallet`, `/account` | Authenticated |
| `/admin/*` | Admin only |

## Current blockers

- **Vercel is on Hobby**, so the five production cron schedules are disabled.
  Staging syncs and settlement are manual until Pro is enabled. The deployment
  itself is live and healthy.
- **Rotate exposed credentials before widening access:** the Supabase
  service-role key, Sportmonks token, and any The Odds API key printed by the
  CLI. `CRON_SECRET` has already been rotated. See
  [Credential rotation](#credential-rotation).
- Sentry and PostHog credentials are absent, so real error delivery, alerting,
  and product events are unverified.
- Resend/SMTP is not configured, so signup and password-reset email delivery is
  untested.
- `DATABASE_URL` and `DATABASE_URL_DIRECT` are blank locally; the Drizzle scripts
  need them. Vercel staging does not use them at runtime.
- Docker/psql are not installed; use the remote Supabase project for now.
- The Sportmonks free plan covers only the Danish Superliga (`271`) and
  Scottish Premiership (`501`) with 180 requests/hour. Production coverage
  needs a paid plan or a different provider token.
- The Odds API has no Nigerian league; `soccer_epl` is the default. Its free
  plan cannot sustain the default cron cadence, and BTTS/Double Chance are not
  in its bulk odds feed.
- No permanent E2E test suite is checked in; smoke tests are manual.
- Legal pages are beta placeholders and need Nigerian counsel review before a
  public launch.
- No completed match has exercised automatic settlement end to end on staging
  yet; the settlement path is covered by local and rolled-back database checks.

## Provider sync

Sportmonks is the preferred provider. The sync jobs normalize provider data
into Postgres, so the lobby and live polling never call Sportmonks directly.

| Job | Schedule | Free-plan budget |
|---|---|---|
| `sync-live` | Every 2 minutes | In-play + today's results |
| `sync-odds` | Every 10 minutes | Up to 8 fixtures; refreshes markets older than 5 minutes |
| `sync-fixtures` | Every 6 hours | Next 7 days |
| `settle` | Every 5 minutes | No provider calls; final results already in Postgres |

Staging was validated against the live The Odds API on 2026-11-03: **10 EPL
fixtures, 20 markets, 50 selections**, and zero odds failures. The events
request must use `YYYY-MM-DDTHH:MM:SSZ`; ISO timestamps with milliseconds are
rejected with HTTP 422.

`sync-odds` uses a fixed 5-minute refresh window so each run picks up markets
that were not refreshed recently, regardless of the betting cutoff. Betting is
rejected only when a market is older than `odds_stale_seconds` (default **900
seconds / 15 minutes**), so one missed 10-minute sync does not stop all betting.
The cutoff is enforced atomically in `place_bet`.

On the free plan this stays under the 180 requests/hour limit. Protect the
routes with `Authorization: Bearer $CRON_SECRET`. The selected league IDs live
in `SPORTMONKS_LEAGUE_IDS`; the `selected_league_ids` app setting is kept in
sync for admin tooling.

`/api/cron/cleanup` runs daily at 03:00 UTC for expired rate-limit buckets and
unverified profiles, and logs to `sync_runs` under the `cleanup` job.

### Team crests

The Odds API supplies team names but not images. The 20 current EPL crests are
bundled in `public/teams/epl/` and mapped by team name in
`lib/provider/epl-team-logos.ts`. Unknown teams fall back to their initials, and
catalog sync preserves an existing `logo_url` when a provider returns `null`.

When clubs are promoted or relegated, replace the affected PNGs and update the
mapping. The images are sourced from
[FootyLogos.com](https://www.footylogos.com/); club crests remain the property
of their respective owners and are credited on `/legal#credits`.

### The Odds API (optional)

The Odds API is supported as a third provider. It is not selected automatically
when Sportmonks or API-Football credentials are present. To use it explicitly:

```bash
FOOTBALL_PROVIDER=the-odds-api
THE_ODDS_API_KEY=...
THE_ODDS_API_SPORT_KEYS=soccer_epl
ODDS_SYNC_MAX_FIXTURES=40
```

Staging currently runs this exact configuration against `soccer_epl`. The live
adapter validated 10 fixtures, 20 markets, and 50 selections with zero odds
failures. Fixture discovery uses the free events endpoint; one bulk odds call
covers the whole slate.

The adapter uses the credit-efficient endpoints:

- `/v4/sports` and `/v4/sports/{sport}/events` — free; used for competitions and
  scheduled fixtures.
- `/v4/sports/{sport}/odds` — costs 1 credit per market per region. The adapter
  requests `h2h` (1X2) and `totals` (O/U 2.5), so **2 credits per sport key per
  odds-sync run**.
- `/v4/sports/{sport}/scores?daysFrom=1` — 2 credits. One call is shared by the
  live-score and result paths inside `syncLive`, so a live run costs **2 credits
  per sport key**.

**Market coverage:** The bulk `/odds` endpoint exposes 1X2 and O/U 2.5. The
Odds API's `btts` and `double_chance` markets are per-event add-ons and are not
requested by this adapter, so those two BetApp markets will be absent when The
Odds API is the only provider. Use Sportmonks when full market coverage matters.

**Credit budget:** The free plan is **500 credits/month**. With the default cron
schedule (live every 2 minutes, odds every 10 minutes), one sport key costs
roughly **1,700 credits/day (~52K/month)**. The 100K plan ($59/month) covers that
schedule comfortably; the 20K plan ($30/month) needs slower live/odds intervals.
The number of users does **not** change API usage — only cron frequency, the
number of sport keys, and the number of regions do. A 100-user beta is fine on a
paid plan; it is not viable on the free plan at the current sync cadence.

Because the adapter shares one bulk `/odds` response across every fixture in a
run, you can raise `ODDS_SYNC_MAX_FIXTURES` (for example to `40`) to cover a full
slate without increasing the credit cost. That setting only limits how many
catalog rows are processed per run. Leave it at `8` for Sportmonks on its free
plan.

The Odds API does not report halftime, postponed, or cancelled states, and its
event/team IDs are provider-specific. Switching providers on an existing catalog
creates new rows for future fixtures; old rows age out as they settle. Use a
fresh staging database when comparing providers.

## Betting flow

1. Pick any open selection on a scheduled match. The slip stores a snapshot of
   the teams, competition, kickoff, market, and odds in `localStorage`.
2. Add another selection from a different match to build an accumulator. A
   second selection from the same match replaces the first, so accumulator legs
   are always from distinct matches.
3. Choose **Singles** (exactly one selection) or **Accumulator** (2–10 legs),
   enter a whole-coin stake, and review the previewed total odds and payout.
4. `placeBetAction` authenticates the session, validates the payload with Zod,
   and calls `place_bet` through the server-only service role. The browser never
   supplies a user ID.
5. `place_bet` locks the wallet and the catalog rows, re-checks every selection,
   and compares the expected odds with the current odds. If anything moved it
   returns `ODDS_CHANGED` with the current prices and does not debit the wallet.
   If any market is older than `odds_stale_seconds` (default 900 seconds), it
   returns `ODDS_STALE` and does not debit. This stops new risk during a provider
   outage while allowing one missed 10-minute odds sync.
6. On success the stake is debited once, a `bet_stake` ledger row is written,
   and the slip clears. Retrying the same submission key returns the original
   bet without a second debit.

Limits: minimum stake **100**, maximum stake **50,000**, maximum payout
**1,000,000** BET per bet. Odds are snapshotted on each leg; settlement will use
the snapshot, not the live price.

### Settlement

`/api/cron/settle` runs every five minutes. It loads open bets whose legs have a
final provider state and evaluates each leg from the regulation-time score:

- **1X2:** home / draw / away.
- **O/U 2.5:** over or under the stored line; an exact push is void.
- **BTTS:** both teams scored.
- **Double Chance:** 1X (home or draw), X2 (draw or away), 12 (home or away).

`apply_bet_settlement` locks the bet and wallet, updates every leg, and settles
once:

- Any lost leg → bet lost, no payout.
- All won → bet won, payout from the odds snapshots.
- Some void + rest won → payout recalculated excluding the void legs.
- All void → bet void, full stake refunded.

Postponed and cancelled fixtures are void. A suspended match stays pending
until it resumes or an admin resolves it. A repeat settlement call is a no-op,
so overlapping cron runs cannot credit twice.

Admins can settle from the provider result or void a bet from **Admin → Bets**.
The action requires a reason and writes `admin_audit_logs` with before/after
snapshots. Corrections after settlement are handled by a separate audited
balance adjustment, never by silently editing the bet.

### Admin console

The console is designed to operate the beta without SQL:

- **Dashboard:** players, open bets, open liability, coins issued, sync status,
  and settlement failures.
- **Matches:** fixture coverage, live scores, market depth, latest run for each
  provider job, and manual fixture/live/odds sync buttons.
- **Bets:** open and settled bets with audited settle/void dialogs.
- **Users:** search and status filters, wallet balances, audited balance
  adjustments, and suspend/restore.
- **Transactions:** the read-only coin ledger with type, player, and date
  filters.
- **Settings:** the economy grants, stake and payout limits, the stale-odds
  rejection threshold, beta cap/toggle, and maintenance mode.
- **Audit log:** every admin mutation with before/after values and the reason.

`admin_adjust_balance` is idempotent, rejects zero and over-limit adjustments,
and cannot take a wallet below zero. `admin_set_user_status` blocks changes to
the admin's own account. `admin_update_settings` only accepts the nine editable
keys and validates ranges before writing. All three functions are
`SECURITY DEFINER` and executable only by `service_role`; the server actions
authenticate the admin first.

`maintenance_mode` pauses new bet placements in `placeBetAction` while existing
bets continue to settle. `beta_enabled = false` sends new signups to the
waitlist without changing the beta cap.

### Testing bets without polluting the ledger

Use a transaction and roll it back for RPC checks:

```sql
begin;
select public.place_bet(
  '<user-uuid>',
  'local-test-1',
  'single',
  100,
  '[{"matchId":"...","marketId":"...","selectionId":"...","expectedOdds":6.000}]'::jsonb
);
rollback;
```

For a UI smoke test, use small stakes and accept the resulting ledger entries.
If you need a clean staging ledger, reset the staging database rather than
deleting individual ledger rows. The current admin wallet is **12,000** with no
bets after cleanup.

## Next build

1. Deploy staging and run the [beta runbook](docs/STAGING_BETA_RUNBOOK.md).
2. Configure Sentry and PostHog, then verify alert delivery and the event
   funnel with real credentials.
3. Run the mobile viewport smoke test.
4. Decide whether The Odds API is supplemental or primary, add a live key, and
   verify its competitions, fixtures, odds, live scores, and final results.
5. Apply the Next.js security patch scheduled for Nov 3, 2026.
6. Complete Nigerian legal review before public launch.
