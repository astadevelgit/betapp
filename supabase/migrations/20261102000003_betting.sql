-- BetApp betting schema
-- Week 3: bets, bet legs, atomic placement, idempotency, and RLS.
-- Stakes and payouts are integer BET coins. Odds are snapshotted at placement.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.bet_type as enum ('single', 'accumulator');
create type public.bet_status as enum ('open', 'won', 'lost', 'void');
create type public.leg_result as enum ('pending', 'won', 'lost', 'void');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  type public.bet_type not null,
  stake bigint not null,
  -- Unbounded numeric: long accumulators can produce very large odds products.
  -- The payout itself is capped below, so this cannot create an unbounded credit.
  total_odds numeric not null,
  potential_payout bigint not null,
  payout bigint not null default 0,
  status public.bet_status not null default 'open',
  idempotency_key text not null unique,
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by uuid references public.profiles (id) on delete set null,
  settlement_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint bets_stake_range check (stake between 100 and 50000),
  constraint bets_total_odds_positive check (total_odds > 1),
  constraint bets_potential_payout_range check (
    potential_payout > 0 and potential_payout <= 1000000
  ),
  constraint bets_payout_non_negative check (payout >= 0),
  constraint bets_settlement_consistent check (
    (status = 'open' and settled_at is null)
    or (status <> 'open' and settled_at is not null)
  )
);

create index bets_user_placed_idx
  on public.bets (user_id, placed_at desc);
create index bets_user_status_placed_idx
  on public.bets (user_id, status, placed_at desc);
create index bets_status_placed_idx
  on public.bets (status, placed_at desc);

create table public.bet_legs (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete restrict,
  market_id uuid not null references public.markets (id) on delete restrict,
  selection_id uuid not null references public.selections (id) on delete restrict,
  odds_at_placement numeric(6, 3) not null,
  result public.leg_result not null default 'pending',
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bet_legs_one_per_match unique (bet_id, match_id),
  constraint bet_legs_one_per_market unique (bet_id, market_id),
  constraint bet_legs_odds_range check (
    odds_at_placement > 1.000 and odds_at_placement < 1000.000
  ),
  constraint bet_legs_settlement_consistent check (
    (result = 'pending' and settled_at is null)
    or (result <> 'pending' and settled_at is not null)
  )
);

create index bet_legs_bet_idx on public.bet_legs (bet_id);
create index bet_legs_match_result_idx
  on public.bet_legs (match_id, result);
create index bet_legs_selection_idx on public.bet_legs (selection_id);

-- ---------------------------------------------------------------------------
-- Betting settings (idempotent)
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description)
values
  ('min_stake', '100'::jsonb, 'Minimum stake per bet in BET coins.'),
  ('max_stake', '50000'::jsonb, 'Maximum stake per bet in BET coins.'),
  ('max_payout', '1000000'::jsonb, 'Maximum payout per bet in BET coins.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Atomic bet placement
--
-- The server action authenticates the user, then calls this function with the
-- service role. p_user_id is never accepted from the browser. Expected odds are
-- supplied by the client snapshot; any mismatch returns the current odds so the
-- slip can be refreshed before retrying.
-- ---------------------------------------------------------------------------

create or replace function public.place_bet(
  p_user_id uuid,
  p_idempotency_key text,
  p_bet_type public.bet_type,
  p_stake bigint,
  p_legs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_status public.profile_status;
  v_existing public.bets%rowtype;
  v_wallet public.wallets%rowtype;
  v_leg jsonb;
  v_leg_count integer;
  v_expected_odds numeric;
  v_match_id uuid;
  v_market_id uuid;
  v_selection_id uuid;
  v_current_odds numeric(6, 3);
  v_market_status public.market_status;
  v_selection_active boolean;
  v_match_status public.match_status;
  v_kickoff_at timestamptz;
  v_reason text;
  v_match_ids uuid[] := '{}';
  v_market_ids uuid[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_total_odds numeric := 1;
  v_potential_payout bigint;
  v_bet_id uuid;
  v_balance_after bigint;
  v_min_stake bigint;
  v_max_stake bigint;
  v_max_payout bigint;
  i integer;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or char_length(trim(p_idempotency_key)) < 8
     or char_length(p_idempotency_key) > 100 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_IDEMPOTENCY_KEY',
      'message', 'Refresh the page and try again.'
    );
  end if;

  select status
  into v_profile_status
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'ACCOUNT_NOT_FOUND',
      'message', 'Your account could not be found.'
    );
  end if;

  if v_profile_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'code', 'ACCOUNT_INACTIVE',
      'message', 'Your account cannot place bets right now.'
    );
  end if;

  -- Serialize retries for the same user and submission key.
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
  );

  select *
  into v_existing
  from public.bets
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.user_id <> p_user_id then
      return jsonb_build_object(
        'ok', false,
        'code', 'IDEMPOTENCY_CONFLICT',
        'message', 'This submission key is already in use.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'bet', jsonb_build_object(
        'id', v_existing.id,
        'type', v_existing.type,
        'stake', v_existing.stake,
        'totalOdds', v_existing.total_odds,
        'potentialPayout', v_existing.potential_payout,
        'status', v_existing.status,
        'placedAt', v_existing.placed_at
      ),
      'balance', (
        select balance from public.wallets where user_id = p_user_id
      )
    );
  end if;

  select coalesce((value #>> '{}')::bigint, 100)
  into v_min_stake
  from public.app_settings
  where key = 'min_stake';
  v_min_stake := coalesce(v_min_stake, 100);

  select coalesce((value #>> '{}')::bigint, 50000)
  into v_max_stake
  from public.app_settings
  where key = 'max_stake';
  v_max_stake := coalesce(v_max_stake, 50000);

  select coalesce((value #>> '{}')::bigint, 1000000)
  into v_max_payout
  from public.app_settings
  where key = 'max_payout';
  v_max_payout := coalesce(v_max_payout, 1000000);

  if p_stake is null or p_stake < v_min_stake or p_stake > v_max_stake then
    return jsonb_build_object(
      'ok', false,
      'code', 'STAKE_OUT_OF_RANGE',
      'message', format(
        'Stake must be between %s and %s BET coins.',
        v_min_stake,
        v_max_stake
      ),
      'minStake', v_min_stake,
      'maxStake', v_max_stake
    );
  end if;

  if p_bet_type is null or jsonb_typeof(p_legs) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_BET',
      'message', 'The bet slip is not valid.'
    );
  end if;

  v_leg_count := jsonb_array_length(p_legs);

  if p_bet_type = 'single' and v_leg_count <> 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LEG_COUNT',
      'message', 'A single bet needs exactly one selection.'
    );
  end if;

  if p_bet_type = 'accumulator' and (v_leg_count < 2 or v_leg_count > 10) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LEG_COUNT',
      'message', 'An accumulator needs between 2 and 10 selections.'
    );
  end if;

  for i in 0..v_leg_count - 1 loop
    v_leg := p_legs -> i;

    if jsonb_typeof(v_leg) <> 'object' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_BET',
        'message', 'The bet slip is not valid.'
      );
    end if;

    if coalesce(v_leg ->> 'matchId', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_leg ->> 'marketId', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_leg ->> 'selectionId', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_leg ->> 'expectedOdds', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_BET',
        'message', 'The bet slip is not valid.'
      );
    end if;

    v_expected_odds := (v_leg ->> 'expectedOdds')::numeric;

    -- Lock the catalog rows so odds/status cannot change between validation
    -- and the leg insert. The lock is released when this transaction ends.
    select
      mk.match_id,
      mk.id,
      s.id,
      s.odds,
      mk.status,
      s.active,
      m.status,
      m.kickoff_at
    into
      v_match_id,
      v_market_id,
      v_selection_id,
      v_current_odds,
      v_market_status,
      v_selection_active,
      v_match_status,
      v_kickoff_at
    from public.selections s
    join public.markets mk on mk.id = s.market_id
    join public.matches m on m.id = mk.match_id
    where s.id = (v_leg ->> 'selectionId')::uuid
      and mk.id = (v_leg ->> 'marketId')::uuid
      and m.id = (v_leg ->> 'matchId')::uuid
    for share of s, mk, m;

    if not found then
      v_changes := v_changes || jsonb_build_object(
        'selectionId', v_leg ->> 'selectionId',
        'marketId', v_leg ->> 'marketId',
        'matchId', v_leg ->> 'matchId',
        'currentOdds', null,
        'reason', 'SELECTION_UNAVAILABLE',
        'message', 'This selection is no longer available.'
      );
      continue;
    end if;

    v_reason := null;

    if v_match_status <> 'scheduled' or v_kickoff_at <= now() + interval '60 seconds' then
      v_reason := 'MATCH_STARTED';
    elsif v_market_status <> 'open' then
      v_reason := 'MARKET_SUSPENDED';
    elsif not v_selection_active then
      v_reason := 'SELECTION_INACTIVE';
    elsif round(v_expected_odds, 3) <> v_current_odds then
      v_reason := 'ODDS_CHANGED';
    end if;

    if v_reason is not null then
      v_changes := v_changes || jsonb_build_object(
        'selectionId', v_selection_id,
        'marketId', v_market_id,
        'matchId', v_match_id,
        'currentOdds', v_current_odds,
        'reason', v_reason,
        'message', case v_reason
          when 'MATCH_STARTED' then 'This match has started and is closed for betting.'
          when 'MARKET_SUSPENDED' then 'This market is suspended.'
          when 'SELECTION_INACTIVE' then 'This selection is unavailable.'
          else 'The odds for this selection have changed.'
        end
      );
      continue;
    end if;

    if v_match_id = any(v_match_ids) then
      return jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE_MATCH',
        'message', 'An accumulator cannot include two selections from the same match.'
      );
    end if;

    if v_market_id = any(v_market_ids) then
      return jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE_MARKET',
        'message', 'An accumulator cannot include the same market twice.'
      );
    end if;

    v_match_ids := array_append(v_match_ids, v_match_id);
    v_market_ids := array_append(v_market_ids, v_market_id);
    v_total_odds := v_total_odds * v_current_odds;
  end loop;

  if jsonb_array_length(v_changes) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'ODDS_CHANGED',
      'message', 'One or more selections changed. Review the updated slip.',
      'changes', v_changes
    );
  end if;

  v_total_odds := round(v_total_odds, 6);
  v_potential_payout := least(
    floor(p_stake * v_total_odds)::bigint,
    v_max_payout
  );

  if v_potential_payout < 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_BET',
      'message', 'The potential payout is not valid.'
    );
  end if;

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'WALLET_NOT_FOUND',
      'message', 'Your wallet could not be loaded.'
    );
  end if;

  if v_wallet.balance < p_stake then
    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_BALANCE',
      'message', 'You do not have enough BET coins for this stake.',
      'balance', v_wallet.balance
    );
  end if;

  insert into public.bets (
    user_id,
    type,
    stake,
    total_odds,
    potential_payout,
    idempotency_key
  )
  values (
    p_user_id,
    p_bet_type,
    p_stake,
    v_total_odds,
    v_potential_payout,
    p_idempotency_key
  )
  returning id into v_bet_id;

  for i in 0..v_leg_count - 1 loop
    v_leg := p_legs -> i;

    insert into public.bet_legs (
      bet_id,
      match_id,
      market_id,
      selection_id,
      odds_at_placement
    )
    select
      v_bet_id,
      mk.match_id,
      mk.id,
      s.id,
      s.odds
    from public.selections s
    join public.markets mk on mk.id = s.market_id
    where s.id = (v_leg ->> 'selectionId')::uuid
      and mk.id = (v_leg ->> 'marketId')::uuid;
  end loop;

  v_balance_after := v_wallet.balance - p_stake;

  update public.wallets
  set balance = v_balance_after,
      version = version + 1
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference,
    metadata,
    idempotency_key
  )
  values (
    p_user_id,
    'bet_stake',
    -p_stake,
    v_wallet.balance,
    v_balance_after,
    'bet:' || v_bet_id::text,
    jsonb_build_object(
      'bet_id', v_bet_id,
      'bet_type', p_bet_type,
      'legs', v_leg_count
    ),
    'bet_stake:' || v_bet_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'bet', jsonb_build_object(
      'id', v_bet_id,
      'type', p_bet_type,
      'stake', p_stake,
      'totalOdds', v_total_odds,
      'potentialPayout', v_potential_payout,
      'status', 'open',
      'placedAt', now()
    ),
    'balance', v_balance_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.bets enable row level security;
alter table public.bet_legs enable row level security;

create policy "bets_select_own"
  on public.bets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "bet_legs_select_own"
  on public.bet_legs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bets b
      where b.id = bet_id
        and b.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.bets from anon, authenticated;
revoke all on table public.bet_legs from anon, authenticated;

grant select on table public.bets to authenticated;
grant select on table public.bet_legs to authenticated;

revoke all on function public.place_bet(uuid, text, public.bet_type, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_bet(uuid, text, public.bet_type, bigint, jsonb)
  to service_role;
