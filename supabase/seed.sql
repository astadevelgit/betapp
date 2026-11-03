-- BetApp seed data
-- Apply after 20261101000001_foundation.sql.
-- This file is safe to re-run.

insert into public.app_settings (key, value, description)
values
  ('signup_bonus', '10000'::jsonb, 'BET coins credited once after email verification'),
  ('daily_claim', '2000'::jsonb, 'BET coins available once per Africa/Lagos calendar day'),
  ('min_stake', '100'::jsonb, 'Minimum stake per bet in BET coins'),
  ('max_stake', '50000'::jsonb, 'Maximum stake per bet in BET coins'),
  ('max_payout', '1000000'::jsonb, 'Maximum payout per bet in BET coins'),
  ('min_acca_legs', '2'::jsonb, 'Minimum accumulator legs'),
  ('max_acca_legs', '10'::jsonb, 'Maximum accumulator legs'),
  ('beta_cap', '100'::jsonb, 'Maximum active profiles in the private beta'),
  ('beta_enabled', 'true'::jsonb, 'When false, new signups go to the waitlist'),
  ('maintenance_mode', 'false'::jsonb, 'When true, betting mutations are paused'),
  ('odds_stale_seconds', '900'::jsonb, 'Reject new bets when odds are older than this (betting cutoff)'),
  ('claim_timezone', '"Africa/Lagos"'::jsonb, 'Daily claim reset timezone')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();
