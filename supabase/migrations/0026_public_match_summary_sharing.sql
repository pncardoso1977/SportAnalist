-- Public, read-only playback of a curated match summary.
-- Only the selected event timestamps and source YouTube URLs are exposed anonymously.

create table if not exists public.match_summary_shares (
  match_id uuid primary key references public.matches(id) on delete cascade,
  share_token uuid not null default gen_random_uuid() unique,
  selected_event_ids uuid[] not null default '{}'::uuid[],
  clip_duration_seconds integer not null default 20
    check (clip_duration_seconds in (10, 15, 20, 30)),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.match_summary_shares enable row level security;
revoke all on table public.match_summary_shares from anon, authenticated;

create or replace function public.create_match_summary_share(
  target_match uuid,
  selected_event_ids uuid[],
  clip_duration_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
  final_event_ids uuid[];
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
    raise exception 'Only match editors can create a public summary link';
  end if;

  if clip_duration_seconds not in (10, 15, 20, 30) then
    raise exception 'Invalid summary clip duration';
  end if;

  if exists (
    select 1
    from unnest(coalesce(selected_event_ids, '{}'::uuid[])) as requested(event_id)
    where not exists (
      select 1 from public.match_events me
      where me.id = requested.event_id
        and me.match_id = target_match
    )
  ) then
    raise exception 'One or more selected events do not belong to this match';
  end if;

  -- The database enforces automatic inclusion of all recorded goals,
  -- even if a client sends an incomplete selection.
  select coalesce(
    array_agg(q.id order by q.selection_order, q.video_second, q.created_at, q.id),
    '{}'::uuid[]
  )
  into final_event_ids
  from (
    select
      me.id,
      coalesce(array_position(coalesce(selected_event_ids, '{}'::uuid[]), me.id), 2147483647) as selection_order,
      me.video_second,
      me.created_at
    from public.match_events me
    left join public.event_types et on et.id = me.event_type_id
    where me.match_id = target_match
      and (
        me.id = any(coalesce(selected_event_ids, '{}'::uuid[]))
        or me.event_type_id = 'goal'
        or lower(btrim(coalesce(et.name_pt, ''))) = 'golo'
        or lower(btrim(coalesce(et.name_en, ''))) = 'goal'
      )
  ) q;

  if coalesce(array_length(final_event_ids, 1), 0) = 0 then
    raise exception 'Select at least one play for the summary';
  end if;

  insert into public.match_summary_shares (
    match_id, selected_event_ids, clip_duration_seconds, created_by
  )
  values (
    target_match, final_event_ids, clip_duration_seconds, auth.uid()
  )
  on conflict (match_id) do update
    set share_token = gen_random_uuid(),
        selected_event_ids = excluded.selected_event_ids,
        clip_duration_seconds = excluded.clip_duration_seconds,
        created_by = auth.uid(),
        created_at = now()
  returning share_token into result_token;

  return result_token;
end;
$$;

create or replace function public.get_match_summary_share_token(target_match uuid)
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
    raise exception 'Only match editors can access the public summary link';
  end if;

  select share_token into result_token
  from public.match_summary_shares
  where match_id = target_match;

  return result_token;
end;
$$;

create or replace function public.revoke_match_summary_share(target_match uuid)
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
    raise exception 'Only match editors can revoke the public summary link';
  end if;

  delete from public.match_summary_shares
  where match_id = target_match;
end;
$$;

-- Public playback payload deliberately contains no match details, event names,
-- tactical metadata, player data, event timeline, or analytics.
create or replace function public.get_public_match_summary(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'clip_duration_seconds', s.clip_duration_seconds,
    'clips', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'video_second', me.video_second,
          'youtube_url', me.youtube_url
        )
        order by array_position(s.selected_event_ids, me.id)
      )
      from public.match_events me
      where me.match_id = s.match_id
        and me.id = any(s.selected_event_ids)
    ), '[]'::jsonb)
  )
  from public.match_summary_shares s
  where s.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.create_match_summary_share(uuid, uuid[], integer) from public;
revoke all on function public.get_match_summary_share_token(uuid) from public;
revoke all on function public.revoke_match_summary_share(uuid) from public;
revoke all on function public.get_public_match_summary(uuid) from public;

grant execute on function public.create_match_summary_share(uuid, uuid[], integer) to authenticated;
grant execute on function public.get_match_summary_share_token(uuid) to authenticated;
grant execute on function public.revoke_match_summary_share(uuid) to authenticated;
grant execute on function public.get_public_match_summary(uuid) to anon, authenticated;
