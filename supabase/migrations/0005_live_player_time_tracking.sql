-- Live futsal squad and player court-time tracking.
-- Public links are read-only; match operations require an authenticated project analyst/admin.

alter table public.matches
  add column if not exists competition text,
  add column if not exists round_label text,
  add column if not exists venue text,
  add column if not exists kickoff_time time,
  add column if not exists live_status text not null default 'scheduled'
    check (live_status in ('scheduled', 'live', 'finished'));

create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fpf_player_id text not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint squad_players_project_fpf_id_key unique (project_id, fpf_player_id)
);

create index if not exists squad_players_project_sort_idx
  on public.squad_players(project_id, active, sort_order);

alter table public.squad_players enable row level security;

drop policy if exists "members read squad players" on public.squad_players;
create policy "members read squad players" on public.squad_players
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists "analysts manage squad players" on public.squad_players;
create policy "analysts manage squad players" on public.squad_players
  for all to authenticated
  using (public.has_project_role(project_id, array['admin','analyst']::public.app_role[]))
  with check (public.has_project_role(project_id, array['admin','analyst']::public.app_role[]));

grant select, insert, update, delete on public.squad_players to authenticated;

create table if not exists public.live_match_clocks (
  match_id uuid primary key references public.matches(id) on delete cascade,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'paused', 'finished')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_player_stints (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete restrict,
  started_second integer not null check (started_second >= 0),
  ended_second integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ended_second is null or ended_second >= started_second)
);

create index if not exists match_player_stints_match_idx
  on public.match_player_stints(match_id, started_second);
create index if not exists match_player_stints_player_idx
  on public.match_player_stints(player_id, match_id);
create unique index if not exists match_player_stints_one_active_idx
  on public.match_player_stints(match_id, player_id)
  where ended_second is null;

alter table public.live_match_clocks enable row level security;
alter table public.match_player_stints enable row level security;

drop policy if exists "members read live match clocks" on public.live_match_clocks;
create policy "members read live match clocks" on public.live_match_clocks
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_project_member(m.project_id)
  ));

drop policy if exists "members read player stints" on public.match_player_stints;
create policy "members read player stints" on public.match_player_stints
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_project_member(m.project_id)
  ));

grant select on public.live_match_clocks, public.match_player_stints to authenticated;

-- Initialise a clock only for matches created through the live-match area.
create or replace function public.initialise_live_match_clock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.competition is not null then
    insert into public.live_match_clocks(match_id, status)
    values (new.id, 'scheduled')
    on conflict (match_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists initialise_live_match_clock on public.matches;
create trigger initialise_live_match_clock
after insert on public.matches
for each row execute function public.initialise_live_match_clock();

-- Also support matches created before this trigger was installed but already carrying
-- live metadata (safe to rerun).
insert into public.live_match_clocks(match_id, status)
select id, coalesce(live_status, 'scheduled')
from public.matches
where competition is not null
on conflict (match_id) do nothing;

create or replace function public.start_live_match_clock(target_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  clock_row public.live_match_clocks%rowtype;
begin
  select project_id into target_project from public.matches where id = target_match;
  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can start the live clock';
  end if;

  select * into clock_row
  from public.live_match_clocks
  where match_id = target_match
  for update;

  if not found then
    raise exception 'Live clock not found for this match';
  end if;
  if clock_row.status = 'finished' then
    raise exception 'This match has already been finished';
  end if;

  if clock_row.started_at is null then
    update public.live_match_clocks
    set started_at = clock_timestamp(),
        status = 'running',
        updated_by = auth.uid(),
        updated_at = clock_timestamp()
    where match_id = target_match
    returning * into clock_row;
  end if;

  update public.matches set live_status = 'live' where id = target_match;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

create or replace function public.pause_live_match_clock(target_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  clock_row public.live_match_clocks%rowtype;
  new_elapsed integer;
begin
  select project_id into target_project from public.matches where id = target_match;
  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can pause the live clock';
  end if;

  select * into clock_row
  from public.live_match_clocks
  where match_id = target_match
  for update;

  if not found then
    raise exception 'Live clock not found for this match';
  end if;

  new_elapsed := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    new_elapsed := new_elapsed + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  update public.live_match_clocks
  set elapsed_seconds = new_elapsed,
      started_at = null,
      status = case when status = 'finished' then 'finished' else 'paused' end,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
  where match_id = target_match
  returning * into clock_row;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

create or replace function public.set_live_match_player(
  target_match uuid,
  target_player uuid,
  is_on_court boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  player_project uuid;
  clock_row public.live_match_clocks%rowtype;
  current_second integer;
  active_count integer;
  existing_stint uuid;
begin
  select project_id into target_project from public.matches where id = target_match;
  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can record player time';
  end if;

  select project_id into player_project from public.squad_players where id = target_player and active;
  if player_project is null or player_project <> target_project then
    raise exception 'Player does not belong to this match squad';
  end if;

  select * into clock_row
  from public.live_match_clocks
  where match_id = target_match
  for update;

  if not found then
    raise exception 'Live clock not found for this match';
  end if;
  if clock_row.status = 'finished' then
    raise exception 'This match has already been finished';
  end if;

  current_second := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    current_second := current_second + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  select id into existing_stint
  from public.match_player_stints
  where match_id = target_match and player_id = target_player and ended_second is null
  limit 1;

  if is_on_court then
    if existing_stint is null then
      select count(*) into active_count
      from public.match_player_stints
      where match_id = target_match and ended_second is null;

      if active_count >= 5 then
        raise exception 'A futsal team cannot have more than five players on court';
      end if;

      insert into public.match_player_stints(match_id, player_id, started_second, created_by)
      values (target_match, target_player, current_second, auth.uid());
    end if;
  elsif existing_stint is not null then
    update public.match_player_stints
    set ended_second = greatest(current_second, started_second)
    where id = existing_stint;
  end if;

  return jsonb_build_object(
    'elapsed_seconds', current_second,
    'is_on_court', is_on_court
  );
end;
$$;

create or replace function public.finish_live_match_clock(target_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  clock_row public.live_match_clocks%rowtype;
  final_second integer;
begin
  select project_id into target_project from public.matches where id = target_match;
  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can finish the match';
  end if;

  select * into clock_row
  from public.live_match_clocks
  where match_id = target_match
  for update;

  if not found then
    raise exception 'Live clock not found for this match';
  end if;

  final_second := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    final_second := final_second + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  update public.match_player_stints
  set ended_second = greatest(final_second, started_second)
  where match_id = target_match and ended_second is null;

  update public.live_match_clocks
  set elapsed_seconds = final_second,
      started_at = null,
      status = 'finished',
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
  where match_id = target_match
  returning * into clock_row;

  update public.matches
  set live_status = 'finished'
  where id = target_match;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

-- Public read-only projection for a single tokenised match. Never expose user IDs,
-- project IDs, dates of birth, player photos or other matches.
create or replace function public.get_public_live_match(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'competition', m.competition,
      'round_label', m.round_label,
      'home_team', m.home_team,
      'away_team', m.away_team,
      'analyzed_team', m.analyzed_team,
      'played_at', m.played_at,
      'kickoff_time', m.kickoff_time,
      'venue', m.venue,
      'live_status', m.live_status
    ),
    'clock', jsonb_build_object(
      'elapsed_seconds', coalesce(c.elapsed_seconds, 0),
      'started_at', c.started_at,
      'status', coalesce(c.status, 'scheduled')
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'fpf_player_id', p.fpf_player_id,
        'full_name', p.full_name,
        'sort_order', p.sort_order,
        'active', exists (
          select 1 from public.match_player_stints s
          where s.match_id = m.id and s.player_id = p.id and s.ended_second is null
        )
      ) order by p.sort_order, p.full_name)
      from public.squad_players p
      where p.project_id = m.project_id and p.active
    ), '[]'::jsonb),
    'stints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'player_id', s.player_id,
        'started_second', s.started_second,
        'ended_second', s.ended_second
      ) order by s.started_second, s.created_at)
      from public.match_player_stints s
      where s.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.match_public_shares ps
  join public.matches m on m.id = ps.match_id
  left join public.live_match_clocks c on c.match_id = m.id
  where ps.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.start_live_match_clock(uuid) from public;
revoke all on function public.pause_live_match_clock(uuid) from public;
revoke all on function public.set_live_match_player(uuid, uuid, boolean) from public;
revoke all on function public.finish_live_match_clock(uuid) from public;
revoke all on function public.get_public_live_match(uuid) from public;

grant execute on function public.start_live_match_clock(uuid) to authenticated;
grant execute on function public.pause_live_match_clock(uuid) to authenticated;
grant execute on function public.set_live_match_player(uuid, uuid, boolean) to authenticated;
grant execute on function public.finish_live_match_clock(uuid) to authenticated;
grant execute on function public.get_public_live_match(uuid) to anon, authenticated;

alter publication supabase_realtime add table public.live_match_clocks;
alter publication supabase_realtime add table public.match_player_stints;
