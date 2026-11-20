-- Explicit home/away designation for the AMPortela public live match form.
-- AMPortela remains the analysed team regardless of venue.

drop function if exists public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[]
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
    and p.roster_key = selected_roster_key
  order by p.sort_order, p.full_name;

  return created_match_id;
end;
$$;

revoke all on function public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[], boolean
) from public;

grant execute on function public.create_public_live_match(
  text, text, text, text, text, date, time, text, uuid[], boolean
) to anon, authenticated;
