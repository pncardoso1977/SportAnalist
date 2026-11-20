-- Allow signed-in users to delete public live fixtures in any clock state.
-- Anonymous visitors retain public match creation and timekeeping, but cannot delete.

-- Older databases may not have migration 0014 (and therefore may not
-- contain the scheduled-only deletion function). Revoke it only when present.
do $
begin
  if to_regprocedure('public.delete_public_scheduled_match(uuid)') is not null then
    execute 'revoke all on function public.delete_public_scheduled_match(uuid) from public, anon, authenticated';
  end if;
end;
$;

create or replace function public.delete_public_live_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sessão para eliminar jogos.'
      using errcode = '42501';
  end if;

  -- Use the same lock order as the clock-control RPCs to avoid racing a
  -- start/pause/finish operation while deleting the fixture.
  perform 1
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado.';
  end if;

  perform 1
  from public.public_live_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado.';
  end if;

  -- Remove the automatic history row when no video has been attached yet.
  -- If a video is already linked, preserve that analysis and its events;
  -- the source FK will be cleared by ON DELETE SET NULL.
  delete from public.matches
  where source_public_live_match_id = p_match_id
    and youtube_url is null;

  delete from public.public_live_matches
  where id = p_match_id;

  return true;
end;
$$;

revoke all on function public.delete_public_live_match(uuid) from public, anon;
grant execute on function public.delete_public_live_match(uuid) to authenticated;
