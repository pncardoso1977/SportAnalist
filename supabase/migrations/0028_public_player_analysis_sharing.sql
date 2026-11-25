-- Public, read-only sharing scoped to one player's individual analysis.
-- Public RPC returns only this player's identity and registered actions.

create table if not exists public.match_player_analysis_shares (
  player_id uuid primary key references public.match_analysis_players(id) on delete cascade,
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.match_player_analysis_shares enable row level security;
revoke all on table public.match_player_analysis_shares from anon, authenticated;

create or replace function public.create_player_analysis_share(target_player uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_match uuid;
  target_project uuid;
  result_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.match_id, m.project_id
    into target_match, target_project
  from public.match_analysis_players p
  join public.matches m on m.id = p.match_id
  where p.id = target_player;

  if target_match is null or target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can create a public player analysis link';
  end if;

  if not exists (
    select 1 from public.match_player_analysis_events e
    where e.player_id = target_player and e.match_id = target_match
  ) then
    raise exception 'O jogador ainda não tem momentos registados';
  end if;

  -- Keep an existing token stable when the request is repeated.
  insert into public.match_player_analysis_shares (player_id, created_by)
  values (target_player, auth.uid())
  on conflict (player_id) do update
    set created_by = auth.uid(),
        created_at = now()
  returning share_token into result_token;

  return result_token;
end;
$$;

create or replace function public.get_player_analysis_share_token(target_player uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  result_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.project_id into target_project
  from public.match_analysis_players p
  join public.matches m on m.id = p.match_id
  where p.id = target_player;

  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can access the public player analysis link';
  end if;

  select share_token into result_token
  from public.match_player_analysis_shares
  where player_id = target_player;

  return result_token;
end;
$$;

create or replace function public.revoke_player_analysis_share(target_player uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.project_id into target_project
  from public.match_analysis_players p
  join public.matches m on m.id = p.match_id
  where p.id = target_player;

  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can revoke the public player analysis link';
  end if;

  delete from public.match_player_analysis_shares
  where player_id = target_player;
end;
$$;

create or replace function public.get_public_player_analysis(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'player', jsonb_build_object(
      'display_name', p.display_name,
      'shirt_number', p.shirt_number,
      'role_key', p.role_key
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'video_second', e.video_second,
          'youtube_url', e.youtube_url,
          'category_key', e.category_key,
          'detail_key', e.detail_key
        )
        order by e.video_second asc, e.created_at asc, e.id asc
      )
      from public.match_player_analysis_events e
      where e.player_id = p.id
        and e.match_id = p.match_id
    ), '[]'::jsonb)
  )
  from public.match_player_analysis_shares s
  join public.match_analysis_players p on p.id = s.player_id
  where s.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.create_player_analysis_share(uuid) from public;
revoke all on function public.get_player_analysis_share_token(uuid) from public;
revoke all on function public.revoke_player_analysis_share(uuid) from public;
revoke all on function public.get_public_player_analysis(uuid) from public;

grant execute on function public.create_player_analysis_share(uuid) to authenticated;
grant execute on function public.get_player_analysis_share_token(uuid) to authenticated;
grant execute on function public.revoke_player_analysis_share(uuid) to authenticated;
grant execute on function public.get_public_player_analysis(uuid) to anon, authenticated;
