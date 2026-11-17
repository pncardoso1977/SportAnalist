-- SportAnalist: associate every match event with the team whose phase is being analysed.
-- Attack events belong to the analysed team; defence events belong to the opponent.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  normalized_name text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now(),
  constraint teams_project_normalized_name_key unique (project_id, normalized_name)
);

create index if not exists teams_project_idx on public.teams(project_id);

alter table public.teams enable row level security;

drop policy if exists "members read teams" on public.teams;
create policy "members read teams" on public.teams
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists "analysts manage teams" on public.teams;
create policy "analysts manage teams" on public.teams
  for all to authenticated
  using (public.has_project_role(project_id, array['admin','analyst']::public.app_role[]))
  with check (public.has_project_role(project_id, array['admin','analyst']::public.app_role[]));

grant select, insert, update on public.teams to authenticated;

-- Create a canonical team row for every team already present in a match.
insert into public.teams (project_id, name)
select distinct project_id, team_name
from (
  select project_id, home_team as team_name from public.matches
  union
  select project_id, away_team as team_name from public.matches
) match_teams
where nullif(btrim(team_name), '') is not null
on conflict (project_id, normalized_name) do nothing;

alter table public.match_events
  add column if not exists team_id uuid references public.teams(id) on delete restrict;

-- Backfill event ownership: attack -> analysed team; defence -> opponent.
update public.match_events me
set team_id = t.id,
    attacking_team = coalesce(
      me.attacking_team,
      case when me.moment = 'attack'::public.event_moment
        then m.analyzed_team
        else case
          when lower(btrim(m.home_team)) = lower(btrim(m.analyzed_team)) then m.away_team
          when lower(btrim(m.away_team)) = lower(btrim(m.analyzed_team)) then m.home_team
          else m.away_team
        end
      end
    ),
    defending_team = coalesce(
      me.defending_team,
      case when me.moment = 'attack'::public.event_moment
        then case
          when lower(btrim(m.home_team)) = lower(btrim(m.analyzed_team)) then m.away_team
          when lower(btrim(m.away_team)) = lower(btrim(m.analyzed_team)) then m.home_team
          else m.away_team
        end
        else m.analyzed_team
      end
    )
from public.matches m
join public.teams t
  on t.project_id = m.project_id
 and t.normalized_name = lower(btrim(
   case when me.moment = 'attack'::public.event_moment
     then m.analyzed_team
     else case
       when lower(btrim(m.home_team)) = lower(btrim(m.analyzed_team)) then m.away_team
       when lower(btrim(m.away_team)) = lower(btrim(m.analyzed_team)) then m.home_team
       else m.away_team
     end
   end
 ))
where me.match_id = m.id
  and me.team_id is null;

-- Any event that could not be matched to a team name is a migration error; stop instead of
-- leaving data in a partially associated state.
do $$
begin
  if exists (select 1 from public.match_events where team_id is null) then
    raise exception 'Could not associate every match event with a team. Review match and team names before rerunning migration.';
  end if;
end;
$$;

alter table public.match_events
  alter column team_id set not null;

create index if not exists match_events_team_created_idx
  on public.match_events(team_id, created_at desc);
create index if not exists match_events_team_moment_idx
  on public.match_events(team_id, moment, video_second);
