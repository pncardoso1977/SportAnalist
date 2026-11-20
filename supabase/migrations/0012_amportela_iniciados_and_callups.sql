-- Add the AMPortela Iniciados Sub-15 roster and allow call-ups from the
-- immediately younger age group only. Started fixtures are excluded from the
-- public list of available matches; their data and public URLs remain intact.
-- Player birth dates and photographs are deliberately not stored.

insert into public.public_live_players
  (full_name, short_name, sort_order, active, roster_key, fpf_player_id)
values
  ('António Maria De Freitas Figueiredo Dias Ferrari', 'António Ferrari', 10, true, 'AMPORTELA_INICIADOS_SUB15', '2047928'),
  ('Diego Serra Nunes', 'Diego Nunes', 20, true, 'AMPORTELA_INICIADOS_SUB15', '2259827'),
  ('Dinis Guerra De Sousa', 'Dinis Sousa', 30, true, 'AMPORTELA_INICIADOS_SUB15', '2171228'),
  ('Diogo Francisco Tavares Lopes', 'Diogo Lopes', 40, true, 'AMPORTELA_INICIADOS_SUB15', '2231560'),
  ('Duarte Silva Filipe', 'Duarte Filipe', 50, true, 'AMPORTELA_INICIADOS_SUB15', '2039642'),
  ('Gabriel Miguel Ricardo Santos', 'Gabriel Santos', 60, true, 'AMPORTELA_INICIADOS_SUB15', '2047112'),
  ('Gonçalo De Freitas Santo', 'Gonçalo Santo', 70, true, 'AMPORTELA_INICIADOS_SUB15', '1960596'),
  ('Gonçalo Filipe Libório Oliveira', 'Gonçalo Libório', 80, true, 'AMPORTELA_INICIADOS_SUB15', '2066071'),
  ('Gonçalo Matias Pires Geraldo', 'Gonçalo Geraldo', 90, true, 'AMPORTELA_INICIADOS_SUB15', '2107719'),
  ('Gonçalo Meneses Da Silva', 'Gonçalo Meneses', 100, true, 'AMPORTELA_INICIADOS_SUB15', '2233508'),
  ('Guilherme Arruda Nine', 'Guilherme Nine', 110, true, 'AMPORTELA_INICIADOS_SUB15', '2109694'),
  ('Isaac Cristovão Lima Rosário', 'Isaac Rosário', 120, true, 'AMPORTELA_INICIADOS_SUB15', '2049620'),
  ('Lourenço José Nunes Dos Santos', 'Lourenço Santos', 130, true, 'AMPORTELA_INICIADOS_SUB15', '2007097'),
  ('Nelson Richard Getzy Moreira Gonçalves', 'Nelson Gonçalves', 140, true, 'AMPORTELA_INICIADOS_SUB15', '2351327'),
  ('Pedro Lucas Martins', 'Pedro Martins', 150, true, 'AMPORTELA_INICIADOS_SUB15', '2099144'),
  ('Tomás Sá Pires Sena Bonina', 'Tomás Bonina', 160, true, 'AMPORTELA_INICIADOS_SUB15', '2185321')
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true,
    roster_key = excluded.roster_key,
    fpf_player_id = excluded.fpf_player_id;

-- Resolve the primary roster for all four competitions.
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
      when upper(btrim(coalesce(p_competition, ''))) = 'CD II DIVISÃO | SUB 19 FUTSAL'
        then 'AMPORTELA_JUNIORES_SUB19'
      when upper(btrim(coalesce(p_competition, ''))) = 'CD II DIVISÃO | SUB 17 FUTSAL'
        then 'AMPORTELA_JUVENIS_SUB17'
      when upper(btrim(coalesce(p_competition, ''))) = 'CD I DIVISÃO | SUB 15 FUTSAL'
        then 'AMPORTELA_INICIADOS_SUB15'
      else null
    end;
$$;

-- Show only fixtures whose clocks have not yet been started in the available
-- matches list. Existing live/finished match records are not deleted.
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
  from public.public_live_matches m
  where m.live_status = 'scheduled';
$$;

-- Allow exactly twelve selected players from the competition squad plus, when
-- applicable, players from the immediately younger squad only.
drop function if exists public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[], boolean
);

create or replace function public.create_public_live_match(
  p_competition text,
  p_round_label text,
  p_amportela text,
  p_opponent text,
  p_analyzed_team text,
  p_played_at date,
  p_kickoff_time time,
  p_venue text,
  p_player_ids uuid[],
  p_is_home boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_match_id uuid;
  selected_roster_key text;
  lower_roster_key text;
  selected_count integer;
  home_team_name text;
  away_team_name text;
begin
  if length(btrim(coalesce(p_competition, ''))) < 2
     or length(btrim(coalesce(p_amportela, ''))) = 0
     or length(btrim(coalesce(p_opponent, ''))) = 0
     or p_played_at is null
     or p_kickoff_time is null
     or length(btrim(coalesce(p_venue, ''))) < 2
     or p_is_home is null then
    raise exception 'Preenche todos os dados obrigatórios do jogo';
  end if;

  if lower(btrim(p_amportela)) <> 'amportela'
     or lower(btrim(p_analyzed_team)) <> 'amportela' then
    raise exception 'A equipa analisada nesta aplicação é sempre a AMPortela';
  end if;

  if lower(btrim(p_amportela)) = lower(btrim(p_opponent)) then
    raise exception 'O adversário tem de ser diferente da AMPortela';
  end if;

  selected_roster_key := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS'
      then 'PORTELA_SENIORES_MASCULINOS'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 19 FUTSAL'
      then 'AMPORTELA_JUNIORES_SUB19'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 17 FUTSAL'
      then 'AMPORTELA_JUVENIS_SUB17'
    when upper(btrim(p_competition)) = 'CD I DIVISÃO | SUB 15 FUTSAL'
      then 'AMPORTELA_INICIADOS_SUB15'
    else null
  end;

  lower_roster_key := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS'
      then 'AMPORTELA_JUNIORES_SUB19'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 19 FUTSAL'
      then 'AMPORTELA_JUVENIS_SUB17'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 17 FUTSAL'
      then 'AMPORTELA_INICIADOS_SUB15'
    else null
  end;

  if selected_roster_key is null then
    raise exception 'Competição não reconhecida';
  end if;

  if coalesce(array_length(p_player_ids, 1), 0) <> 12 then
    raise exception 'Tens de selecionar exatamente 12 jogadores para o jogo';
  end if;

  select count(*) into selected_count
  from public.public_live_players p
  where p.id = any(p_player_ids)
    and p.active
    and p.roster_key in (selected_roster_key, lower_roster_key);

  if selected_count <> 12 then
    raise exception 'A seleção deve conter 12 jogadores distintos do plantel desta competição ou do escalão imediatamente inferior';
  end if;

  if p_is_home then
    home_team_name := 'AMPortela';
    away_team_name := btrim(p_opponent);
  else
    home_team_name := btrim(p_opponent);
    away_team_name := 'AMPortela';
  end if;

  insert into public.public_live_matches(
    competition, round_label, home_team, away_team, analyzed_team,
    played_at, kickoff_time, venue
  ) values (
    btrim(p_competition), nullif(btrim(coalesce(p_round_label, '')), ''),
    home_team_name, away_team_name, 'AMPortela',
    p_played_at, p_kickoff_time, btrim(p_venue)
  ) returning id into created_match_id;

  insert into public.public_live_clocks(match_id, status)
  values (created_match_id, 'scheduled');

  insert into public.public_live_match_players(match_id, player_id, display_name)
  select created_match_id, p.id, coalesce(nullif(btrim(p.short_name), ''), p.full_name)
  from public.public_live_players p
  where p.id = any(p_player_ids)
    and p.active
    and p.roster_key in (selected_roster_key, lower_roster_key)
  order by p.sort_order, p.full_name;

  return created_match_id;
end;
$$;

revoke all on function public.list_public_live_roster(text) from public;
grant execute on function public.list_public_live_roster(text) to anon, authenticated;

revoke all on function public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[], boolean
) from public;
grant execute on function public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[], boolean
) to anon, authenticated;
