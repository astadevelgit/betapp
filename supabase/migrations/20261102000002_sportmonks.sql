-- Switch the default provider label to Sportmonks.
-- Provider IDs are stored as text, so existing catalog rows remain valid.
-- The free plan currently exposes the Danish Superliga (271) and Scottish
-- Premiership (501); update this setting when the plan is upgraded.

alter table public.competitions
  alter column source set default 'sportmonks';

alter table public.teams
  alter column source set default 'sportmonks';

alter table public.matches
  alter column source set default 'sportmonks';

update public.app_settings
set
  value = '[271, 501]'::jsonb,
  description = 'Sportmonks league IDs synced by the fixture jobs.'
where key = 'selected_league_ids';
