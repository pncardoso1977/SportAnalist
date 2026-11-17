-- Public, unlisted match sharing through a per-match bearer token.
-- Tokens live in a separate table so project members cannot read them via the matches API.

create table if not exists public.match_public_shares (
  match_id uuid primary key references public.matches(id) on delete cascade,
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.match_public_shares enable row level security;
revoke all on table public.match_public_shares from anon, authenticated;

create or replace function public.create_match_share(target_match uuid)
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

  select project_id into target_project
  from public.matches
  where id = target_match;

  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can create a public share link';
  end if;

  insert into public.match_public_shares (match_id, created_by)
  values (target_match, auth.uid())
  on conflict (match_id) do nothing;

  select share_token into result_token
  from public.match_public_shares
  where match_id = target_match;

  return result_token;
end;
$$;

create or replace function public.get_match_share_token(target_match uuid)
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

  select project_id into target_project
  from public.matches
  where id = target_match;

  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can access the public share link';
  end if;

  select share_token into result_token
  from public.match_public_shares
  where match_id = target_match;

  return result_token;
end;
$$;

create or replace function public.revoke_match_share(target_match uuid)
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

  select project_id into target_project
  from public.matches
  where id = target_match;

  if target_project is null
     or not public.has_project_role(target_project, array['admin','analyst']::public.app_role[]) then
    raise exception 'Only match editors can revoke the public share link';
  end if;

  delete from public.match_public_shares
  where match_id = target_match;
end;
$$;

-- This is the only anonymous read path. It returns a deliberately limited projection
-- for exactly one match whose random token is supplied by the visitor.
create or replace function public.get_public_match_analysis(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'home_team', m.home_team,
      'away_team', m.away_team,
      'analyzed_team', m.analyzed_team,
      'youtube_url', m.youtube_url,
      'created_at', m.created_at
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', me.id,
          'video_second', me.video_second,
          'moment', me.moment,
          'zone', me.zone,
          'outcome', me.outcome,
          'youtube_url', me.youtube_url,
          'created_at', me.created_at,
          'event_name_pt', coalesce(et.name_pt, 'Evento'),
          'event_name_en', coalesce(et.name_en, 'Event')
        )
        order by me.video_second asc, me.created_at asc
      )
      from public.match_events me
      left join public.event_types et on et.id = me.event_type_id
      where me.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.match_public_shares s
  join public.matches m on m.id = s.match_id
  where s.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.create_match_share(uuid) from public;
revoke all on function public.get_match_share_token(uuid) from public;
revoke all on function public.revoke_match_share(uuid) from public;
revoke all on function public.get_public_match_analysis(uuid) from public;

grant execute on function public.create_match_share(uuid) to authenticated;
grant execute on function public.get_match_share_token(uuid) to authenticated;
grant execute on function public.revoke_match_share(uuid) to authenticated;
grant execute on function public.get_public_match_analysis(uuid) to anon, authenticated;
