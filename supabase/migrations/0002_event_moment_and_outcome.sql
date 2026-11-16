-- SportAnalist event capture v2
-- Event moment is explicit, and an optional free-text result can be stored per event.

do $$
begin
  create type public.event_moment as enum ('attack', 'defense');
exception
  when duplicate_object then null;
end;
$$;

alter table public.match_events
  add column if not exists moment public.event_moment,
  add column if not exists outcome text;

-- Backfill existing events according to the existing opposition/counter flag.
update public.match_events me
set moment = case
  when coalesce(et.is_counter, false) then 'defense'::public.event_moment
  else 'attack'::public.event_moment
end
from public.event_types et
where et.id = me.event_type_id
  and me.moment is null;

update public.match_events
set moment = 'attack'::public.event_moment
where moment is null;

alter table public.match_events
  alter column moment set default 'attack',
  alter column moment set not null;

-- Additional events requested for goalkeeper restarts and goals.
insert into public.event_types (id, project_id, name_pt, name_en, is_counter, active, sort_order)
values
  ('net-release', null, 'Saída de redes', 'Goalkeeper distribution', false, true, 100),
  ('goal-kick', null, 'Saída de baliza', 'Goal kick', false, true, 110),
  ('goal', null, 'Golo', 'Goal', false, true, 120)
on conflict (id) do update
set name_pt = excluded.name_pt,
    name_en = excluded.name_en,
    is_counter = excluded.is_counter,
    active = true,
    sort_order = excluded.sort_order;
