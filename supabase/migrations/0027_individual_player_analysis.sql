-- Per-match individual player analysis.
-- Player actions are stored separately from team tactical events and linked to
-- the YouTube source/timestamp used when the analyst records the action.

create table if not exists public.match_analysis_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  shirt_number text check (shirt_number is null or length(btrim(shirt_number)) <= 6),
  role_key text not null check (role_key in ('goalkeeper', 'field')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists match_analysis_players_match_name_uidx
  on public.match_analysis_players(match_id, lower(btrim(display_name)));

create index if not exists match_analysis_players_match_role_idx
  on public.match_analysis_players(match_id, role_key, sort_order, display_name);

alter table public.match_analysis_players enable row level security;
revoke all on public.match_analysis_players from anon, authenticated;

drop policy if exists "members read match analysis players" on public.match_analysis_players;
create policy "members read match analysis players" on public.match_analysis_players
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_analysis_players.match_id
        and public.is_project_member(m.project_id)
    )
  );

drop policy if exists "analysts add match analysis players" on public.match_analysis_players;
create policy "analysts add match analysis players" on public.match_analysis_players
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_analysis_players.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

drop policy if exists "analysts update match analysis players" on public.match_analysis_players;
create policy "analysts update match analysis players" on public.match_analysis_players
  for update to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_analysis_players.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_analysis_players.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

drop policy if exists "analysts remove match analysis players" on public.match_analysis_players;
create policy "analysts remove match analysis players" on public.match_analysis_players
  for delete to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_analysis_players.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

grant select, insert, update, delete on public.match_analysis_players to authenticated;

create table if not exists public.match_player_analysis_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.match_analysis_players(id) on delete cascade,
  category_key text not null check (category_key in (
    'goalkeeper_save',
    'goalkeeper_incomplete_save',
    'goalkeeper_goal_conceded',
    'goalkeeper_sweep_behind',
    'goalkeeper_sweep_front',
    'goalkeeper_ball_release',
    'goalkeeper_footwork',
    'field_pass',
    'field_reception',
    'field_ball_carry',
    'field_ball_loss',
    'field_shot',
    'field_interception'
  )),
  detail_key text,
  video_second integer not null check (video_second >= 0),
  youtube_url text not null check (length(btrim(youtube_url)) > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists match_player_analysis_events_match_time_idx
  on public.match_player_analysis_events(match_id, video_second desc, created_at desc);
create index if not exists match_player_analysis_events_player_time_idx
  on public.match_player_analysis_events(player_id, video_second desc, created_at desc);
create index if not exists match_player_analysis_events_group_idx
  on public.match_player_analysis_events(group_id);

alter table public.match_player_analysis_events enable row level security;
revoke all on public.match_player_analysis_events from anon, authenticated;

drop policy if exists "members read match player analysis events" on public.match_player_analysis_events;
create policy "members read match player analysis events" on public.match_player_analysis_events
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_player_analysis_events.match_id
        and public.is_project_member(m.project_id)
    )
  );

drop policy if exists "analysts add match player analysis events" on public.match_player_analysis_events;
create policy "analysts add match player analysis events" on public.match_player_analysis_events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_player_analysis_events.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

drop policy if exists "analysts remove match player analysis events" on public.match_player_analysis_events;
create policy "analysts remove match player analysis events" on public.match_player_analysis_events
  for delete to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_player_analysis_events.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

grant select, insert, delete on public.match_player_analysis_events to authenticated;

-- Validate that each action belongs to the player's role and uses only the
-- appropriate detail options supplied by the capture UI.
create or replace function public.validate_match_player_analysis_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  player_match_id uuid;
  player_role text;
begin
  select match_id, role_key
    into player_match_id, player_role
  from public.match_analysis_players
  where id = new.player_id;

  if player_match_id is null or player_match_id <> new.match_id then
    raise exception 'O jogador selecionado não pertence a este jogo';
  end if;

  if player_role = 'goalkeeper' then
    if new.category_key not like 'goalkeeper\_%' then
      raise exception 'A ação selecionada não corresponde a um guarda-redes';
    end if;
  elsif player_role = 'field' then
    if new.category_key not like 'field\_%' then
      raise exception 'A ação selecionada não corresponde a um jogador de campo';
    end if;
  else
    raise exception 'Tipo de jogador inválido';
  end if;

  if new.category_key = 'goalkeeper_save'
     and coalesce(new.detail_key, '') not in ('posts', 'area', 'outside') then
    raise exception 'Seleciona onde ocorreu a defesa';
  elsif new.category_key in ('goalkeeper_goal_conceded', 'goalkeeper_sweep_behind', 'goalkeeper_sweep_front', 'goalkeeper_ball_release')
     and coalesce(new.detail_key, '') not in ('right', 'left', 'center') then
    raise exception 'Seleciona o lado da ação do guarda-redes';
  elsif new.category_key = 'field_pass'
     and coalesce(new.detail_key, '') not in ('short', 'long') then
    raise exception 'Seleciona se o passe foi curto ou longo';
  elsif new.category_key in (
    'goalkeeper_incomplete_save', 'goalkeeper_footwork',
    'field_reception', 'field_ball_carry', 'field_ball_loss', 'field_shot', 'field_interception'
  ) and nullif(btrim(coalesce(new.detail_key, '')), '') is not null then
    raise exception 'Esta ação não necessita de detalhe adicional';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_match_player_analysis_event on public.match_player_analysis_events;
create trigger validate_match_player_analysis_event
before insert or update of match_id, player_id, category_key, detail_key
on public.match_player_analysis_events
for each row execute function public.validate_match_player_analysis_event();
