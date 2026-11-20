-- Add a twelfth editable slot to the public live futsal roster.
-- The label is intentionally generic so the operator can rename it per match.

insert into public.public_live_players(full_name, short_name, sort_order, active)
values ('Jogador 12', 'Jogador 12', 120, true)
on conflict (full_name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order,
    active = true;

-- Add the new player to fixtures that already exist.
insert into public.public_live_match_players(match_id, player_id, display_name)
select m.id, p.id, coalesce(nullif(btrim(p.short_name), ''), p.full_name)
from public.public_live_matches m
cross join public.public_live_players p
where p.full_name = 'Jogador 12'
  and p.active
on conflict (match_id, player_id) do nothing;
