-- Extend match registration and allow multiple YouTube videos per match.
-- The legacy matches.youtube_url remains as the primary video for backwards compatibility.
-- Events continue to store their own youtube_url, so each event remains linked to its source video.

alter table public.matches
  add column if not exists age_group text;

create table if not exists public.match_videos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  youtube_url text not null check (length(btrim(youtube_url)) > 0),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint match_videos_match_url_key unique (match_id, youtube_url)
);

create index if not exists match_videos_match_order_idx
  on public.match_videos(match_id, sort_order, created_at);

alter table public.match_videos enable row level security;

drop policy if exists "members read match videos" on public.match_videos;
create policy "members read match videos" on public.match_videos
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_videos.match_id
        and public.is_project_member(m.project_id)
    )
  );

drop policy if exists "analysts manage match videos" on public.match_videos;
create policy "analysts manage match videos" on public.match_videos
  for all to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_videos.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_videos.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

revoke all on public.match_videos from anon, authenticated;
grant select, insert, update, delete on public.match_videos to authenticated;

-- Import the existing single-video URL as video 1 for every older match.
insert into public.match_videos(match_id, youtube_url, sort_order, created_by, created_at)
select m.id, btrim(m.youtube_url), 0, m.created_by, m.created_at
from public.matches m
where nullif(btrim(m.youtube_url), '') is not null
on conflict (match_id, youtube_url) do nothing;

-- Public analysis links now expose the complete video list and the new match metadata.
-- The first legacy URL is retained in match.youtube_url for older clients and shared links.
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
      'age_group', m.age_group,
      'competition', m.competition,
      'played_at', m.played_at,
      'venue', m.venue,
      'analyzed_team_is_home', lower(btrim(m.home_team)) = lower(btrim(m.analyzed_team)),
      'created_at', m.created_at
    ),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'youtube_url', v.youtube_url,
        'sort_order', v.sort_order
      ) order by v.sort_order, v.created_at, v.id)
      from public.match_videos v
      where v.match_id = m.id
    ), case
      when nullif(btrim(m.youtube_url), '') is not null
        then jsonb_build_array(jsonb_build_object('id', null, 'youtube_url', m.youtube_url, 'sort_order', 0))
      else '[]'::jsonb
    end),
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

revoke all on function public.get_public_match_analysis(uuid) from public;
grant execute on function public.get_public_match_analysis(uuid) to anon, authenticated;
