-- Permit permanent deletion of a public live fixture only while it is
-- still scheduled. The clock, match and player stint rows are locked in a
-- consistent order to prevent a race with starting the clock.
-- Related rows are removed through the existing ON DELETE CASCADE constraints.

create or replace function public.delete_public_scheduled_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clock_row public.public_live_clocks%rowtype;
  match_status text;
begin
  select *
    into clock_row
  from public.public_live_clocks
  where match_id = p_match_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado';
  end if;

  select live_status
    into match_status
  from public.public_live_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado';
  end if;

  if match_status <> 'scheduled'
     or clock_row.status <> 'scheduled'
     or clock_row.started_at is not null
     or clock_row.elapsed_seconds <> 0
     or exists (
       select 1
       from public.public_live_player_stints s
       where s.match_id = p_match_id
     ) then
    raise exception 'Só é possível remover jogos cujo cronómetro ainda não foi iniciado';
  end if;

  delete from public.public_live_matches
  where id = p_match_id;

  return true;
end;
$$;

revoke all on function public.delete_public_scheduled_match(uuid) from public;
grant execute on function public.delete_public_scheduled_match(uuid) to anon, authenticated;
