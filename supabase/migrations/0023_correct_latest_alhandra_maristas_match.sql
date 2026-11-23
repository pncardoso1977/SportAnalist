-- Correct the most recently active event-analysis match from
-- "Alhandra x Maristas" to "Portela Sub17 x Maristas".
-- Preserve every event, its timestamp, video URL, outcome and zone.
-- Update team references and the attacking/defending labels so the event
-- association trigger remains consistent with the corrected match.

do $correction$
declare
  target_match_id uuid;
  target_project_id uuid;
  portela_team_id uuid;
  maristas_team_id uuid;
  updated_events integer := 0;
begin
  select m.id, m.project_id
    into target_match_id, target_project_id
  from public.matches m
  where lower(btrim(m.home_team)) = 'alhandra'
    and lower(btrim(m.away_team)) = 'maristas'
    and lower(btrim(m.analyzed_team)) = 'alhandra'
    and exists (
      select 1
      from public.match_events e
      where e.match_id = m.id
    )
  order by (
    select max(e.created_at)
    from public.match_events e
    where e.match_id = m.id
  ) desc nulls last, m.created_at desc
  limit 1
  for update of m;

  if target_match_id is null then
    if exists (
      select 1
      from public.matches m
      where lower(btrim(m.home_team)) = 'portela sub17'
        and lower(btrim(m.away_team)) = 'maristas'
        and lower(btrim(m.analyzed_team)) = 'portela sub17'
        and exists (
          select 1 from public.match_events e where e.match_id = m.id
        )
    ) then
      raise notice 'O registo Portela Sub17 x Maristas já está corrigido. Nenhuma alteração adicional foi feita.';
      return;
    end if;

    raise exception 'Não foi encontrado um jogo com eventos associado a Alhandra x Maristas. Nenhum registo foi alterado.';
  end if;

  insert into public.teams (project_id, name)
  values (target_project_id, 'Portela Sub17')
  on conflict (project_id, normalized_name)
  do update set name = excluded.name
  returning id into portela_team_id;

  insert into public.teams (project_id, name)
  values (target_project_id, 'Maristas')
  on conflict (project_id, normalized_name)
  do update set name = excluded.name
  returning id into maristas_team_id;

  -- Change the match first. The event-association trigger then validates
  -- the corrected event rows against Portela Sub17 as the analysed team.
  update public.matches
  set home_team = 'Portela Sub17',
      analyzed_team = 'Portela Sub17'
  where id = target_match_id;

  update public.match_events
  set team_id = case
        when moment = 'attack'::public.event_moment then portela_team_id
        else maristas_team_id
      end,
      attacking_team = case
        when moment = 'attack'::public.event_moment then 'Portela Sub17'
        else 'Maristas'
      end,
      defending_team = case
        when moment = 'attack'::public.event_moment then 'Maristas'
        else 'Portela Sub17'
      end
  where match_id = target_match_id;

  get diagnostics updated_events = row_count;

  raise notice 'Jogo corrigido: Portela Sub17 x Maristas. % eventos mantidos e atualizados. Match ID: %',
    updated_events, target_match_id;
end;
$correction$;
