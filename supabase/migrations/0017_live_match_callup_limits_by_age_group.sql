-- Apply competition-specific maximum call-up sizes in the public live-match RPC.
-- Seniors: 14; Juniores, Juvenis, Iniciados and Infantis: 12; Benjamins and Traquinas: 15.

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
  max_selected_count integer;
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

  max_selected_count := case
    when upper(btrim(p_competition)) = 'CD II DIV SENIORES MASCULINOS' then 14
    when upper(btrim(p_competition)) in (
      'CD | SUB 11 FUTSAL',
      'FOOTLOURES | FUTSAL | 2026 | SUB 11',
      'ENCONTROS MINI FUTSAL - TRAQUINAS'
    ) then 15
    else 12
  end;

  if coalesce(cardinality(p_player_ids), 0) < 1
     or coalesce(cardinality(p_player_ids), 0) > max_selected_count then
    raise exception 'A convocatória deste escalão deve conter entre 1 e % jogadores', max_selected_count;
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
