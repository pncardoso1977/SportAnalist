-- Add AMPortela Benjamins Sub-11 and Traquinas squads.
-- Both Benjamins competitions use the same registered Sub-11 squad.
-- Extend the call-up chain by one age group. Birth dates and photos are not stored.

insert into public.public_live_players
  (full_name, short_name, sort_order, active, roster_key, fpf_player_id)
values
  ('André De Freitas Pereira', 'André Pereira', 10, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Bernardo Alves Farinha Rodrigues', 'Bernardo Rodrigues', 20, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Denis Oliveira Dos Santos', 'Denis Santos', 30, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Duarte De Carmo Pires Margaça Lopes', 'Duarte Lopes', 40, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Francisco Dos Santos Lemos', 'Francisco Lemos', 50, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Francisco Jorge Ferreira Justino', 'Francisco Justino', 60, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Francisco Manuel Barbosa Gaspar', 'Francisco Gaspar', 70, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Francisco Medeiros Franco Dos Santos', 'Francisco Medeiros', 80, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Francisco Sambado Fael', 'Francisco Fael', 90, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Frederico De Amorim Gonçalves Bento Da Silva', 'Frederico Silva', 100, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Grady Alexander Woods', 'Grady Woods', 110, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Guilherme Figueiredo De Barros Rodrigues Dos Santos', 'Guilherme Barros', 120, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('João Francisco Rita Neves', 'João Neves', 130, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Laura Binder Barreiros', 'Laura Barreiros', 140, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Lev Klymenko', 'Lev Klymenko', 150, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Marco Ionita Macovei', 'Marco Macovei', 160, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Martim Correia Sampaio', 'Martim Sampaio', 170, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Miguel De Paiva Almeida', 'Miguel Almeida', 180, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Noah Araujo Fernandes', 'Noah Fernandes', 190, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Raul Maia Laranjeira', 'Raul Laranjeira', 200, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Rodrigo Cunha Cardoso', 'Rodrigo Cardoso', 210, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Rodrigo Mendonça Mazzeo Cruz Martins', 'Rodrigo Martins', 220, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Tiago Marques Graça', 'Tiago Graça', 230, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Tomás Miguel Das Neves Esteves', 'Tomás Esteves', 240, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Valentina Maia Laranjeira', 'Valentina Laranjeira', 250, true, 'AMPORTELA_BENJAMINS_SUB11', null),
  ('Vasco Custódio Inácio', 'Vasco Inácio', 260, true, 'AMPORTELA_BENJAMINS_SUB11', null)
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true,
    roster_key = excluded.roster_key,
    fpf_player_id = excluded.fpf_player_id;

insert into public.public_live_players
  (full_name, short_name, sort_order, active, roster_key, fpf_player_id)
values
  ('Benjamin Fernandes Monteiro', 'Benjamin Monteiro', 10, true, 'AMPORTELA_TRAQUINAS_SUB9', '2407607'),
  ('Lourenço Fragata Duque', 'Lourenço Duque', 20, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406180'),
  ('Lourenço Pinto Matias', 'Lourenço Matias', 30, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406521'),
  ('Manuel Nunes Vieira', 'Manuel Vieira', 40, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406178'),
  ('Miguel Ventura Ferreira', 'Miguel Ferreira', 50, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406179'),
  ('Romeu Cercas Dos Santos', 'Romeu Santos', 60, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406523'),
  ('Tiago Soares Sousa De Azevedo E Castro', 'Tiago Azevedo', 70, true, 'AMPORTELA_TRAQUINAS_SUB9', '2409115'),
  ('Tiago Tonel Figueira Santos', 'Tiago Tonel', 80, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406182'),
  ('Vasco Guerra Costa De São Pedro Geraldes', 'Vasco Geraldes', 90, true, 'AMPORTELA_TRAQUINAS_SUB9', '2406181')
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true,
    roster_key = excluded.roster_key,
    fpf_player_id = excluded.fpf_player_id;

-- Map both Benjamins competitions to the same Sub-11 team roster.
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
      when upper(btrim(coalesce(p_competition, ''))) = 'CD II DIVISÃO | SUB 13 FUTSAL'
        then 'AMPORTELA_INFANTIS_SUB13'
      when upper(btrim(coalesce(p_competition, ''))) in (
        'CD | SUB 11 FUTSAL',
        'FOOTLOURES | FUTSAL | 2026 | SUB 11'
      ) then 'AMPORTELA_BENJAMINS_SUB11'
      when upper(btrim(coalesce(p_competition, ''))) = 'ENCONTROS MINI FUTSAL - TRAQUINAS'
        then 'AMPORTELA_TRAQUINAS_SUB9'
      else null
    end;
$$;

-- Extend the same age-group call-up chain through Benjamins and Traquinas.
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
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 13 FUTSAL'
      then 'AMPORTELA_INFANTIS_SUB13'
    when upper(btrim(p_competition)) in (
      'CD | SUB 11 FUTSAL',
      'FOOTLOURES | FUTSAL | 2026 | SUB 11'
    ) then 'AMPORTELA_BENJAMINS_SUB11'
    when upper(btrim(p_competition)) = 'ENCONTROS MINI FUTSAL - TRAQUINAS'
      then 'AMPORTELA_TRAQUINAS_SUB9'
    else null
  end;

  lower_roster_key := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS'
      then 'AMPORTELA_JUNIORES_SUB19'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 19 FUTSAL'
      then 'AMPORTELA_JUVENIS_SUB17'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 17 FUTSAL'
      then 'AMPORTELA_INICIADOS_SUB15'
    when upper(btrim(p_competition)) = 'CD I DIVISÃO | SUB 15 FUTSAL'
      then 'AMPORTELA_INFANTIS_SUB13'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 13 FUTSAL'
      then 'AMPORTELA_BENJAMINS_SUB11'
    when upper(btrim(p_competition)) in (
      'CD | SUB 11 FUTSAL',
      'FOOTLOURES | FUTSAL | 2026 | SUB 11'
    ) then 'AMPORTELA_TRAQUINAS_SUB9'
    else null
  end;

  if selected_roster_key is null then
    raise exception 'Competição não reconhecida';
  end if;

  if coalesce(cardinality(p_player_ids), 0) < 1
     or coalesce(cardinality(p_player_ids), 0) > 12 then
    raise exception 'A convocatória deve conter entre 1 e 12 jogadores';
  end if;

  select count(*) into selected_count
  from public.public_live_players p
  where p.id = any(p_player_ids)
    and p.active
    and p.roster_key in (selected_roster_key, lower_roster_key);

  if selected_count <> cardinality(p_player_ids) then
    raise exception 'Seleciona jogadores distintos e ativos do plantel desta competição ou do escalão imediatamente inferior';
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
