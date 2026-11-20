-- Unauthenticated public live-match area.
-- This is intentionally separate from the authenticated project/match analysis tables.
-- Anyone can list/create public live fixtures and control their clocks/substitutions.

create table if not exists public.public_live_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique check (length(btrim(full_name)) > 0),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.public_live_matches (
  id uuid primary key default gen_random_uuid(),
  competition text not null check (length(btrim(competition)) between 2 and 180),
  round_label text,
  home_team text not null check (length(btrim(home_team)) between 1 and 100),
  away_team text not null check (length(btrim(away_team)) between 1 and 100),
  analyzed_team text not null check (length(btrim(analyzed_team)) between 1 and 100),
  played_at date not null,
  kickoff_time time not null,
  venue text not null check (length(btrim(venue)) between 2 and 240),
  live_status text not null default 'scheduled'
    check (live_status in ('scheduled', 'live', 'finished')),
  created_at timestamptz not null default now()
);

create index if not exists public_live_matches_date_idx
  on public.public_live_matches(played_at desc, created_at desc);

create table if not exists public.public_live_clocks (
  match_id uuid primary key references public.public_live_matches(id) on delete cascade,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'paused', 'finished')),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_live_player_stints (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.public_live_matches(id) on delete cascade,
  player_id uuid not null references public.public_live_players(id) on delete restrict,
  started_second integer not null check (started_second >= 0),
  ended_second integer,
  created_at timestamptz not null default now(),
  check (ended_second is null or ended_second >= started_second)
);

create index if not exists public_live_stints_match_idx
  on public.public_live_player_stints(match_id, started_second);
create index if not exists public_live_stints_player_idx
  on public.public_live_player_stints(player_id, match_id);
create unique index if not exists public_live_stints_one_active_idx
  on public.public_live_player_stints(match_id, player_id)
  where ended_second is null;

alter table public.public_live_players enable row level security;
alter table public.public_live_matches enable row level security;
alter table public.public_live_clocks enable row level security;
alter table public.public_live_player_stints enable row level security;

-- No direct anonymous table access. All public operations go through narrow RPC projections.
revoke all on public.public_live_players, public.public_live_matches,
  public.public_live_clocks, public.public_live_player_stints from anon, authenticated;

insert into public.public_live_players(full_name, sort_order) values
  ('Afonso Silva Gomes Cidade Costa', 10),
  ('Daniel Dias Ferreira', 20),
  ('Duarte Caldeira Fernandes Nunes Ferreira', 30),
  ('Duarte Geraldo Ribeiro', 40),
  ('Francisco Maria Tovar Rei Ribeiro Dias', 50),
  ('Guilherme De Almeida Rodrigues Vasconcelos Relvas', 60),
  ('João Maria Espada Feio Vieira Gonçalves', 70),
  ('João Pedro Ferreira Fernandes', 80),
  ('Lourenço Costa Pinto Coelho', 90),
  ('Sebastião Tomé Baptista', 100),
  ('Simão Cardoso Da Silva', 110)
on conflict (full_name) do update
set sort_order = excluded.sort_order, active = true;

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
    'live_status', m.live_status
  ) order by m.played_at desc, m.created_at desc), '[]'::jsonb)
  from public.public_live_matches m;
$$;

create or replace function public.create_public_live_match(
  p_competition text,
  p_round_label text,
  p_home_team text,
  p_away_team text,
  p_analyzed_team text,
  p_played_at date,
  p_kickoff_time time,
  p_venue text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_match_id uuid;
begin
  if length(btrim(coalesce(p_competition, ''))) < 2
     or length(btrim(coalesce(p_home_team, ''))) = 0
     or length(btrim(coalesce(p_away_team, ''))) = 0
     or length(btrim(coalesce(p_analyzed_team, ''))) = 0
     or p_played_at is null
     or p_kickoff_time is null
     or length(btrim(coalesce(p_venue, ''))) < 2 then
    raise exception 'Preenche todos os dados obrigatórios do jogo';
  end if;

  if lower(btrim(p_home_team)) = lower(btrim(p_away_team)) then
    raise exception 'As equipas têm de ser diferentes';
  end if;

  if lower(btrim(p_analyzed_team)) <> lower(btrim(p_home_team))
     and lower(btrim(p_analyzed_team)) <> lower(btrim(p_away_team)) then
    raise exception 'A equipa analisada tem de ser uma das equipas do jogo';
  end if;

  insert into public.public_live_matches(
    competition, round_label, home_team, away_team, analyzed_team,
    played_at, kickoff_time, venue
  ) values (
    btrim(p_competition), nullif(btrim(coalesce(p_round_label, '')), ''),
    btrim(p_home_team), btrim(p_away_team), btrim(p_analyzed_team),
    p_played_at, p_kickoff_time, btrim(p_venue)
  ) returning id into created_match_id;

  insert into public.public_live_clocks(match_id, status)
  values (created_match_id, 'scheduled');

  return created_match_id;
end;
$$;

-- Migration 0005 defined this UUID signature with the old input parameter name
-- p_share_token. PostgreSQL requires dropping it before changing that name.
drop function if exists public.get_public_live_match(uuid);

create or replace function public.get_public_live_match(p_match_id uuid)
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
        'full_name', p.full_name,
        'sort_order', p.sort_order,
        'active', exists (
          select 1 from public.public_live_player_stints s
          where s.match_id = m.id and s.player_id = p.id and s.ended_second is null
        )
      ) order by p.sort_order, p.full_name)
      from public.public_live_players p
      where p.active
    ), '[]'::jsonb),
    'stints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'match_id', s.match_id,
        'player_id', s.player_id,
        'started_second', s.started_second,
        'ended_second', s.ended_second,
        'created_at', s.created_at
      ) order by s.started_second, s.created_at)
      from public.public_live_player_stints s
      where s.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.public_live_matches m
  left join public.public_live_clocks c on c.match_id = m.id
  where m.id = p_match_id
  limit 1;
$$;

create or replace function public.start_public_live_clock(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
begin
  select * into clock_row
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then raise exception 'Jogo não encontrado'; end if;
  if clock_row.status = 'finished' then raise exception 'O jogo já terminou'; end if;

  if clock_row.started_at is null then
    update public.public_live_clocks
    set started_at = clock_timestamp(), status = 'running', updated_at = clock_timestamp()
    where match_id = p_match_id returning * into clock_row;
  end if;

  update public.public_live_matches set live_status = 'live' where id = p_match_id;
  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

create or replace function public.pause_public_live_clock(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  new_elapsed integer;
begin
  select * into clock_row
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then raise exception 'Jogo não encontrado'; end if;

  new_elapsed := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    new_elapsed := new_elapsed + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  update public.public_live_clocks
  set elapsed_seconds = new_elapsed, started_at = null,
      status = case when status = 'finished' then 'finished' else 'paused' end,
      updated_at = clock_timestamp()
  where match_id = p_match_id returning * into clock_row;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

create or replace function public.set_public_live_player(
  p_match_id uuid,
  p_player_id uuid,
  p_is_on_court boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  current_second integer;
  active_count integer;
  existing_stint uuid;
begin
  if not exists (select 1 from public.public_live_players where id = p_player_id and active) then
    raise exception 'Jogador não encontrado no plantel';
  end if;

  select * into clock_row
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then raise exception 'Jogo não encontrado'; end if;
  if clock_row.status = 'finished' then raise exception 'O jogo já terminou'; end if;

  current_second := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    current_second := current_second + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  select id into existing_stint
  from public.public_live_player_stints
  where match_id = p_match_id and player_id = p_player_id and ended_second is null
  limit 1;

  if p_is_on_court then
    if existing_stint is null then
      select count(*) into active_count
      from public.public_live_player_stints
      where match_id = p_match_id and ended_second is null;
      if active_count >= 5 then
        raise exception 'Uma equipa de futsal não pode ter mais de cinco jogadores em campo';
      end if;
      insert into public.public_live_player_stints(match_id, player_id, started_second)
      values (p_match_id, p_player_id, current_second);
    end if;
  elsif existing_stint is not null then
    update public.public_live_player_stints
    set ended_second = greatest(current_second, started_second)
    where id = existing_stint;
  end if;

  return jsonb_build_object('elapsed_seconds', current_second, 'is_on_court', p_is_on_court);
end;
$$;

create or replace function public.finish_public_live_clock(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  final_second integer;
begin
  select * into clock_row
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then raise exception 'Jogo não encontrado'; end if;

  final_second := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    final_second := final_second + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  update public.public_live_player_stints
  set ended_second = greatest(final_second, started_second)
  where match_id = p_match_id and ended_second is null;

  update public.public_live_clocks
  set elapsed_seconds = final_second, started_at = null, status = 'finished', updated_at = clock_timestamp()
  where match_id = p_match_id returning * into clock_row;

  update public.public_live_matches set live_status = 'finished' where id = p_match_id;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

revoke all on function public.list_public_live_matches() from public;
revoke all on function public.create_public_live_match(text, text, text, text, text, date, time, text) from public;
revoke all on function public.get_public_live_match(uuid) from public;
revoke all on function public.start_public_live_clock(uuid) from public;
revoke all on function public.pause_public_live_clock(uuid) from public;
revoke all on function public.set_public_live_player(uuid, uuid, boolean) from public;
revoke all on function public.finish_public_live_clock(uuid) from public;

grant execute on function public.list_public_live_matches() to anon, authenticated;
grant execute on function public.create_public_live_match(text, text, text, text, text, date, time, text) to anon, authenticated;
grant execute on function public.get_public_live_match(uuid) to anon, authenticated;
grant execute on function public.start_public_live_clock(uuid) to anon, authenticated;
grant execute on function public.pause_public_live_clock(uuid) to anon, authenticated;
grant execute on function public.set_public_live_player(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.finish_public_live_clock(uuid) to anon, authenticated;
