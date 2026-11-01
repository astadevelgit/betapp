# BetApp

A closed-loop, play-money football sportsbook for a Nigeria-focused private
beta. BET coins have no cash value. There are no purchases, cash-outs, prizes,
or real-money wagers.

**Status:** Week 0 foundation complete. The fixture/odds feed, betting engine,
settlement, and full admin operations are next.

## Stack

- Next.js **16.4.3** (App Router, Cache Components, Proxy, Server Actions)
- React **19.3**, TypeScript, Tailwind CSS **v4**
- shadcn/ui (Base UI variant), lucide-react
- Supabase Postgres + Auth, `@supabase/ssr`
- Drizzle ORM + `postgres` driver
- Zod, React Hook Form, Zustand (installed for the bet slip)
- Vercel Pro (cron), API-Football, Resend, Sentry, PostHog

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
- Admin dashboard shell plus placeholders for matches, bets, users,
  transactions, settings, and audit.
- `noindex` metadata, `X-Robots-Tag`, and baseline security headers.
- One-time admin bootstrap script.

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
2. Copy the project URL, anon/publishable key, and service-role key from
   **Project Settings → API**.
3. Copy the pooler connection string (port `6543`) to `DATABASE_URL` and the
   direct connection string (port `5432`) to `DATABASE_URL_DIRECT`.
4. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local development.

### Apply the database migration

With the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste these files into the Supabase SQL editor, in order:

1. `supabase/migrations/20261101000001_foundation.sql`
2. `supabase/seed.sql`

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

## Database workflow

- **Supabase migrations are the source of truth.** Add numbered SQL files under
  `supabase/migrations/`.
- `lib/db/schema.ts` mirrors the foundation tables for typed queries. Keep it in
  sync with SQL.
- Coins are integer `bigint` values. Never use floats for balances.
- All wallet mutations must be atomic Postgres functions with an idempotency
  key. Do not mutate balances directly from the client.
- RLS is enabled on every user table. The service-role key is server-only and
  bypasses RLS, so it must follow an explicit authorization check.

## Route map

| Route | Access |
|---|---|
| `/` | Public lobby |
| `/live` | Public live centre placeholder |
| `/waitlist` | Public waitlist |
| `/legal` | Public beta legal placeholders |
| `/auth/login`, `/auth/register` | Guests |
| `/auth/forgot-password`, `/auth/reset-password` | Public recovery flow |
| `/my-bets`, `/wallet`, `/account` | Authenticated |
| `/admin/*` | Admin only |

## Current blockers

- Supabase URL/keys are not configured in this workspace, so auth and wallet
  runtime flows cannot be tested yet.
- Docker/psql are not installed; use a remote Supabase project for now.
- API-Football plan coverage must be verified before the fixture adapter is
  built.
- Legal pages are beta placeholders and need Nigerian counsel review before a
  public launch.

## Next build

1. API-Football adapter and fixture/odds/live sync jobs.
2. Lobby and match detail with real markets.
3. Bet slip and atomic `place_bet`.
4. Settlement engine, cron routes, and manual admin overrides.
5. RLS integration tests, rate limits, Sentry/PostHog, and staging beta.
