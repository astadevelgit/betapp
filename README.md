# BetApp

A closed-loop, play-money football sportsbook for a Nigeria-focused private
beta. BET coins have no cash value. There are no purchases, cash-outs, prizes,
or real-money wagers.

**Status:** Foundation, catalog, Sportmonks provider sync, lobby, match detail,
the Week 3 betting engine, and Week 4 settlement are in place. The remaining
admin screens are next.

## Stack

- Next.js **16.4.3** (App Router, Cache Components, Proxy, Server Actions)
- React **19.3**, TypeScript, Tailwind CSS **v4**
- shadcn/ui (Base UI variant), lucide-react
- Supabase Postgres + Auth, `@supabase/ssr`
- Drizzle ORM + `postgres` driver
- Zod, React Hook Form, Zustand (installed for the bet slip)
- Vercel Pro (cron), Sportmonks, Resend, Sentry, PostHog

The full product and delivery plan is in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

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
- Sportmonks adapter for fixtures, live scores, results, and pre-match odds.
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
- Admin Bets screen with audited settle/void actions and an audit log.
- Demo catalog seeder for local UI work.
- Admin dashboard, bet settlement queue, and audit log; placeholders remain for
  matches, users, transactions, and settings.
- `noindex` metadata, `X-Robots-Tag`, and baseline security headers.
- One-time admin bootstrap script.
- Verified end-to-end against Supabase: admin login, protected-route redirects,
  wallet balance and ledger, idempotent daily claim, and the confirmed-email
  signup bonus (10,000 BET).

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
  --file supabase/seed.sql --yes
```

Or paste these files into the Supabase SQL editor, in order:

1. `supabase/migrations/20261101000001_foundation.sql`
2. `supabase/migrations/20261102000001_catalog.sql`
3. `supabase/migrations/20261102000002_sportmonks.sql`
4. `supabase/migrations/20261102000003_betting.sql`
5. `supabase/migrations/20261102000004_settlement.sql`
6. `supabase/seed.sql`

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

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run check` | Lint + typecheck |
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

- Docker/psql are not installed; use a remote Supabase project for now.
- The Sportmonks free plan covers only the Danish Superliga (`271`) and
  Scottish Premiership (`501`) with 180 requests/hour. Production coverage
  needs a paid plan or a different provider token.
- Legal pages are beta placeholders and need Nigerian counsel review before a
  public launch.
- **Patch Next.js 16.4.3 on Nov 3, 2026.** A security release is scheduled for
  that date; upgrade and redeploy as soon as it ships.

## Provider sync

Sportmonks is the preferred provider. The sync jobs normalize provider data
into Postgres, so the lobby and live polling never call Sportmonks directly.

| Job | Schedule | Free-plan budget |
|---|---|---|
| `sync-live` | Every 2 minutes | In-play + today's results |
| `sync-odds` | Every 10 minutes | Up to 8 fixtures |
| `sync-fixtures` | Every 6 hours | Next 7 days |
| `settle` | Every 5 minutes | No provider calls; final results already in Postgres |

On the free plan this stays under the 180 requests/hour limit. Protect the
routes with `Authorization: Bearer $CRON_SECRET`. The selected league IDs live
in `SPORTMONKS_LEAGUE_IDS`; the `selected_league_ids` app setting is kept in
sync for admin tooling.

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

For a UI smoke test, place a small bet as the seeded admin, verify My Bets and
Wallet, then delete the bet's `wallet_transactions` row, delete the bet, and
credit the stake back. The current admin wallet is **12,000** with no bets after
cleanup.

## Next build

1. Full admin matches/users/settings/transactions screens.
2. RLS integration tests, rate limits, Sentry/PostHog, and staging beta.
3. Nigerian legal review and the Next.js security patch.
