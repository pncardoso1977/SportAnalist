-- Competition-specific public live rosters and matchday squad selection.
-- The existing twelve-player Sub-17 roster remains available.
-- Portela senior players are stored by FPF player ID; no birth dates or photos are stored.

alter table public.public_live_players
  add column if not exists roster_key text not null default 'ASSOCIACAO_MARISTA_SUB17',
  add column if not exists fpf_player_id text;

create unique index if not exists public_live_players_fpf_player_id_uidx
  on public.public_live_players(fpf_player_id)
  where fpf_player_id is not null;

update public.public_live_players
set roster_key = 'ASSOCIACAO_MARISTA_SUB17'
where roster_key is null or btrim(roster_key) = '';

insert into public.public_live_players
  (full_name, short_name, sort_order, active, roster_key, fpf_player_id)
values
  ('Antonio Mendes Pires Cardoso Matias', 'Antonio Matias', 10, true, 'PORTELA_SENIORES_MASCULINOS', '779588'),
  ('Filipe Miguel Costa Adelino Ricardo', 'Filipe Ricardo', 20, true, 'PORTELA_SENIORES_MASCULINOS', '944228'),
  ('Francisco Leite Monteiro De Sousa Coelho', 'Francisco Coelho', 30, true, 'PORTELA_SENIORES_MASCULINOS', '1592311'),
  ('Gabriel Alexandre Figueiredo Carvalho', 'Gabriel Carvalho', 40, true, 'PORTELA_SENIORES_MASCULINOS', '1951830'),
  ('Goncalo Mesquita Ferreira Costa', 'Gonçalo Costa', 50, true, 'PORTELA_SENIORES_MASCULINOS', '681401'),
  ('Goncalo Miguel Ribeiro Santos', 'Gonçalo Santos', 60, true, 'PORTELA_SENIORES_MASCULINOS', '1602579'),
  ('Gonçalo Tomé Baptista', 'Gonçalo Baptista', 70, true, 'PORTELA_SENIORES_MASCULINOS', '1822963'),
  ('Martim Pereira Santos', 'Martim Santos', 80, true, 'PORTELA_SENIORES_MASCULINOS', '1594553'),
  ('Mauricio Manuel Mendes Leal Dias Carmo', 'Mauricio Carmo', 90, true, 'PORTELA_SENIORES_MASCULINOS', '819106'),
  ('Miguel Almeida Dias', 'Miguel Dias', 100, true, 'PORTELA_SENIORES_MASCULINOS', '960402'),
  ('Miguel Angelo Carbunaru Felicio', 'Miguel Felicio', 110, true, 'PORTELA_SENIORES_MASCULINOS', '1751019'),
  ('Pedro Daniel Silva Alves', 'Pedro Alves', 120, true, 'PORTELA_SENIORES_MASCULINOS', '980143'),
  ('Rodrigo Miguel Da Silva Ricardo Ralha', 'Rodrigo Ralha', 130, true, 'PORTELA_SENIORES_MASCULINOS', '1835645'),
  ('Rodrigo Pereira Santos', 'Rodrigo Santos', 140, true, 'PORTELA_SENIORES_MASCULINOS', '925151'),
  ('Ruben Miguel Marques Mateus Cunha', 'Ruben Cunha', 150, true, 'PORTELA_SENIORES_MASCULINOS', '967535'),
  ('Tiago Filipe Pereira Baltazar', 'Tiago Baltazar', 160, true, 'PORTELA_SENIORES_MASCULINOS', '892732'),
  ('Tiago Sousa', 'Tiago Sousa', 170, true, 'PORTELA_SENIORES_MASCULINOS', '774758')
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true,
    roster_key = excluded.roster_key,
    fpf_player_id = excluded.fpf_player_id;

-- Return only the roster associated with the selected competition.
create or replace function public.list_public_live_roster(p_competition text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'display_name', coalesce(nullif(btrim(p.short_name), ''), p.full_name),
    'sort_order', p.sort_order
  ) order by p.sort_order, p.full_name), '[]'::jsonb)
  from public.public_live_players p
  where p.active
    and p.roster_key = case
      when upper(btrim(coalesce(p_competition, ''))) = 'CD II DIV SENIORES MASCULINOS'
        then 'PORTELA_SENIORES_MASCULINOS'
      else 'ASSOCIACAO_MARISTA_SUB17'
    end;
$$;

-- Match creation now receives the exact twelve selected player IDs.
drop function if exists public.create_public_live_match(text, text, text, text, text, date, time, text);

create or replace function public.create_public_live_match(
  p_competition text,
  p_round_label text,
  p_home_team text,
  p_away_team text,
  p_analyzed_team text,
  p_played_at date,
  p_kickoff_time time,
  p_venue text,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_match_id uuid;
  selected_roster_key text;
  selected_count integer;
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

  selected_roster_key := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS'
      then 'PORTELA_SENIORES_MASCULINOS'
    else 'ASSOCIACAO_MARISTA_SUB17'
  end;

  if coalesce(array_length(p_player_ids, 1), 0) <> 12 then
    raise exception 'Tens de selecionar exatamente 12 jogadores para o jogo';
  end if;

  select count(*) into selected_count
  from public.public_live_players p
  where p.id = any(p_player_ids)
    and p.active
    and p.roster_key = selected_roster_key;

  if selected_count <> 12 then
    raise exception 'A seleção deve conter 12 jogadores distintos do plantel desta competição';
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

  insert into public.public_live_match_players(match_id, player_id, display_name)
  select created_match_id, p.id, coalesce(nullif(btrim(p.short_name), ''), p.full_name)
  from public.public_live_players p
  where p.id = any(p_player_ids)
    and p.active
    and p.roster_key = selected_roster_key
  order by p.sort_order, p.full_name;

  return created_match_id;
end;
$$;

-- Restrict public name edits and substitutions to players selected for this match.
create or replace function public.set_public_live_player_name(
  p_match_id uuid,
  p_player_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_name text;
begin
  if length(btrim(coalesce(p_display_name, ''))) < 1
     or length(btrim(p_display_name)) > 40 then
    raise exception 'O nome apresentado deve ter entre 1 e 40 caracteres';
  end if;

  if not exists (
    select 1
    from public.public_live_match_players mp
    join public.public_live_players p on p.id = mp.player_id and p.active
    where mp.match_id = p_match_id
      and mp.player_id = p_player_id
  ) then
    raise exception 'Jogador não pertence ao plantel convocado para este jogo';
  end if;

  insert into public.public_live_match_players(match_id, player_id, display_name)
  values (p_match_id, p_player_id, btrim(p_display_name))
  on conflict (match_id, player_id)
  do update set display_name = excluded.display_name, updated_at = clock_timestamp()
  returning display_name into saved_name;

  return jsonb_build_object('player_id', p_player_id, 'display_name', saved_name);
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
  if not exists (
    select 1 from public.public_live_match_players mp
    join public.public_live_players p on p.id = mp.player_id and p.active
    where mp.match_id = p_match_id and mp.player_id = p_player_id
  ) then
    raise exception 'Jogador não pertence ao plantel convocado para este jogo';
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

-- Public read projection now returns only the twelve players selected for the fixture.
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
        'display_name', mp.display_name,
        'sort_order', p.sort_order,
        'active', exists (
          select 1 from public.public_live_player_stints s
          where s.match_id = m.id and s.player_id = p.id and s.ended_second is null
        )
      ) order by p.sort_order, mp.display_name)
      from public.public_live_match_players mp
      join public.public_live_players p on p.id = mp.player_id
      where mp.match_id = m.id
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

revoke all on function public.list_public_live_roster(text) from public;
grant execute on function public.list_public_live_roster(text) to anon, authenticated;

revoke all on function public.create_public_live_match(text, text, text, text, text, date, time, text, uuid[]) from public;
grant execute on function public.create_public_live_match(text, text, text, text, text, date, time, text, uuid[]) to anon, authenticated;

revoke all on function public.set_public_live_player_name(uuid, uuid, text) from public;
grant execute on function public.set_public_live_player_name(uuid, uuid, text) to anon, authenticated;

revoke all on function public.set_public_live_player(uuid, uuid, boolean) from public;
grant execute on function public.set_public_live_player(uuid, uuid, boolean) to anon, authenticated;

revoke all on function public.get_public_live_match(uuid) from public;
grant execute on function public.get_public_live_match(uuid) to anon, authenticated;
