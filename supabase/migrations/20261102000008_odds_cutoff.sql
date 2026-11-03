-- BetApp stale-odds betting cutoff
-- Odds are refreshed by sync-odds on a fixed 5-minute window. The betting
-- cutoff is intentionally longer (15 minutes) so one missed 10-minute odds run
-- does not block every new bet. place_bet enforces this value atomically.
--
-- Preserve any deliberate admin override while moving the initial 300-second
-- value to the new 900-second default and updating the setting description.

update public.app_settings
set
  value = case
    when (value #>> '{}')::integer = 300 then '900'::jsonb
    else value
  end,
  description = 'Reject new bets when odds are older than this (betting cutoff)'
where key = 'odds_stale_seconds';
