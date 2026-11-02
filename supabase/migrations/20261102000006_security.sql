-- BetApp security hardening
-- Epic 6: fixed-window rate limiting, serialized beta-cap enforcement, and
-- cleanup helpers for expired buckets and unverified signups.

-- ---------------------------------------------------------------------------
-- Rate limit buckets
-- ---------------------------------------------------------------------------

create table public.rate_limit_buckets (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  expires_at timestamptz not null,
  primary key (bucket, window_start),
  constraint rate_limit_buckets_bucket_length
    check (char_length(bucket) between 1 and 200),
  constraint rate_limit_buckets_count_non_negative check (count >= 0)
);

create index rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

alter table public.rate_limit_buckets enable row level security;

-- Buckets are internal security state. Only the service role (which bypasses
-- RLS) may touch them; no authenticated or anonymous policies are defined.
revoke all on table public.rate_limit_buckets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic fixed-window limiter
--
-- Each call increments the counter for the current window and returns whether
-- the request is allowed. The ON CONFLICT update takes a row lock, so parallel
-- requests cannot race past the limit.
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text := nullif(trim(p_bucket), '');
  v_window_start timestamptz;
  v_count integer;
begin
  if v_bucket is null or char_length(v_bucket) > 200 then
    raise exception 'INVALID_RATE_LIMIT_BUCKET' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'INVALID_RATE_LIMIT_LIMIT' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_WINDOW' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets as buckets (
    bucket,
    window_start,
    count,
    expires_at
  )
  values (
    v_bucket,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds)
  )
  on conflict (bucket, window_start) do update
    set count = buckets.count + 1
  returning count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_window_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Beta gate with an advisory lock
--
-- The trigger runs in the same transaction as the auth.users insert. Taking a
-- transaction-scoped advisory lock serializes concurrent signups, so two
-- requests cannot both observe the last free slot. The lock is released when
-- the auth transaction commits or rolls back.
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

  perform pg_advisory_xact_lock(hashtext('betapp:beta_cap'));

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
-- Cleanup helpers
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Keep an hour of history past expiry to tolerate clock skew.
  delete from public.rate_limit_buckets
  where expires_at < now() - interval '1 hour';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.purge_unverified_profiles(
  p_max_age_hours integer default 24
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_max_age_hours is null or p_max_age_hours < 1 or p_max_age_hours > 720 then
    raise exception 'INVALID_PURGE_AGE' using errcode = '22023';
  end if;

  -- Deleting the auth user cascades to the profile, wallet, ledger, and daily
  -- claims. Profiles with bets are skipped because bets restrict profile
  -- deletion; an unverified account should never have placed one.
  with stale_users as (
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.created_at < now() - make_interval(hours => p_max_age_hours)
      and not exists (
        select 1
        from public.bets b
        where b.user_id = u.id
      )
  ),
  deleted as (
    delete from auth.users u
    using stale_users s
    where u.id = s.id
    returning u.id
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

revoke all on function public.purge_expired_rate_limits()
  from public, anon, authenticated;
grant execute on function public.purge_expired_rate_limits()
  to service_role;

revoke all on function public.purge_unverified_profiles(integer)
  from public, anon, authenticated;
grant execute on function public.purge_unverified_profiles(integer)
  to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
