-- BetApp admin operations
-- Week 5: audited balance adjustments, user status changes, and settings
-- updates. Every mutation validates the admin, requires a reason, and writes
-- an admin_audit_logs entry with before/after snapshots.

-- ---------------------------------------------------------------------------
-- Admin balance adjustment
-- ---------------------------------------------------------------------------

create or replace function public.admin_adjust_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_reason text;
  v_key text;
  v_target_status public.profile_status;
  v_wallet public.wallets%rowtype;
  v_balance_after bigint;
  v_exists boolean;
begin
  if p_admin_id is null or p_user_id is null or p_amount is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_INPUT',
      'message', 'The adjustment details are incomplete.'
    );
  end if;

  select exists (
    select 1
    from public.profiles
    where id = p_admin_id
      and role = 'admin'
      and status = 'active'
      and deleted_at is null
  )
  into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHORIZED',
      'message', 'Only an active admin can adjust balances.'
    );
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is null or char_length(v_reason) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_REQUIRED',
      'message', 'Add a short reason (at least 3 characters).'
    );
  end if;

  if char_length(v_reason) > 500 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_TOO_LONG',
      'message', 'Keep the reason under 500 characters.'
    );
  end if;

  if p_amount = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_AMOUNT',
      'message', 'The adjustment must be greater than zero or less than zero.'
    );
  end if;

  if p_amount < -1000000 or p_amount > 1000000 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_AMOUNT',
      'message', 'A single adjustment must stay within 1,000,000 coins.'
    );
  end if;

  select status
  into v_target_status
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'USER_NOT_FOUND',
      'message', 'This player could not be found.'
    );
  end if;

  if v_target_status = 'deleted' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TARGET',
      'message', 'A deleted profile cannot be adjusted.'
    );
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'admin_adjust:' || gen_random_uuid()::text;
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
      'message', 'This player does not have a wallet.'
    );
  end if;

  select exists (
    select 1
    from public.wallet_transactions
    where idempotency_key = v_key
      and user_id = p_user_id
  )
  into v_exists;

  if v_exists then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'balance', v_wallet.balance
    );
  end if;

  if exists (
    select 1
    from public.wallet_transactions
    where idempotency_key = v_key
      and user_id <> p_user_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'IDEMPOTENCY_CONFLICT',
      'message', 'This adjustment request was already used for another player.'
    );
  end if;

  v_balance_after := v_wallet.balance + p_amount;

  if v_balance_after < 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NEGATIVE_BALANCE',
      'message', 'This adjustment would take the wallet below zero.',
      'balance', v_wallet.balance
    );
  end if;

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
    'admin_adjustment',
    p_amount,
    v_wallet.balance,
    v_balance_after,
    'admin_adjustment',
    jsonb_build_object(
      'admin_id', p_admin_id,
      'reason', v_reason
    ),
    v_key
  );

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
    p_admin_id,
    'adjust_balance',
    'wallet',
    p_user_id::text,
    jsonb_build_object('balance', v_wallet.balance),
    jsonb_build_object(
      'balance', v_balance_after,
      'amount', p_amount
    ),
    v_reason
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'balance', v_balance_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin user status
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_status(
  p_admin_id uuid,
  p_user_id uuid,
  p_status public.profile_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_reason text;
  v_profile public.profiles%rowtype;
begin
  if p_admin_id is null or p_user_id is null or p_status is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_INPUT',
      'message', 'The status details are incomplete.'
    );
  end if;

  select exists (
    select 1
    from public.profiles
    where id = p_admin_id
      and role = 'admin'
      and status = 'active'
      and deleted_at is null
  )
  into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHORIZED',
      'message', 'Only an active admin can change user status.'
    );
  end if;

  if p_admin_id = p_user_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'SELF_STATUS_CHANGE',
      'message', 'You cannot suspend or restore your own admin account.'
    );
  end if;

  if p_status not in ('active', 'suspended') then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATUS',
      'message', 'Admins can only suspend or restore an account.'
    );
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is null or char_length(v_reason) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_REQUIRED',
      'message', 'Add a short reason (at least 3 characters).'
    );
  end if;

  if char_length(v_reason) > 500 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_TOO_LONG',
      'message', 'Keep the reason under 500 characters.'
    );
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'USER_NOT_FOUND',
      'message', 'This player could not be found.'
    );
  end if;

  if v_profile.status = 'deleted' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TARGET',
      'message', 'A deleted profile cannot be restored from the console.'
    );
  end if;

  if v_profile.status = p_status then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'status', v_profile.status
    );
  end if;

  update public.profiles
  set status = p_status,
      deleted_at = case
        when p_status = 'active' then null
        else deleted_at
      end,
      updated_at = now()
  where id = p_user_id;

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
    p_admin_id,
    case
      when p_status = 'active' then 'reactivate_user'
      else 'suspend_user'
    end,
    'profile',
    p_user_id::text,
    jsonb_build_object('status', v_profile.status),
    jsonb_build_object('status', p_status),
    v_reason
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'status', p_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin settings update
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_settings(
  p_admin_id uuid,
  p_settings jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_reason text;
  v_key text;
  v_value jsonb;
  v_old jsonb;
  v_number numeric;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_changed text[] := '{}';
  v_min_stake bigint;
  v_max_stake bigint;
begin
  if p_admin_id is null
     or p_settings is null
     or jsonb_typeof(p_settings) <> 'object'
     or p_settings = '{}'::jsonb then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SETTINGS',
      'message', 'No settings were supplied.'
    );
  end if;

  select exists (
    select 1
    from public.profiles
    where id = p_admin_id
      and role = 'admin'
      and status = 'active'
      and deleted_at is null
  )
  into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHORIZED',
      'message', 'Only an active admin can change settings.'
    );
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is null or char_length(v_reason) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_REQUIRED',
      'message', 'Add a short reason (at least 3 characters).'
    );
  end if;

  if char_length(v_reason) > 500 then
    return jsonb_build_object(
      'ok', false,
      'code', 'REASON_TOO_LONG',
      'message', 'Keep the reason under 500 characters.'
    );
  end if;

  -- Validate every key and type before writing anything.
  for v_key, v_value in
    select key, value from jsonb_each(p_settings)
  loop
    if v_key not in (
      'signup_bonus',
      'daily_claim',
      'min_stake',
      'max_stake',
      'max_payout',
      'beta_cap',
      'odds_stale_seconds',
      'beta_enabled',
      'maintenance_mode'
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_SETTING_KEY',
        'message', 'This setting cannot be changed from the console.',
        'key', v_key
      );
    end if;

    if v_key in ('beta_enabled', 'maintenance_mode') then
      if jsonb_typeof(v_value) <> 'boolean' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'This setting must be true or false.',
          'key', v_key
        );
      end if;
    else
      if jsonb_typeof(v_value) <> 'number' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'This setting must be a whole number.',
          'key', v_key
        );
      end if;

      v_number := (v_value #>> '{}')::numeric;

      if v_number <> trunc(v_number) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'This setting must be a whole number.',
          'key', v_key
        );
      end if;

      if v_key = 'signup_bonus' and (v_number < 0 or v_number > 1000000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The signup bonus must be between 0 and 1,000,000.',
          'key', v_key
        );
      elsif v_key = 'daily_claim' and (v_number < 0 or v_number > 1000000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The daily claim must be between 0 and 1,000,000.',
          'key', v_key
        );
      elsif v_key = 'min_stake' and (v_number < 1 or v_number > 1000000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The minimum stake must be between 1 and 1,000,000.',
          'key', v_key
        );
      elsif v_key = 'max_stake' and (v_number < 1 or v_number > 1000000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The maximum stake must be between 1 and 1,000,000.',
          'key', v_key
        );
      elsif v_key = 'max_payout' and (v_number < 1 or v_number > 10000000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The maximum payout must be between 1 and 10,000,000.',
          'key', v_key
        );
      elsif v_key = 'beta_cap' and (v_number < 0 or v_number > 10000) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The beta cap must be between 0 and 10,000.',
          'key', v_key
        );
      elsif v_key = 'odds_stale_seconds'
            and (v_number < 30 or v_number > 3600) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_SETTING_VALUE',
          'message', 'The odds staleness window must be 30–3,600 seconds.',
          'key', v_key
        );
      end if;
    end if;
  end loop;

  select coalesce((value #>> '{}')::bigint, 100)
  into v_min_stake
  from public.app_settings
  where key = 'min_stake';

  select coalesce((value #>> '{}')::bigint, 50000)
  into v_max_stake
  from public.app_settings
  where key = 'max_stake';

  v_min_stake := coalesce(v_min_stake, 100);
  v_max_stake := coalesce(v_max_stake, 50000);

  if p_settings ? 'min_stake' then
    v_min_stake := (p_settings ->> 'min_stake')::bigint;
  end if;

  if p_settings ? 'max_stake' then
    v_max_stake := (p_settings ->> 'max_stake')::bigint;
  end if;

  if v_max_stake < v_min_stake then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SETTING_VALUE',
      'message', 'The maximum stake cannot be lower than the minimum stake.'
    );
  end if;

  -- Apply only the values that actually changed.
  for v_key, v_value in
    select key, value from jsonb_each(p_settings)
  loop
    select value
    into v_old
    from public.app_settings
    where key = v_key;

    if v_old is distinct from v_value then
      v_before := v_before || jsonb_build_object(v_key, v_old);
      v_after := v_after || jsonb_build_object(v_key, v_value);
      v_changed := array_append(v_changed, v_key);

      insert into public.app_settings (key, value, updated_by, updated_at)
      values (v_key, v_value, p_admin_id, now())
      on conflict (key) do update
      set value = excluded.value,
          updated_by = excluded.updated_by,
          updated_at = now();
    end if;
  end loop;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'changed', '[]'::jsonb
    );
  end if;

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
    p_admin_id,
    'update_settings',
    'app_settings',
    null,
    v_before,
    v_after,
    v_reason
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'changed', to_jsonb(v_changed)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Beta gate enforcement
-- ---------------------------------------------------------------------------

create or replace function public.beta_has_capacity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select (value #>> '{}')::boolean
       from public.app_settings
       where key = 'beta_enabled'),
      true
    )
    and (
      select count(*)
      from public.profiles
      where status <> 'deleted'
    ) < coalesce(
      (select (value #>> '{}')::integer
       from public.app_settings
       where key = 'beta_cap'),
      100
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_count integer;
  v_enabled boolean;
  v_display_name text;
  v_dob date;
  v_country text;
begin
  select coalesce((value #>> '{}')::boolean, true)
  into v_enabled
  from public.app_settings
  where key = 'beta_enabled';

  if not coalesce(v_enabled, true) then
    raise exception 'BETA_FULL' using errcode = 'P0001';
  end if;

  select coalesce((value #>> '{}')::integer, 100)
  into v_cap
  from public.app_settings
  where key = 'beta_cap';

  v_cap := coalesce(v_cap, 100);

  select count(*)
  into v_count
  from public.profiles
  where status <> 'deleted';

  if v_count >= v_cap then
    raise exception 'BETA_FULL' using errcode = 'P0001';
  end if;

  v_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  if v_display_name is null then
    v_display_name := split_part(coalesce(new.email, 'player'), '@', 1);
  end if;
  v_display_name := left(v_display_name, 40);
  if char_length(v_display_name) < 2 then
    v_display_name := 'Player';
  end if;

  v_dob := nullif(new.raw_user_meta_data ->> 'dob', '')::date;
  if v_dob is null then
    raise exception 'DOB_REQUIRED' using errcode = 'P0001';
  end if;
  if v_dob > current_date or v_dob > (current_date - interval '18 years')::date then
    raise exception 'UNDERAGE' using errcode = 'P0001';
  end if;

  v_country := upper(left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'country'), ''), 'NG'), 2));

  insert into public.profiles (
    id,
    email,
    display_name,
    dob,
    country
  )
  values (
    new.id,
    lower(new.email),
    v_display_name,
    v_dob,
    v_country
  );

  insert into public.wallets (user_id)
  values (new.id);

  if new.email_confirmed_at is not null then
    perform public.grant_signup_bonus(new.id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.admin_adjust_balance(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_balance(uuid, uuid, bigint, text, text)
  to service_role;

revoke all on function public.admin_set_user_status(uuid, uuid, public.profile_status, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_status(uuid, uuid, public.profile_status, text)
  to service_role;

revoke all on function public.admin_update_settings(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_settings(uuid, jsonb, text)
  to service_role;
