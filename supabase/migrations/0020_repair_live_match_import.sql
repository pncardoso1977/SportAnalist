-- Repair and harden the import of completed public live matches.
-- This migration repeats the prerequisite DDL from 0019 so it can be applied
-- whether or not 0019 was already run.

alter table public.matches
  alter column youtube_url drop not null;

alter table public.matches
  add column if not exists source_public_live_match_id uuid
    references public.public_live_matches(id) on delete set null;

create unique index if not exists matches_project_public_live_source_idx
  on public.matches(project_id, source_public_live_match_id)
  where source_public_live_match_id is not null;

-- Imported fixtures already own a public clock; do not create a second one.
create or replace function public.initialise_live_match_clock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.competition is not null and new.source_public_live_match_id is null then
    insert into public.live_match_clocks(match_id, status)
    values (new.id, 'scheduled')
    on conflict (match_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.sync_finished_public_live_matches(target_project uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team text;
  synced_count integer := 0;
begin
  if auth.uid() is null or not public.is_project_member(target_project) then
    raise exception 'Acesso ao projeto não autorizado';
  end if;

  select analyzed_team into target_team
  from public.projects
  where id = target_project;

  if target_team is null then
    raise exception 'Projeto não encontrado';
  end if;

  insert into public.matches(
    project_id, home_team, away_team, analyzed_team, youtube_url,
    played_at, created_by, competition, round_label, kickoff_time,
    venue, live_status, source_public_live_match_id
  )
  select
    target_project, live_match.home_team, live_match.away_team, live_match.analyzed_team, null,
    live_match.played_at, auth.uid(), live_match.competition, live_match.round_label,
    live_match.kickoff_time, live_match.venue, 'finished', live_match.id
  from public.public_live_matches live_match
  join public.public_live_clocks live_clock on live_clock.match_id = live_match.id
  where live_clock.status = 'finished'
    and regexp_replace(lower(btrim(live_match.analyzed_team)), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(btrim(target_team)), '[^a-z0-9]', '', 'g')
  on conflict (project_id, source_public_live_match_id)
    where source_public_live_match_id is not null
  do update set
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    analyzed_team = excluded.analyzed_team,
    played_at = excluded.played_at,
    competition = excluded.competition,
    round_label = excluded.round_label,
    kickoff_time = excluded.kickoff_time,
    venue = excluded.venue,
    live_status = 'finished';

  get diagnostics synced_count = row_count;
  return synced_count;
end;
$$;

revoke all on function public.sync_finished_public_live_matches(uuid) from public;
grant execute on function public.sync_finished_public_live_matches(uuid) to authenticated;
