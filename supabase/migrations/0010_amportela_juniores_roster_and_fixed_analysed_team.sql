-- AMPortela tenant configuration and Juniores Sub-19 roster.
-- Keep the existing Sub-17 and senior squads, adding the junior squad as a
-- separate competition-specific roster. Do not store player birth dates or photos.

-- Rebrand the existing Sub-17 roster for the current AMPortela client.
update public.public_live_players
set roster_key = 'AMPORTELA_JUVENIS_SUB17'
where roster_key = 'ASSOCIACAO_MARISTA_SUB17';

alter table public.public_live_players
  alter column roster_key set default 'AMPORTELA_JUVENIS_SUB17';

-- Juniores: CD II DIVISÃO | SUB 19 FUTSAL (14 players).
insert into public.public_live_players
  (full_name, short_name, sort_order, active, roster_key, fpf_player_id)
values
  ('Emanuel Alexandre Ferreira Espanhol', 'Emanuel Espanhol', 10, true, 'AMPORTELA_JUNIORES_SUB19', '1898313'),
  ('Frederico Miguel Dos Santos Martins', 'Frederico Martins', 20, true, 'AMPORTELA_JUNIORES_SUB19', '2175411'),
  ('Guilherme Alexandre Da Silva Viegas', 'Guilherme Viegas', 30, true, 'AMPORTELA_JUNIORES_SUB19', '2238031'),
  ('Guilherme Anceriz Oliveira Vaz', 'Guilherme Vaz', 40, true, 'AMPORTELA_JUNIORES_SUB19', '1949289'),
  ('Gustavo Saraiva Gonçalves', 'Gustavo Gonçalves', 50, true, 'AMPORTELA_JUNIORES_SUB19', '2040095'),
  ('Henrique Maria Tiago Cordeiro Rodrigues Estrelo', 'Henrique Estrelo', 60, true, 'AMPORTELA_JUNIORES_SUB19', '1828785'),
  ('João Francisco Madeira Gonçalves Brito Teixeira', 'João Madeira', 70, true, 'AMPORTELA_JUNIORES_SUB19', '1842713'),
  ('Mario Paulo Nunes Dias Dos Santos', 'Mario Dias', 80, true, 'AMPORTELA_JUNIORES_SUB19', '1897106'),
  ('Martim José Moreira De Carvalho', 'Martim Carvalho', 90, true, 'AMPORTELA_JUNIORES_SUB19', '1829728'),
  ('Rodrigo Guedes Viegas', 'Rodrigo Viegas', 100, true, 'AMPORTELA_JUNIORES_SUB19', '2361356'),
  ('Sebastião Pires Castro Pestana De Vasconcelos', 'Sebastião Vasconcelos', 110, true, 'AMPORTELA_JUNIORES_SUB19', '1904302'),
  ('Tomás Alexandre Simões Barradas', 'Tomás Barradas', 120, true, 'AMPORTELA_JUNIORES_SUB19', '2365260'),
  ('Tomás Dos Santos Oliveira', 'Tomás Oliveira', 130, true, 'AMPORTELA_JUNIORES_SUB19', '1833371'),
  ('Vasco Alexandre Raimundo Pessoa', 'Vasco Pessoa', 140, true, 'AMPORTELA_JUNIORES_SUB19', '1898301')
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true,
    roster_key = excluded.roster_key,
    fpf_player_id = excluded.fpf_player_id;

-- Select the correct roster using the competition attached to the fixture.
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
      else 'AMPORTELA_JUVENIS_SUB17'
    end;
$$;

-- AMPortela is always the analysed team for this app tenant.
-- Each fixture must contain exactly twelve unique players from its competition roster.
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
     or p_played_at is null
     or p_kickoff_time is null
     or length(btrim(coalesce(p_venue, ''))) < 2 then
    raise exception 'Preenche todos os dados obrigatórios do jogo';
  end if;

  if lower(btrim(p_home_team)) = lower(btrim(p_away_team)) then
    raise exception 'As equipas têm de ser diferentes';
  end if;

  if lower(btrim(coalesce(p_home_team, ''))) <> 'amportela'
     or lower(btrim(coalesce(p_analyzed_team, ''))) <> 'amportela' then
    raise exception 'A equipa analisada nesta aplicação é sempre a AMPortela';
  end if;

  selected_roster_key := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS'
      then 'PORTELA_SENIORES_MASCULINOS'
    when upper(btrim(p_competition)) = 'CD II DIVISÃO | SUB 19 FUTSAL'
      then 'AMPORTELA_JUNIORES_SUB19'
    else 'AMPORTELA_JUVENIS_SUB17'
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
    'AMPortela', btrim(p_away_team), 'AMPortela',
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

revoke all on function public.list_public_live_roster(text) from public;
grant execute on function public.list_public_live_roster(text) to anon, authenticated;

revoke all on function public.create_public_live_match(text, text, text, text, text, date, time, text, uuid[]) from public;
grant execute on function public.create_public_live_match(text, text, text, text, text, date, time, text, uuid[]) to anon, authenticated;
