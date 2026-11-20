-- Per-match short/display names for the public live squad.
-- Defaults use concise identifiers; operators can edit these labels for each match.

alter table public.public_live_players
  add column if not exists short_name text;

update public.public_live_players
set short_name = case full_name
  when 'Afonso Silva Gomes Cidade Costa' then 'Afonso Cidade'
  when 'Daniel Dias Ferreira' then 'Daniel Ferreira'
  when 'Duarte Caldeira Fernandes Nunes Ferreira' then 'Duarte Nunes'
  when 'Duarte Geraldo Ribeiro' then 'Duarte Ribeiro'
  when 'Francisco Maria Tovar Rei Ribeiro Dias' then 'Francisco Dias'
  when 'Guilherme De Almeida Rodrigues Vasconcelos Relvas' then 'Guilherme Relvas'
  when 'João Maria Espada Feio Vieira Gonçalves' then 'João Gonçalves'
  when 'João Pedro Ferreira Fernandes' then 'João Fernandes'
  when 'Lourenço Costa Pinto Coelho' then 'Lourenço Coelho'
  when 'Sebastião Tomé Baptista' then 'Sebastião Baptista'
  when 'Simão Cardoso Da Silva' then 'Simão Cardoso'
  else coalesce(nullif(btrim(short_name), ''), full_name)
end
where short_name is null or btrim(short_name) = '';

alter table public.public_live_players
  alter column short_name set default '',
  alter column short_name set not null;

create table if not exists public.public_live_match_players (
  match_id uuid not null references public.public_live_matches(id) on delete cascade,
  player_id uuid not null references public.public_live_players(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index if not exists public_live_match_players_player_idx
  on public.public_live_match_players(player_id, match_id);

alter table public.public_live_match_players enable row level security;
revoke all on public.public_live_match_players from anon, authenticated;

-- Backfill any public live matches created before this migration.
insert into public.public_live_match_players(match_id, player_id, display_name)
select m.id, p.id, coalesce(nullif(btrim(p.short_name), ''), p.full_name)
from public.public_live_matches m
cross join public.public_live_players p
where p.active
on conflict (match_id, player_id) do nothing;

-- New matches automatically receive their own editable squad labels.
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

  insert into public.public_live_match_players(match_id, player_id, display_name)
  select created_match_id, p.id, coalesce(nullif(btrim(p.short_name), ''), p.full_name)
  from public.public_live_players p
  where p.active;

  return created_match_id;
end;
$$;

-- Public RPC updates only the display label belonging to this specific fixture.
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
    from public.public_live_matches m
    join public.public_live_players p on p.id = p_player_id and p.active
    where m.id = p_match_id
  ) then
    raise exception 'Jogo ou jogador não encontrado';
  end if;

  insert into public.public_live_match_players(match_id, player_id, display_name)
  values (p_match_id, p_player_id, btrim(p_display_name))
  on conflict (match_id, player_id)
  do update set display_name = excluded.display_name, updated_at = clock_timestamp()
  returning display_name into saved_name;

  return jsonb_build_object('player_id', p_player_id, 'display_name', saved_name);
end;
$$;

-- Replace the public projection so the match-specific editable name is used.
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
        'display_name', coalesce(mp.display_name, p.short_name, p.full_name),
        'sort_order', p.sort_order,
        'active', exists (
          select 1 from public.public_live_player_stints s
          where s.match_id = m.id and s.player_id = p.id and s.ended_second is null
        )
      ) order by p.sort_order, coalesce(mp.display_name, p.short_name, p.full_name))
      from public.public_live_players p
      left join public.public_live_match_players mp
        on mp.match_id = m.id and mp.player_id = p.id
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

revoke all on function public.set_public_live_player_name(uuid, uuid, text) from public;
grant execute on function public.set_public_live_player_name(uuid, uuid, text) to anon, authenticated;
