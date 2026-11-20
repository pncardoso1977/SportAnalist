-- Use the clock as the source of truth for completed public live matches.
-- Reconcile older rows where the match status did not follow the clock status.

update public.public_live_matches m
set live_status = 'finished'
from public.public_live_clocks c
where c.match_id = m.id
  and c.status = 'finished'
  and m.live_status is distinct from 'finished';

create or replace function public.list_public_live_matches()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'competition', m.competition,
    'round_label', m.round_label,
    'home_team', m.home_team,
    'away_team', m.away_team,
    'analyzed_team', m.analyzed_team,
    'played_at', m.played_at,
    'kickoff_time', m.kickoff_time,
    'venue', m.venue,
    'live_status', case
      when c.status = 'finished' or m.live_status = 'finished' then 'finished'
      when c.status = 'running' or m.live_status = 'live' then 'live'
      else 'scheduled'
    end,
    'clock_status', coalesce(c.status, 'scheduled')
  ) order by m.played_at desc, m.created_at desc), '[]'::jsonb)
  from public.public_live_matches m
  left join public.public_live_clocks c on c.match_id = m.id;
$$;

revoke all on function public.list_public_live_matches() from public;
grant execute on function public.list_public_live_matches() to anon, authenticated;
