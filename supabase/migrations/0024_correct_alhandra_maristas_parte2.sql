-- Correct the exact "Alhandra vs Maristas parte2" analysis match.
-- Preserve the existing match ID, video URL, events, timestamps, outcomes and zones.
-- If already corrected, the migration exits without changing anything.

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
    and lower(btrim(m.away_team)) = 'maristas parte2'
    and lower(btrim(m.analyzed_team)) = 'alhandra'
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
      where lower(btrim(m.home_team)) = 'amportela sub17'
        and lower(btrim(m.away_team)) = 'maristas parte2'
        and lower(btrim(m.analyzed_team)) = 'amportela sub17'
    ) then
      raise notice 'O jogo AMPortela Sub17 vs Maristas parte2 já está corrigido. Nenhuma alteração adicional foi feita.';
      return;
    end if;

    raise exception 'Não foi encontrado o jogo Alhandra vs Maristas parte2. Nenhum registo foi alterado.';
  end if;

  insert into public.teams (project_id, name)
  values (target_project_id, 'AMPortela Sub17')
  on conflict (project_id, normalized_name)
  do update set name = excluded.name
  returning id into portela_team_id;

  insert into public.teams (project_id, name)
  values (target_project_id, 'Maristas parte2')
  on conflict (project_id, normalized_name)
  do update set name = excluded.name
  returning id into maristas_team_id;

  -- Correct the match before changing its events, so the event-association
  -- trigger validates each event against AMPortela Sub17 vs Maristas parte2.
  update public.matches
  set home_team = 'AMPortela Sub17',
      analyzed_team = 'AMPortela Sub17'
  where id = target_match_id;

  update public.match_events
  set team_id = case
        when moment = 'attack'::public.event_moment then portela_team_id
        else maristas_team_id
      end,
      attacking_team = case
        when moment = 'attack'::public.event_moment then 'AMPortela Sub17'
        else 'Maristas parte2'
      end,
      defending_team = case
        when moment = 'attack'::public.event_moment then 'Maristas parte2'
        else 'AMPortela Sub17'
      end
  where match_id = target_match_id;

  get diagnostics updated_events = row_count;

  raise notice 'Jogo corrigido para AMPortela Sub17 vs Maristas parte2. % eventos preservados e atualizados. Match ID: %',
    updated_events, target_match_id;
end;
$correction$;
