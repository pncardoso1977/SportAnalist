-- Persist a single halftime marker and expose player time reports by period.
-- The half boundary uses accumulated game-clock seconds; stoppage between halves is excluded.

alter table public.public_live_clocks
  add column if not exists first_half_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'public_live_clocks_first_half_seconds_check'
      and conrelid = 'public.public_live_clocks'::regclass
  ) then
    alter table public.public_live_clocks
      add constraint public_live_clocks_first_half_seconds_check
      check (first_half_seconds is null or first_half_seconds >= 0);
  end if;
end $$;

create or replace function public.get_public_live_match(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id, 'competition', m.competition, 'round_label', m.round_label,
      'home_team', m.home_team, 'away_team', m.away_team,
      'analyzed_team', m.analyzed_team, 'played_at', m.played_at,
      'kickoff_time', m.kickoff_time, 'venue', m.venue, 'live_status', m.live_status
    ),
    'clock', jsonb_build_object(
      'elapsed_seconds', coalesce(c.elapsed_seconds, 0),
      'first_half_seconds', c.first_half_seconds,
      'started_at', c.started_at,
      'status', coalesce(c.status, 'scheduled')
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'display_name', mp.display_name,
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
        'id', s.id, 'match_id', s.match_id, 'player_id', s.player_id,
        'started_second', s.started_second, 'ended_second', s.ended_second,
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

create or replace function public.start_public_live_clock(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
begin
  select * into clock_row from public.public_live_clocks
  where match_id = p_match_id for update;
  if not found then raise exception 'Jogo não encontrado'; end if;
  if clock_row.status = 'finished' then raise exception 'O jogo já terminou'; end if;

  if clock_row.started_at is null then
    update public.public_live_clocks
    set started_at = clock_timestamp(), status = 'running', updated_at = clock_timestamp()
    where match_id = p_match_id returning * into clock_row;
  end if;

  update public.public_live_matches set live_status = 'live' where id = p_match_id;
  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'first_half_seconds', clock_row.first_half_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

drop function if exists public.pause_public_live_clock(uuid);

create or replace function public.pause_public_live_clock(
  p_match_id uuid,
  p_is_halftime boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  new_elapsed integer;
begin
  select * into clock_row from public.public_live_clocks
  where match_id = p_match_id for update;
  if not found then raise exception 'Jogo não encontrado'; end if;
  if clock_row.status = 'finished' then raise exception 'O jogo já terminou'; end if;
  if clock_row.status <> 'running' or clock_row.started_at is null then
    raise exception 'Só é possível pausar um cronómetro em andamento';
  end if;
  if p_is_halftime is null then
    raise exception 'Indica se a pausa corresponde ao intervalo';
  end if;
  if p_is_halftime and clock_row.first_half_seconds is not null then
    raise exception 'O intervalo já foi registado. Só é permitido um intervalo por jogo';
  end if;

  new_elapsed := clock_row.elapsed_seconds
    + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  if p_is_halftime and new_elapsed < 1 then
    raise exception 'Não é possível registar o intervalo antes de existir tempo de jogo';
  end if;

  update public.public_live_clocks
  set elapsed_seconds = new_elapsed,
      started_at = null,
      status = 'paused',
      first_half_seconds = case when p_is_halftime then new_elapsed else first_half_seconds end,
      updated_at = clock_timestamp()
  where match_id = p_match_id
  returning * into clock_row;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'first_half_seconds', clock_row.first_half_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

create or replace function public.finish_public_live_clock(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  final_second integer;
begin
  select * into clock_row from public.public_live_clocks
  where match_id = p_match_id for update;
  if not found then raise exception 'Jogo não encontrado'; end if;
  if clock_row.status = 'finished' then raise exception 'O jogo já terminou'; end if;

  final_second := clock_row.elapsed_seconds;
  if clock_row.started_at is not null then
    final_second := final_second + greatest(0, floor(extract(epoch from (clock_timestamp() - clock_row.started_at)))::integer);
  end if;

  update public.public_live_player_stints
  set ended_second = greatest(final_second, started_second)
  where match_id = p_match_id and ended_second is null;

  update public.public_live_clocks
  set elapsed_seconds = final_second, started_at = null, status = 'finished', updated_at = clock_timestamp()
  where match_id = p_match_id returning * into clock_row;

  update public.public_live_matches set live_status = 'finished' where id = p_match_id;

  return jsonb_build_object(
    'elapsed_seconds', clock_row.elapsed_seconds,
    'first_half_seconds', clock_row.first_half_seconds,
    'started_at', clock_row.started_at,
    'status', clock_row.status
  );
end;
$$;

revoke all on function public.get_public_live_match(uuid) from public;
revoke all on function public.start_public_live_clock(uuid) from public;
revoke all on function public.pause_public_live_clock(uuid, boolean) from public;
revoke all on function public.finish_public_live_clock(uuid) from public;
grant execute on function public.get_public_live_match(uuid) to anon, authenticated;
grant execute on function public.start_public_live_clock(uuid) to anon, authenticated;
grant execute on function public.pause_public_live_clock(uuid, boolean) to anon, authenticated;
grant execute on function public.finish_public_live_clock(uuid) to anon, authenticated;
