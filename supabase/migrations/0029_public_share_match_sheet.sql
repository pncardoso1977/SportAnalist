-- Add a complete, consistent public match sheet to team and player shares.
-- Public projections contain fixture metadata only, never internal project/member data.

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
      'round_label', m.round_label,
      'played_at', m.played_at,
      'kickoff_time', m.kickoff_time,
      'venue', m.venue,
      'live_status', m.live_status,
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

create or replace function public.get_public_player_analysis(p_share_token uuid)
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
      'round_label', m.round_label,
      'played_at', m.played_at,
      'kickoff_time', m.kickoff_time,
      'venue', m.venue,
      'live_status', m.live_status,
      'analyzed_team_is_home', lower(btrim(m.home_team)) = lower(btrim(m.analyzed_team)),
      'created_at', m.created_at
    ),
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
  join public.matches m on m.id = p.match_id
  where s.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.get_public_match_analysis(uuid) from public;
revoke all on function public.get_public_player_analysis(uuid) from public;
grant execute on function public.get_public_match_analysis(uuid) to anon, authenticated;
grant execute on function public.get_public_player_analysis(uuid) to anon, authenticated;
