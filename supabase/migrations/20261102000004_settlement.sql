-- BetApp settlement schema
-- Week 4: atomic bet settlement, void/refund recalculation, and audited
-- manual admin overrides.
--
-- Auto-settlement is computed in TypeScript from the final score and passed to
-- apply_bet_settlement as leg results. The function locks the bet and wallet,
-- credits at most once, and no-ops on a repeat call.

-- ---------------------------------------------------------------------------
-- Atomic settlement
-- ---------------------------------------------------------------------------

create or replace function public.apply_bet_settlement(
  p_bet_id uuid,
  p_leg_results jsonb,
  p_settled_by uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets%rowtype;
  v_leg public.bet_legs%rowtype;
  v_wallet public.wallets%rowtype;
  v_payload jsonb;
  v_leg_id uuid;
  v_result_text text;
  v_seen uuid[] := '{}';
  v_leg_count integer;
  v_matched integer;
  v_lost boolean := false;
  v_void_count integer := 0;
  v_won_count integer := 0;
  v_status public.bet_status;
  v_payout bigint := 0;
  v_balance_after bigint;
  v_odds_product numeric := 1;
  v_max_payout bigint;
  v_tx_type public.wallet_tx_type;
  v_before jsonb;
  v_after jsonb;
  v_reason text;
  v_is_admin boolean := false;
  i integer;
begin
  if p_bet_id is null
     or p_leg_results is null
     or jsonb_typeof(p_leg_results) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SETTLEMENT',
      'message', 'The settlement payload is not valid.'
    );
  end if;

  if p_settled_by is not null then
    select exists (
      select 1
      from public.profiles
      where id = p_settled_by
        and role = 'admin'
        and status = 'active'
    )
    into v_is_admin;

    if not v_is_admin then
      return jsonb_build_object(
        'ok', false,
        'code', 'UNAUTHORIZED',
        'message', 'Only an active admin can settle a bet manually.'
      );
    end if;

    v_reason := nullif(trim(coalesce(p_reason, '')), '');

    if v_reason is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'REASON_REQUIRED',
        'message', 'A reason is required for a manual settlement.'
      );
    end if;

    if char_length(v_reason) > 500 then
      return jsonb_build_object(
        'ok', false,
        'code', 'REASON_TOO_LONG',
        'message', 'Keep the settlement reason under 500 characters.'
      );
    end if;
  else
    v_reason := nullif(trim(coalesce(p_reason, '')), '');
  end if;

  select *
  into v_bet
  from public.bets
  where id = p_bet_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'BET_NOT_FOUND',
      'message', 'This bet could not be found.'
    );
  end if;

  if v_bet.status <> 'open' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'bet', jsonb_build_object(
        'id', v_bet.id,
        'status', v_bet.status,
        'payout', v_bet.payout,
        'settledAt', v_bet.settled_at
      )
    );
  end if;

  select count(*)
  into v_leg_count
  from public.bet_legs
  where bet_id = p_bet_id;

  if v_leg_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_LEGS',
      'message', 'This bet has no legs to settle.'
    );
  end if;

  if jsonb_array_length(p_leg_results) <> v_leg_count then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LEG_RESULTS',
      'message', 'Every leg needs exactly one result.'
    );
  end if;

  -- Validate the whole payload before changing any rows. Returning early after
  -- a partial update would otherwise commit half a settlement.
  for i in 0..jsonb_array_length(p_leg_results) - 1 loop
    v_payload := p_leg_results -> i;

    if jsonb_typeof(v_payload) <> 'object' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_LEG_RESULTS',
        'message', 'Every leg needs exactly one result.'
      );
    end if;

    v_result_text := v_payload ->> 'result';

    if coalesce(v_payload ->> 'legId', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_result_text, '') not in ('won', 'lost', 'void') then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_LEG_RESULTS',
        'message', 'Every leg needs a valid won, lost, or void result.'
      );
    end if;

    v_leg_id := (v_payload ->> 'legId')::uuid;

    if v_leg_id = any(v_seen) then
      return jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE_LEG_RESULT',
        'message', 'A leg was included more than once.'
      );
    end if;

    v_seen := array_append(v_seen, v_leg_id);
  end loop;

  select count(*)
  into v_matched
  from public.bet_legs
  where bet_id = p_bet_id
    and id = any(v_seen)
    and result = 'pending';

  if v_matched <> v_leg_count then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LEG_RESULTS',
      'message', 'The settlement results do not match this bet''s open legs.'
    );
  end if;

  select jsonb_build_object(
    'status', v_bet.status,
    'payout', v_bet.payout,
    'legs', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'legId', id,
          'result', result
        )
      ),
      '[]'::jsonb
    )
  )
  into v_before
  from public.bet_legs
  where bet_id = p_bet_id;

  for i in 0..jsonb_array_length(p_leg_results) - 1 loop
    v_payload := p_leg_results -> i;

    update public.bet_legs
    set result = (v_payload ->> 'result')::public.leg_result,
        settled_at = now()
    where bet_id = p_bet_id
      and id = (v_payload ->> 'legId')::uuid
      and result = 'pending';

    if not found then
      raise exception 'SETTLEMENT_LEG_NOT_FOUND' using errcode = 'P0001';
    end if;
  end loop;

  for v_leg in
    select *
    from public.bet_legs
    where bet_id = p_bet_id
  loop
    if v_leg.result = 'pending' then
      raise exception 'SETTLEMENT_INCOMPLETE' using errcode = 'P0001';
    elsif v_leg.result = 'lost' then
      v_lost := true;
    elsif v_leg.result = 'void' then
      v_void_count := v_void_count + 1;
    else
      v_won_count := v_won_count + 1;
      v_odds_product := v_odds_product * v_leg.odds_at_placement;
    end if;
  end loop;

  select coalesce((value #>> '{}')::bigint, 1000000)
  into v_max_payout
  from public.app_settings
  where key = 'max_payout';
  v_max_payout := coalesce(v_max_payout, 1000000);

  if v_lost then
    v_status := 'lost';
    v_payout := 0;
  elsif v_void_count = v_leg_count then
    v_status := 'void';
    v_payout := v_bet.stake;
  else
    v_status := 'won';
    v_payout := least(
      floor(v_bet.stake * round(v_odds_product, 6))::bigint,
      v_max_payout
    );
  end if;

  select *
  into v_wallet
  from public.wallets
  where user_id = v_bet.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_balance_after := v_wallet.balance;

  if v_payout > 0 then
    v_balance_after := v_wallet.balance + v_payout;
    v_tx_type := case
      when v_status = 'void' then 'bet_refund'::public.wallet_tx_type
      else 'bet_payout'::public.wallet_tx_type
    end;

    update public.wallets
    set balance = v_balance_after,
        version = version + 1
    where user_id = v_bet.user_id;

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
      v_bet.user_id,
      v_tx_type,
      v_payout,
      v_wallet.balance,
      v_balance_after,
      'bet:' || p_bet_id::text,
      jsonb_build_object(
        'bet_id', p_bet_id,
        'bet_type', v_bet.type,
        'status', v_status,
        'won_legs', v_won_count,
        'void_legs', v_void_count
      ),
      'bet_settlement:' || p_bet_id::text
    );
  end if;

  update public.bets
  set status = v_status,
      payout = v_payout,
      settled_at = now(),
      settled_by = p_settled_by,
      settlement_reason = v_reason
  where id = p_bet_id;

  select jsonb_build_object(
    'status', v_status,
    'payout', v_payout,
    'legs', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'legId', id,
          'result', result
        )
      ),
      '[]'::jsonb
    )
  )
  into v_after
  from public.bet_legs
  where bet_id = p_bet_id;

  if p_settled_by is not null then
    insert into public.admin_audit_logs (
      admin_id,
      action,
      entity,
      entity_id,
      before,
      after,
      reason
    )
    values (
      p_settled_by,
      case
        when v_status = 'void' then 'void_bet'
        else 'settle_bet'
      end,
      'bet',
      p_bet_id::text,
      v_before,
      v_after,
      v_reason
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'bet', jsonb_build_object(
      'id', p_bet_id,
      'status', v_status,
      'payout', v_payout,
      'settledAt', now()
    ),
    'balance', v_balance_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.apply_bet_settlement(uuid, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_bet_settlement(uuid, jsonb, uuid, text)
  to service_role;
