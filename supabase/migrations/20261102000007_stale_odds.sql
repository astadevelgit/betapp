-- BetApp stale-odds guard
-- Reject new bets when any leg's market has not been refreshed within the
-- odds_stale_seconds setting. This closes the gap between the provider sync
-- cadence and bet placement during a provider outage.
--
-- This migration only replaces public.place_bet. Existing grants are preserved.

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
  v_market_updated_at timestamptz;
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
  v_odds_stale_seconds integer;
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

  -- Never trust an unset or nonsensical setting. The admin UI enforces 30-3600.
  select (value #>> '{}')::integer
  into v_odds_stale_seconds
  from public.app_settings
  where key = 'odds_stale_seconds';
  v_odds_stale_seconds := greatest(coalesce(v_odds_stale_seconds, 300), 30);

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
      m.kickoff_at,
      mk.updated_at
    into
      v_match_id,
      v_market_id,
      v_selection_id,
      v_current_odds,
      v_market_status,
      v_selection_active,
      v_match_status,
      v_kickoff_at,
      v_market_updated_at
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
    elsif v_market_updated_at < now() - make_interval(secs => v_odds_stale_seconds) then
      -- A provider outage must stop new risk instead of accepting old prices.
      return jsonb_build_object(
        'ok', false,
        'code', 'ODDS_STALE',
        'message', 'The odds for this match are out of date. Please try again shortly.'
      );
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
