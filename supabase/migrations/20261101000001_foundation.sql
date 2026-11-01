-- BetApp foundation schema
-- Week 0: profiles, wallets, ledger, daily claims, settings, waitlist, audit, sync logs.
-- All money is stored as integer BET coins (bigint). Never use floats for balances.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.profile_role as enum ('user', 'admin');
create type public.profile_status as enum ('active', 'suspended', 'deleted');
create type public.wallet_tx_type as enum (
  'signup_bonus',
  'daily_claim',
  'bet_stake',
  'bet_payout',
  'bet_refund',
  'admin_adjustment',
  'correction'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  dob date not null,
  country text not null default 'NG',
  role public.profile_role not null default 'user',
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_email_lowercase check (email = lower(email)),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 40),
  constraint profiles_country_code check (country = upper(country) and char_length(country) = 2)
);

create index profiles_status_idx on public.profiles (status);
create index profiles_created_at_idx on public.profiles (created_at);

create table public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance bigint not null default 0,
  currency text not null default 'BET',
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_balance_non_negative check (balance >= 0),
  constraint wallets_currency_bet check (currency = 'BET'),
  constraint wallets_version_non_negative check (version >= 0)
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.wallet_tx_type not null,
  amount bigint not null,
  balance_before bigint not null,
  balance_after bigint not null,
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint wallet_transactions_amount_non_zero check (amount <> 0),
  constraint wallet_transactions_balances_non_negative check (balance_before >= 0 and balance_after >= 0),
  constraint wallet_transactions_balance_math check (balance_after = balance_before + amount)
);

create index wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);
create index wallet_transactions_reference_idx
  on public.wallet_transactions (reference);

create table public.daily_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  claim_date date not null,
  amount bigint not null,
  wallet_transaction_id uuid references public.wallet_transactions (id),
  created_at timestamptz not null default now(),
  primary key (user_id, claim_date),
  constraint daily_claims_amount_positive check (amount > 0)
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'waiting',
  source text not null default 'signup',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint waitlist_email_lowercase check (email = lower(email)),
  constraint waitlist_status_valid check (status in ('waiting', 'invited', 'converted', 'rejected'))
);

create index waitlist_created_at_idx on public.waitlist (created_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_admin_created_idx
  on public.admin_audit_logs (admin_id, created_at desc);
create index admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity, entity_id);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  constraint sync_runs_status_valid check (status in ('running', 'success', 'failed')),
  constraint sync_runs_records_non_negative check (records_processed >= 0)
);

create index sync_runs_job_started_idx on public.sync_runs (job, started_at desc);
create index sync_runs_status_idx on public.sync_runs (status);

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Beta capacity
-- ---------------------------------------------------------------------------

create or replace function public.beta_has_capacity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*)
    from public.profiles
    where status <> 'deleted'
  ) < coalesce(
    (select (value #>> '{}')::integer from public.app_settings where key = 'beta_cap'),
    100
  );
$$;

-- ---------------------------------------------------------------------------
-- Signup bonus (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.grant_signup_bonus(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount bigint;
  v_before bigint;
  v_after bigint;
  v_confirmed timestamptz;
  v_key text := 'signup_grant:' || p_user_id::text;
begin
  select email_confirmed_at
  into v_confirmed
  from auth.users
  where id = p_user_id;

  if v_confirmed is null then
    return jsonb_build_object('granted', false, 'reason', 'EMAIL_NOT_CONFIRMED');
  end if;

  select balance
  into v_before
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('granted', false, 'reason', 'WALLET_NOT_FOUND');
  end if;

  if exists (
    select 1
    from public.wallet_transactions
    where idempotency_key = v_key
  ) then
    return jsonb_build_object(
      'granted', false,
      'reason', 'ALREADY_GRANTED',
      'balance', v_before
    );
  end if;

  select coalesce((value #>> '{}')::bigint, 10000)
  into v_amount
  from public.app_settings
  where key = 'signup_bonus';

  v_amount := coalesce(v_amount, 10000);
  v_after := v_before + v_amount;

  update public.wallets
  set balance = v_after,
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
    'signup_bonus',
    v_amount,
    v_before,
    v_after,
    'signup_bonus',
    jsonb_build_object('source', 'email_verification'),
    v_key
  );

  return jsonb_build_object(
    'granted', true,
    'amount', v_amount,
    'balance', v_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_count integer;
  v_display_name text;
  v_dob date;
  v_country text;
begin
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

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.grant_signup_bonus(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- ---------------------------------------------------------------------------
-- Daily claim (one per Africa/Lagos calendar day)
-- ---------------------------------------------------------------------------

create or replace function public.claim_daily(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_amount bigint;
  v_before bigint;
  v_after bigint;
  v_tx_id uuid;
  v_key text := 'daily_claim:' || p_user_id::text || ':' || v_today::text;
begin
  select coalesce((value #>> '{}')::bigint, 2000)
  into v_amount
  from public.app_settings
  where key = 'daily_claim';

  v_amount := coalesce(v_amount, 2000);

  insert into public.daily_claims (user_id, claim_date, amount)
  values (p_user_id, v_today, v_amount)
  on conflict (user_id, claim_date) do nothing;

  if not found then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'ALREADY_CLAIMED',
      'claim_date', v_today,
      'next_claim_date', v_today + 1
    );
  end if;

  select balance
  into v_before
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_after := v_before + v_amount;

  update public.wallets
  set balance = v_after,
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
    'daily_claim',
    v_amount,
    v_before,
    v_after,
    'daily_claim',
    jsonb_build_object('claim_date', v_today),
    v_key
  )
  returning id into v_tx_id;

  update public.daily_claims
  set wallet_transaction_id = v_tx_id
  where user_id = p_user_id
    and claim_date = v_today;

  return jsonb_build_object(
    'claimed', true,
    'amount', v_amount,
    'balance', v_after,
    'claim_date', v_today
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.daily_claims enable row level security;
alter table public.app_settings enable row level security;
alter table public.waitlist enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.sync_runs enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "wallets_select_own"
  on public.wallets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "wallet_transactions_select_own"
  on public.wallet_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "daily_claims_select_own"
  on public.daily_claims
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.wallets from anon, authenticated;
revoke all on table public.wallet_transactions from anon, authenticated;
revoke all on table public.daily_claims from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on table public.sync_runs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.wallet_transactions to authenticated;
grant select on table public.daily_claims to authenticated;

revoke all on function public.beta_has_capacity() from public;
grant execute on function public.beta_has_capacity() to anon, authenticated;

revoke all on function public.grant_signup_bonus(uuid) from public, anon, authenticated;
grant execute on function public.grant_signup_bonus(uuid) to service_role;

revoke all on function public.claim_daily(uuid) from public, anon, authenticated;
grant execute on function public.claim_daily(uuid) to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke all on function public.handle_user_confirmed() from public, anon, authenticated;
grant execute on function public.handle_user_confirmed() to service_role;
