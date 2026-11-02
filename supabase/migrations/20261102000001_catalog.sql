-- BetApp catalog schema
-- Week 2: sports, competitions, teams, matches, markets, selections.
-- Provider payloads are normalized here; the database is the cache the app reads.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.match_status as enum (
  'scheduled',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled',
  'suspended'
);

create type public.market_type as enum ('1X2', 'OU25', 'BTTS', 'DC');

create type public.market_status as enum ('open', 'suspended', 'settled', 'void');

create type public.selection_name as enum (
  'home',
  'draw',
  'away',
  'over',
  'under',
  'yes',
  'no',
  '1X',
  'X2',
  '12'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint sports_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  external_id text not null unique,
  source text not null default 'api-football',
  name text not null,
  country text,
  logo_url text,
  season integer,
  priority integer not null default 100,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_external_id_not_blank check (char_length(external_id) > 0),
  constraint competitions_priority_non_negative check (priority >= 0)
);

create index competitions_sport_priority_idx
  on public.competitions (sport_id, priority, name);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  source text not null default 'api-football',
  name text not null,
  country text,
  logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_external_id_not_blank check (char_length(external_id) > 0)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  source text not null default 'api-football',
  sport_id uuid not null references public.sports (id) on delete restrict,
  competition_id uuid not null references public.competitions (id) on delete restrict,
  home_team_id uuid not null references public.teams (id) on delete restrict,
  away_team_id uuid not null references public.teams (id) on delete restrict,
  kickoff_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  minute integer,
  round text,
  venue text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_external_id_not_blank check (char_length(external_id) > 0),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_scores_non_negative check (
    (home_score is null or home_score >= 0)
    and (away_score is null or away_score >= 0)
  ),
  constraint matches_scores_paired check (
    (home_score is null and away_score is null)
    or (home_score is not null and away_score is not null)
  ),
  constraint matches_minute_range check (
    minute is null or (minute >= 0 and minute <= 130)
  )
);

create index matches_status_kickoff_idx
  on public.matches (status, kickoff_at);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_competition_kickoff_idx
  on public.matches (competition_id, kickoff_at);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  type public.market_type not null,
  status public.market_status not null default 'open',
  line numeric(4, 2),
  provider_market_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, type),
  constraint markets_line_positive check (line is null or line > 0)
);

create index markets_match_idx on public.markets (match_id);

create table public.selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  name public.selection_name not null,
  odds numeric(6, 3) not null,
  active boolean not null default true,
  provider_selection_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, name),
  constraint selections_odds_range check (odds > 1.000 and odds < 1000.000)
);

create index selections_market_idx on public.selections (market_id);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

create trigger competitions_set_updated_at
  before update on public.competitions
  for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

create trigger markets_set_updated_at
  before update on public.markets
  for each row execute function public.set_updated_at();

create trigger selections_set_updated_at
  before update on public.selections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the sport row (idempotent)
-- ---------------------------------------------------------------------------

insert into public.sports (slug, name)
values ('football', 'Football')
on conflict (slug) do nothing;

insert into public.app_settings (key, value, description)
values (
  'selected_league_ids',
  '[39, 140, 135, 78, 61, 2]'::jsonb,
  'API-Football league IDs synced by the fixture jobs.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security: catalog is public read, server/service-role write only
-- ---------------------------------------------------------------------------

alter table public.sports enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.markets enable row level security;
alter table public.selections enable row level security;

create policy "sports_public_read"
  on public.sports
  for select
  to anon, authenticated
  using (true);

create policy "competitions_public_read"
  on public.competitions
  for select
  to anon, authenticated
  using (true);

create policy "teams_public_read"
  on public.teams
  for select
  to anon, authenticated
  using (true);

create policy "matches_public_read"
  on public.matches
  for select
  to anon, authenticated
  using (true);

create policy "markets_public_read"
  on public.markets
  for select
  to anon, authenticated
  using (true);

create policy "selections_public_read"
  on public.selections
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.sports from anon, authenticated;
revoke all on table public.competitions from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.matches from anon, authenticated;
revoke all on table public.markets from anon, authenticated;
revoke all on table public.selections from anon, authenticated;

grant select on table public.sports to anon, authenticated;
grant select on table public.competitions to anon, authenticated;
grant select on table public.teams to anon, authenticated;
grant select on table public.matches to anon, authenticated;
grant select on table public.markets to anon, authenticated;
grant select on table public.selections to anon, authenticated;
