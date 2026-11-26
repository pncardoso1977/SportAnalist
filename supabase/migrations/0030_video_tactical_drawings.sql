-- Saved tactical drawing overlays for each match and YouTube video.
-- Coordinates are normalized so drawings remain aligned when the video resizes.

create table if not exists public.match_video_drawings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  video_id text not null check (length(btrim(video_id)) between 6 and 32),
  shape_kind text not null check (shape_kind in ('arrow', 'player', 'ball')),
  x numeric(7,6) not null check (x between 0 and 1),
  y numeric(7,6) not null check (y between 0 and 1),
  end_x numeric(7,6) not null check (end_x between 0 and 1),
  end_y numeric(7,6) not null check (end_y between 0 and 1),
  color text not null check (color in ('#35d07f', '#38bdf8', '#f97316', '#f43f5e', '#facc15')),
  label text check (label is null or length(btrim(label)) <= 12),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists match_video_drawings_match_video_idx
  on public.match_video_drawings(match_id, video_id, created_at, id);

alter table public.match_video_drawings enable row level security;
revoke all on public.match_video_drawings from anon, authenticated;

drop policy if exists "project members read video drawings" on public.match_video_drawings;
create policy "project members read video drawings" on public.match_video_drawings
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_video_drawings.match_id
        and public.is_project_member(m.project_id)
    )
  );

drop policy if exists "analysts add video drawings" on public.match_video_drawings;
create policy "analysts add video drawings" on public.match_video_drawings
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_video_drawings.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

drop policy if exists "analysts remove video drawings" on public.match_video_drawings;
create policy "analysts remove video drawings" on public.match_video_drawings
  for delete to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_video_drawings.match_id
        and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );

grant select, insert, delete on public.match_video_drawings to authenticated;
