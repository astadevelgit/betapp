# BetApp — Implementation Plan

**Status:** Approved direction; no code written yet.
**Product:** Closed-loop, play-money football sportsbook for a Nigeria-focused private beta.
**Timeline:** 8 weeks, solo, ~$40–50/month infrastructure budget.
**Working name:** BetApp.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Sport | Football only in v1; basketball in v1.1 |
| Betting | Pre-match only; live scores/events, no in-play betting |
| Markets | 1X2, Over/Under 2.5, BTTS, Double Chance |
| Bet types | Singles and accumulators (2–10 legs) |
| Currency | BET coins; closed loop; no purchases, cash-out, or prizes |
| Signup / daily | 10,000 coins on verification; 2,000 coins daily (Africa/Lagos) |
| Limits | Min stake 100; max stake 50,000/bet; max payout 1,000,000; no same-match acca legs |
| Settlement | 90 minutes + stoppage; no extra time/penalties; void/refund rules |
| Access | 18+ self-declaration; Nigeria-focused; public browse; login to bet |
| Auth | Email/password + verification + reset; no Google/SMS in v1 |
| Beta | Open unlisted URL; cap 100; waitlist after; `noindex` |
| Admin | One seeded admin; full operational controls |
| Stack | Next.js 16.4, TypeScript, Tailwind, shadcn/ui, Supabase, Drizzle, Vercel Pro |
| Data | Sportmonks, football only |
| Email | Supabase Auth via Resend SMTP |
| Observability | Sentry + PostHog + Vercel logs |
| Revenue | None in v1 |

**Non-negotiables:** live scores, auto-settlement, admin console, mobile-first UX.
**Can slip:** basketball, Google sign-in, public SEO launch, ads/affiliate.

---

## 2. Architecture at a glance

```
Browser
  ├─ Next.js App Router (RSC pages + client components)
  ├─ Bet slip: Zustand + localStorage
  ├─ Live polling: SWR every 60s → /api/live
  └─ Mutations: Server Actions

Next.js on Vercel Pro
  ├─ Server Components → Drizzle → Supabase Postgres
  ├─ Server Actions → auth check → Postgres functions
  ├─ Route Handlers → cron jobs (protected by CRON_SECRET)
  └─ Sentry / PostHog / Vercel logs

Supabase
  ├─ Postgres (schema, ledger, bets, RLS)
  ├─ Auth (email/password, verification, reset)
  └─ Pooler (Supavisor) for serverless connections

Sportmonks
  ├─ Fixtures, competitions, teams
  ├─ Live scores/status/periods
  ├─ Pre-match odds
  └─ Final results

Resend SMTP → Supabase Auth emails
Sentry → errors; PostHog → product events
```

### Key principles

1. **The database is the cache.** Cron syncs the provider into Postgres; client polling reads our DB, not Sportmonks directly. This protects the API quota.
2. **All money movement is atomic.** Bet placement, settlement, daily claims, and admin adjustments happen inside Postgres functions with row locks and idempotency keys.
3. **Server is authoritative.** Client odds, stakes, and payouts are previews; the server validates and computes the final values.
4. **RLS is defense-in-depth.** Server queries are explicitly scoped by user; RLS blocks direct anon access.
5. **The provider is replaceable.** All Sportmonks access goes through an `OddsProvider` adapter; a managed feed can replace it later.

---

## 3. Repository structure

```
betapp/
  app/
    (public)/
      page.tsx                  # lobby
      live/page.tsx
      match/[id]/page.tsx
      waitlist/page.tsx
    (auth)/
      auth/login/page.tsx
      auth/register/page.tsx
      auth/forgot-password/page.tsx
      auth/reset-password/page.tsx
      auth/callback/route.ts
    (app)/
      my-bets/page.tsx
      wallet/page.tsx
      account/page.tsx
    admin/
      layout.tsx
      page.tsx
      matches/page.tsx
      bets/page.tsx
      users/page.tsx
      transactions/page.tsx
      settings/page.tsx
      audit/page.tsx
    api/
      live/route.ts
      matches/[id]/live/route.ts
      waitlist/route.ts
      cron/sync-fixtures/route.ts
      cron/sync-odds/route.ts
      cron/sync-live/route.ts
      cron/settle/route.ts
    layout.tsx
    globals.css
  components/
    ui/                         # shadcn primitives
    layout/                     # header, mobile nav, admin sidebar
    matches/                    # match card, live badge, markets
    bets/                       # bet slip, bet card, stake input
    wallet/                     # balance, transactions, daily claim
    admin/                      # tables, stat cards, dialogs
    shared/                     # empty state, skeletons, error state
  lib/
    supabase/                   # browser, server, admin clients
    db/                         # drizzle schema, queries, migrations helpers
    auth/                       # requireUser, requireAdmin
    betting/                    # odds, payout, settlement, validation
    provider/                   # sportmonks adapter, mapping, types
    validation/                 # shared Zod schemas
    rate-limit/                 # DB-based limiter
    analytics/                  # PostHog client/server
    utils/                      # formatting, dates, coins
  supabase/
    migrations/                 # SQL migrations
    seed.sql
  tests/
    unit/
    integration/
    e2e/
  docs/
  .env.example
  next.config.ts
  tailwind.config.ts
  drizzle.config.ts
  playwright.config.ts
  vitest.config.ts
  vercel.json
```

---

## 4. Data model and migrations

### Migration order

1. **001_foundation.sql** — extensions, enums/checks, `profiles`, `wallets`, `wallet_transactions`, `daily_claims`, `app_settings`, `waitlist`, `admin_audit_logs`, `sync_runs`.
2. **002_catalog.sql** — `sports`, `competitions`, `teams`, `matches`, `markets`, `selections`.
3. **003_betting.sql** — `bets`, `bet_legs`, indexes and constraints.
4. **004_functions.sql** — `handle_new_user`, `grant_signup_bonus`, `claim_daily`, `place_bet`, `apply_bet_settlement`, `admin_adjust_balance`, `reserve_beta_slot`.
5. **005_rls.sql** — RLS policies and function grants.
6. **006_seed.sql** — football sport, app settings, seeded admin, demo competitions/teams (staging only).

### Core tables

| Table | Important columns / constraints |
|---|---|
| `profiles` | `id uuid PK → auth.users`, `email`, `display_name`, `dob`, `country`, `role` (`user`/`admin`), `status` (`active`/`suspended`/`deleted`), `created_at`, `deleted_at` |
| `wallets` | `user_id PK`, `balance bigint ≥ 0`, `currency 'BET'`, `version int`, `updated_at` |
| `wallet_transactions` | `id`, `user_id`, `type`, `amount bigint` (signed), `balance_before`, `balance_after`, `reference`, `metadata jsonb`, `idempotency_key unique`, `created_at` |
| `daily_claims` | `user_id`, `claim_date date`, `amount`, `created_at`; unique `(user_id, claim_date)` |
| `sports` | `id`, `name`, `slug` |
| `competitions` | `id`, `sport_id`, `external_id unique`, `name`, `country`, `logo_url` |
| `teams` | `id`, `external_id unique`, `name`, `logo_url` |
| `matches` | `id`, `external_id unique`, `sport_id`, `competition_id`, `home_team_id`, `away_team_id`, `kickoff_at`, `status`, `home_score`, `away_score`, `minute`, `last_synced_at` |
| `markets` | `id`, `match_id`, `type`, `status`, `updated_at`; unique `(match_id, type)` |
| `selections` | `id`, `market_id`, `name`, `odds numeric(6,3)`, `active`; unique `(market_id, name)` |
| `bets` | `id`, `user_id`, `type` (`single`/`accumulator`), `stake bigint`, `total_odds numeric(18,6)`, `potential_payout bigint`, `status` (`open`/`won`/`lost`/`void`), `placed_at`, `settled_at`, `idempotency_key unique` |
| `bet_legs` | `id`, `bet_id`, `match_id`, `market_id`, `selection_id`, `odds_at_placement numeric(6,3)`, `result` (`pending`/`won`/`lost`/`void`), `settled_at` |
| `admin_audit_logs` | `id`, `admin_id`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `reason`, `created_at` |
| `app_settings` | `key text PK`, `value jsonb` |
| `waitlist` | `id`, `email unique`, `created_at`, `status` |
| `sync_runs` | `id`, `job`, `status`, `started_at`, `finished_at`, `records_processed`, `error` |

### Data rules

- **Coins are integers.** Store `bigint`; serialize as strings in JSON; format on the client. Never use floats for money.
- **Odds are numeric.** Leg odds `numeric(6,3)`; total odds `numeric(18,6)`; display 2 decimals.
- **Payout:** `floor(stake * product(leg odds))`, capped at 1,000,000 coins.
- **Timestamps:** UTC in Postgres; display Africa/Lagos.
- **Deletion:** soft-delete profile, anonymize PII, disable auth login, retain ledger/bets.

### Enums / checks

Use Postgres enums for stable domain values:
`profile_role`, `profile_status`, `wallet_tx_type`, `bet_type`, `bet_status`, `leg_result`, `match_status`, `market_type`, `market_status`, `selection_name`.

If a value is likely to change, use `text` + `CHECK` instead. Keep provider-specific statuses mapped in code, not stored raw.

---

## 5. Core backend flows

### 5.1 Auth and onboarding

1. User submits email, password, display name, DOB, country.
2. Server Action validates with Zod; rejects under-18.
3. `reserve_beta_slot()` checks the cap; if full, inserts into `waitlist` and returns `BETA_FULL`.
4. `supabase.auth.signUp()` creates the auth user.
5. A trigger creates `profiles` and an empty `wallets` row.
6. User verifies email via Supabase/Resend.
7. On first confirmed login, `grant_signup_bonus(user_id)` credits 10,000 coins exactly once (idempotency key `signup_grant:{user_id}`).
8. Unverified profiles older than 24 hours are purged by cron to free beta slots.

**Protected routes:** `/my-bets`, `/wallet`, `/account`, `/admin/*`.
**Admin check:** `profiles.role = 'admin'`; otherwise 404/redirect.

### 5.2 Place bet

**Input:** user, idempotency key, bet type, stake, legs `[{matchId, marketId, selectionId, expectedOdds}]`.

**Validation:**
- User active; stake integer within 100–50,000.
- Single = 1 leg; accumulator = 2–10 legs.
- All matches `scheduled` and kickoff > now + 60s.
- Markets `open`; selections active.
- No duplicate match in an accumulator; no duplicate market.
- Current odds equal expected odds. If not, return `ODDS_CHANGED` with current odds; no debit.
- Wallet balance ≥ stake.
- Idempotency key unused; if used, return the existing bet.

**Transaction (`place_bet` Postgres function):**
1. `SELECT wallet FOR UPDATE`.
2. Re-check balance.
3. Insert `bets` + `bet_legs` with odds snapshots.
4. Deduct stake; insert `wallet_transactions` (`bet_stake`, negative).
5. Return bet payload.

**Client behavior:** disable submit while pending; on `ODDS_CHANGED`, update slip and show a confirmation modal; on success, clear slip and link to My Bets.

### 5.3 Settlement

**Cron:** `/api/cron/settle` every 5 minutes.

1. Find open bets with legs on `finished` matches.
2. Compute each leg result in TypeScript:
   - **1X2:** home / draw / away from final score.
   - **OU 2.5:** total goals > 2.5 → over; else under.
   - **BTTS:** both teams score.
   - **Double Chance:** 1X (home/draw), X2 (draw/away), 12 (home/away).
3. Call `apply_bet_settlement(bet_id, leg_results, settled_by, reason)`.
4. Function locks the bet and wallet; if already settled, no-op.
5. Outcome:
   - Any lost leg → bet lost.
   - All won → bet won; credit payout.
   - Some void + rest won → recalculate product excluding void legs; credit payout.
   - All void → refund stake.
6. Insert wallet transaction; update bet/legs; audit if manual.

**Manual admin settle/void:** server action checks admin role, calls the same function with `settled_by = admin.id` and a reason; writes audit log. Corrections after settlement use a compensating balance adjustment plus audit, not silent edits.

### 5.4 Daily claim

`claim_daily(user_id)`:
- Compute `claim_date` in `Africa/Lagos`.
- Insert `daily_claims` with unique `(user_id, claim_date)`.
- If conflict, return `ALREADY_CLAIMED`.
- Lock wallet; credit 2,000; insert `wallet_transactions` (`daily_claim`).
- Return new balance and next claim time.

### 5.5 Admin adjustments

`admin_adjust_balance(admin_id, user_id, amount, reason)`:
- Lock wallet; prevent negative balance.
- Insert signed `wallet_transactions` (`admin_adjustment`).
- Insert `admin_audit_logs` with before/after balances.
- Return updated wallet.

### 5.6 Beta cap and waitlist

- `app_settings.beta_cap = 100`.
- Signup uses an advisory lock (`pg_advisory_xact_lock`) to avoid races.
- Count active profiles; if full, insert into `waitlist` and return `BETA_FULL`.
- `/waitlist` form stores email; rate-limited; no auth.
- Admin can raise the cap in settings.

---

## 6. Provider integration (Sportmonks)

### Adapter interface

```ts
interface OddsProvider {
  getCompetitions(): Promise<ProviderCompetition[]>;
  getFixtures(params: { from: string; to: string; leagueIds?: number[] }): Promise<ProviderFixture[]>;
  getLiveFixtures(): Promise<ProviderFixture[]>;
  getOdds(fixtureId: string): Promise<ProviderOdds | null>;
  getResults(params: { date: string }): Promise<ProviderFixture[]>;
}
```

### Sync jobs

| Job | Schedule | Work |
|---|---|---|
| `sync-fixtures` | Every 6 hours | Upcoming fixtures for selected leagues (next 7 days); upsert competitions, teams, matches |
| `sync-odds` | Every 10 minutes | Pre-match odds for up to 8 upcoming matches; upsert markets/selections; skip fresh data |
| `sync-live` | Every 2 minutes | Live fixtures/scores/status/periods; update matches; flag finished |
| `settle` | Every 5 minutes | Settle open bets on finished matches |
| `cleanup` | Daily | Purge unverified profiles >24h; prune old sync logs |

### Market mapping

| Sportmonks market ID | Our market | Selection names |
|---|---|---|
| `1` Match Winner | `1X2` | home / draw / away |
| `80` Goals Over/Under, total `2.5` | `OU25` | over / under |
| `14` Both Teams To Score | `BTTS` | yes / no |
| `2` Double Chance | `DC` | 1X / X2 / 12 |

- Request `filters=markets:1,2,14,80` and filter O/U to line 2.5.
- Pick the bookmaker with the most complete set of the four markets.
- If a market is missing, hide it; never invent odds.
- Store provider market IDs and the selected bookmaker in metadata for debugging.
- The free plan exposes leagues `271` and `501` only; upgrade before production.

### Reliability

- All provider calls are server-only; key never reaches the client.
- Log every run to `sync_runs`; capture failures in Sentry.
- If odds are stale >5 minutes, suspend new bets on affected matches.
- If the provider is down, serve cached DB data and show "live updates delayed."
- Use `FOR UPDATE SKIP LOCKED` for settlement to avoid double processing.
- Add a `CRON_SECRET` check to every cron route.
- Respect the 180 requests/hour free-plan quota: only selected leagues; cache; backoff on 429.

---

## 7. Frontend plan

### Layout and navigation

- **Desktop:** top header (logo, Live, Football, My Bets, Wallet, avatar) + right-side bet slip drawer.
- **Mobile:** bottom nav (Home, Live, My Bets, Wallet, Account) + floating bet slip button with count.
- **Admin:** left sidebar with dashboard, matches, bets, users, transactions, settings, audit.

### Pages

**Lobby (`/`)**
- Hero/featured live or next match.
- "Live now" section with live scores.
- "Upcoming" grouped by date/competition.
- Competition filter chips; empty/loading/error states.

**Match detail (`/match/[id]`)**
- Header: teams, crests, score, minute, status.
- Markets accordion: 1X2, O/U 2.5, BTTS, Double Chance.
- Odds buttons add to slip; disabled if suspended/started.
- Live events timeline (if provider supplies events).
- "Odds unavailable" state when the feed lacks a market.

**Bet slip**
- Tabs: Singles / Accumulator.
- Selection rows with remove buttons; stake input; potential payout.
- Login prompt if unauthenticated; slip persists.
- Odds-changed modal; confirmation modal; success toast.
- Validation messages for min/max stake, insufficient balance, started match.

**My Bets (`/my-bets`)**
- Tabs: Open / Settled.
- Bet cards: type, stake, total odds, potential payout, legs with results, status badge.
- Filters by date/status; empty state.

**Wallet (`/wallet`)**
- Balance card in BET coins.
- Daily claim button with countdown and disabled state.
- Transaction list: type, amount, balance after, timestamp.

**Account (`/account`)**
- Display name, email, DOB, country.
- Change password; sign out; delete account (confirmation + anonymization).

**Admin**
- Dashboard: users, bets, open liability, coins issued, sync status, settlement failures.
- Matches: sync status, kickoff, score, market count; manual refresh.
- Bets: filter by status/user/match; settle/void dialog with reason.
- Users: search, status, balance, adjust balance, suspend.
- Transactions: filter by type/user/date.
- Settings: signup grant, daily amount, stake limits, max payout, beta cap.
- Audit: admin actions with before/after and reason.

### Design system

- Dark background (`#0B0F14`), surface (`#121821`), green primary (`#22C55E`), danger (`#EF4444`), muted text (`#94A3B8`).
- shadcn/ui: Button, Card, Dialog, Sheet, Tabs, Table, Input, Select, Toast, Skeleton, Badge, AlertDialog.
- Mobile-first; test at 360px, 768px, 1280px.
- Loading skeletons; empty states; error boundaries; accessible focus states.

### Client state

- **Bet slip:** Zustand + `persist` to localStorage; hydrate guard; remove selections for started matches on load.
- **Live polling:** SWR with `refreshInterval: 60000`, `refreshWhenHidden: false`, `dedupingInterval: 30000`.
- **Filters:** URL search params, server-rendered.
- **No optimistic wallet updates.** Wait for server confirmation; show pending states.

---

## 8. Security and privacy

### Authorization

- Every Server Action calls `requireUser()` or `requireAdmin()`.
- User ID always comes from the session, never from client input.
- Admin routes and actions check `profiles.role = 'admin'`.
- Service role key is server-only (`server-only` import guard).

### Database

- RLS enabled on all user tables.
- Policies: users select their own profile, wallet, transactions, bets, legs, daily claims; public read for matches/markets/selections.
- Functions are `SECURITY DEFINER` with `search_path = public`; revoke execute from `anon`/`authenticated`; grant to `service_role`.
- All mutations use explicit user/admin IDs passed from authenticated server code.

### Abuse prevention

- Supabase Auth built-in rate limits.
- Bet placement: max 10 attempts/minute/user (DB-based limiter).
- Daily claim: unique constraint + 1/day.
- Waitlist: 5 submissions/minute/IP.
- Idempotency keys for bet placement and claims.
- Beta cap with advisory lock; purge unverified profiles after 24h.
- Vercel Firewall rules for obvious abuse.

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `SPORTMONKS_API_TOKEN`, `CRON_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`, `POSTHOG_KEY`. `API_FOOTBALL_KEY` is an optional legacy fallback.
- Never prefix server secrets with `NEXT_PUBLIC_`.
- `.env.local` gitignored; Vercel env vars per environment.

### Privacy

- Collect minimum PII: email, display name, DOB, country.
- 18+ self-declaration; no KYC in v1.
- Privacy policy and terms; responsible-play page.
- Account deletion anonymizes PII and disables login; ledger retained for audit.
- NDPA/legal review before public or real-money launch.
- PostHog: identify by user ID, not email; disclose analytics in privacy policy.

---

## 9. Observability

- **Sentry:** client, server, edge; capture Server Action errors, cron failures, provider errors; source maps.
- **PostHog events:** `signup_started`, `signup_completed`, `login`, `match_viewed`, `bet_slip_add`, `bet_placed`, `bet_failed`, `daily_claim`, `bet_settled`, `waitlist_join`.
- **Vercel logs:** function logs, cron logs; retain per plan.
- **`sync_runs`:** job name, status, records, error, duration.
- **Admin dashboard:** last successful sync, stale matches, open bets, settlement failures, coins issued.
- **Alerts:** Sentry alert on cron failure and provider error spikes; Vercel spend alerts.

---

## 10. Testing strategy

### Unit (Vitest)
- Payout math and rounding.
- Accumulator void recalculation.
- Market settlement for all four markets.
- Stake/odds validation.
- Date/timezone helpers (WAT).

### Integration (Supabase local)
- `place_bet`: balance debit, idempotency, odds change, limits, duplicate legs, started match.
- `claim_daily`: one per day, unique constraint, correct amount.
- `apply_bet_settlement`: won/lost/void/all-void; no double credit.
- `admin_adjust_balance`: audit log, no negative balance.
- RLS: user A cannot read user B's wallet/bets.
- Beta cap race: concurrent signups do not exceed 100.

### E2E (Playwright)
- Signup → verify email → grant → claim daily → browse → single bet → accumulator → My Bets.
- Admin login → sync → settle/void → adjust balance → audit.
- Mobile viewport smoke test.
- Odds-changed flow.
- Waitlist when beta full.

### Contract
- Sportmonks adapter with recorded fixtures; mapping tests for all four markets.
- Cron routes with mocked provider; assert DB updates and idempotency.

---

## 11. Environments and deployment

| Environment | App | Database | Purpose |
|---|---|---|---|
| Local | `next dev` | Supabase local (Docker) | Development, tests |
| Preview/Staging | Vercel preview | Supabase staging project | QA, beta dry run |
| Production | Vercel Pro | Supabase production | Beta launch |

### Setup

1. Create Supabase projects (free tier: 2 projects).
2. Configure Auth: email provider, redirect URLs, Resend SMTP, email templates.
3. Run migrations via Supabase CLI.
4. Seed football sport, app settings, admin user.
5. Create Vercel project; add env vars.
6. Add `vercel.json` crons:
   - `/api/cron/sync-live` → `*/2 * * * *`
   - `/api/cron/sync-odds` → `*/10 * * * *`
   - `/api/cron/settle` → `*/5 * * * *`
   - `/api/cron/sync-fixtures` → `0 */6 * * *`
7. Configure Sentry and PostHog projects.
8. Configure domain and DNS (including Resend SPF/DKIM/DMARC).
9. Run staging beta with 5–10 testers.
10. Launch production beta to 100 users.

### CI/CD

- GitHub Actions: install, lint, typecheck, unit tests, build.
- Supabase migration check on PR.
- Vercel preview deploy per PR; production on `main`.
- Apply migrations before production deploy; forward-only, reviewed.
- Playwright optional on PR, required before release.

### Backups

- Supabase free tier has no backups. Export schema/data weekly during beta.
- Upgrade to Supabase Pro ($25/mo) before public launch for daily backups.

---

## 12. Delivery plan (8 weeks)

| Week | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| 0 | Validation & setup | Confirm Sportmonks plan; create accounts; repo; schema review; design tokens | Provider covers fixtures, live, odds, results; environments ready |
| 1 | Foundation | Next 16.4 app; Supabase; migrations 001–002; auth; profiles/wallets; layout | Signup, verify, login, reset work; wallet created |
| 2 | Data & lobby | Provider adapter; fixture/odds sync; lobby; match detail; live polling | Real fixtures/odds render; live scores update every 60s |
| 3 | Betting | Bet slip; `place_bet`; My Bets; wallet; daily claim | Single and acca placed atomically; balances correct |
| 4 | Settlement & admin | Settlement engine; cron; admin dashboard/matches/bets/users/settings/audit | Auto-settlement and manual override work |
| 5 | Beta & hardening | Waitlist/cap; RLS tests; rate limits; error/empty states; mobile polish | Security checklist passes; beta gate works |
| 6 | Observability & QA | Sentry/PostHog; E2E; email deliverability; legal pages; staging deploy | E2E green; alerts configured |
| 7 | Staging beta | 5–10 testers; bug fixes; cron reliability; performance | No P0/P1 bugs; settlement accurate |
| 8 | Production beta | Launch to 100; monitor; iterate | Stable 7 days; baseline metrics captured |

### 4-week critical path (if deadline compresses)

Keep: auth, lobby, match detail, bet slip, `place_bet`, My Bets, wallet, daily claim, basic admin settle/void, waitlist.
Cut/defer: PostHog, advanced admin filters, live events timeline, polished empty states, email templates beyond verification/reset.
Do not cut: atomic ledger, idempotency, RLS, auto-settlement tests, legal pages.

---

## 13. Work breakdown and acceptance criteria

### Epic 1 — Foundation
- Next.js 16.4 + TypeScript + Tailwind + shadcn/ui.
- Supabase local/prod; Drizzle; migrations; seed.
- Dark theme tokens; header/mobile nav; auth pages.
- **Done:** signup, verification, login, logout, reset; protected route redirects.

### Epic 2 — Catalog and provider
- Sportmonks adapter; fixture/odds/live sync; `sync_runs`.
- Optional API-Football and The Odds API adapters behind `FOOTBALL_PROVIDER`.
- Lobby and match detail with real data.
- **Done:** selected leagues render; live scores update; missing markets hide gracefully. The Odds API covers 1X2 and O/U 2.5 from its bulk feed.

### Epic 3 — Betting engine
- Bet slip store; `place_bet`; odds validation; idempotency.
- My Bets; wallet ledger; daily claim.
- **Done:** single/acca bets debit exactly once; duplicate submit safe; daily claim once/day.

### Epic 4 — Settlement
- Pure settlement functions; `apply_bet_settlement`; cron.
- Admin settle/void with audit.
- **Done:** won/lost/void/all-void cases correct; no double credit; manual override audited.

### Epic 5 — Admin console
- Dashboard metrics; matches; bets; users; transactions; settings; audit.
- **Done:** admin can operate the full beta without SQL.

### Epic 6 — Beta gate and security
- Waitlist; cap 100; noindex.
- RLS policies; rate limits; security headers; RLS tests.
- **Done:** 101st signup goes to waitlist; user A cannot access user B data.

### Epic 7 — Observability and QA
- Sentry; PostHog events; error boundaries; E2E.
- **Done:** client/server/edge Sentry, all error boundaries, source-map gating,
  and the ten PostHog events are wired. A production build verified a hydrated
  boundary with a real digest. Core flows were verified manually; a permanent
  E2E suite is still pending.

### Epic 8 — Launch
- Staging beta; production deploy; monitoring; runbook.
- **Done:** 100 users invited; stable 7 days; settlement accuracy verified.
- **Runbook:** `docs/STAGING_BETA_RUNBOOK.md`.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sportmonks free plan covers only 2 leagues and 180 requests/hour | Keep syncs within budget; upgrade before production; selected-league fallback |
| Market mapping gaps | Contract tests with real payloads; hide unsupported markets; log unmapped IDs |
| Settlement errors | Pure functions + tests + manual override + audit; daily reconciliation |
| Provider outage | DB cache; stale banner; suspend betting on stale odds; Sentry alert |
| Email deliverability | Custom domain; SPF/DKIM/DMARC; test Gmail/Outlook; resend flow |
| Supabase free pause/no backups | Keep-alive or upgrade to Pro before launch; weekly exports |
| Solo timeline | 8-week plan; 4-week critical path; cut analytics/polish first |
| Single admin | Document runbook; add backup admin later |
| RLS/service-role mistake | RLS tests; code review; least-privilege grants; no client service key |
| Legal/regulatory | Closed-loop play money; counsel review; no purchases/cash-out/prizes |
| Next.js security patch | Pin 16.4.x; patch Nov 3, 2026 release immediately |

---

## 15. Immediate next steps (before coding)

1. **Verify Sportmonks coverage.** Confirm the plan includes fixtures, live scores/periods, pre-match odds, and final results for the selected leagues. The current free token exposes leagues `271` and `501`.
2. **Pick league coverage.** The free plan is limited to the Danish Superliga and Scottish Premiership. Upgrade before production and set `SPORTMONKS_LEAGUE_IDS` to the paid-plan leagues.
3. **Create accounts:** Supabase, Vercel Pro, Resend, Sentry, PostHog, GitHub.
4. **Choose domain and brand.** `BetApp` is a placeholder; domain needed for Resend and deployment.
5. **Legal review scope.** Terms, privacy, responsible play, NDPA; confirm play-money classification.
6. **Approve this plan and the schema.** Then scaffold the app and write migration 001.

---

## 16. Definition of done for v1

- A new user can sign up, verify email, receive 10,000 coins, claim daily coins, browse live/upcoming matches, place a single and an accumulator, and see them in My Bets.
- Bets settle automatically from final results; winnings/refunds credit exactly once; admin can override with an audit trail.
- Wallet ledger is consistent; no negative balances; duplicate submissions are safe.
- Admin can operate matches, bets, users, balances, settings, and audit without SQL.
- RLS and authorization tests pass; no user can read another user's data.
- Mobile-first UI works at 360px, 768px, and 1280px; loading/empty/error states exist.
- Sentry/PostHog/Vercel logs capture errors and key events; cron failures alert.
- Beta cap and waitlist work; `noindex` is set.
- Legal pages are live; deployment is reproducible; runbook exists.
