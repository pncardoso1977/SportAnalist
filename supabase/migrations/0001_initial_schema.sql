-- SportAnalist initial schema
-- Apply through Supabase SQL Editor or Supabase CLI.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'analyst', 'configurator', 'viewer');
create type public.court_zone as enum ('left', 'center', 'right');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'pt' check (preferred_language in ('pt', 'en')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  analyzed_team text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  analyzed_team text not null,
  youtube_url text not null,
  played_at date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.event_types (
  id text primary key,
  project_id uuid references public.projects(id) on delete cascade,
  name_pt text not null,
  name_en text not null,
  is_counter boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  event_type_id text not null references public.event_types(id),
  video_second integer not null check (video_second >= 0),
  zone public.court_zone not null,
  attacking_team text,
  defending_team text,
  youtube_url text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint counter_team_pair check (
    (attacking_team is null and defending_team is null)
    or (attacking_team is not null and defending_team is not null)
  )
);

create index match_events_match_time_idx on public.match_events(match_id, video_second);
create index match_events_event_type_idx on public.match_events(event_type_id);
create index project_members_user_idx on public.project_members(user_id);

insert into public.event_types (id, name_pt, name_en, is_counter, sort_order) values
  ('kick-in', 'Lateral', 'Kick-in', false, 10),
  ('kick-in-against', 'Lateral Contra', 'Opposition kick-in', true, 20),
  ('corner', 'Canto', 'Corner', false, 30),
  ('corner-against', 'Canto Contra', 'Opposition corner', true, 40),
  ('free-kick', 'Livre', 'Free kick', false, 50),
  ('free-kick-against', 'Livre Contra', 'Opposition free kick', true, 60),
  ('kick-off', 'Saída de bola', 'Kick-off', false, 70),
  ('attack', 'Ataque', 'Attack', false, 80),
  ('attack-against', 'Ataque Contra', 'Opposition attack', true, 90)
on conflict (id) do nothing;

create or replace function public.is_project_member(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = target_project and user_id = auth.uid()
  );
$$;

create or replace function public.has_project_role(target_project uuid, allowed public.app_role[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = target_project and user_id = auth.uid() and role = any(allowed)
  );
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.matches enable row level security;
alter table public.event_types enable row level security;
alter table public.match_events enable row level security;

create policy "profile owner reads own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profile owner updates own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read projects" on public.projects
  for select to authenticated using (public.is_project_member(id));
create policy "authenticated users create projects" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());
create policy "project admins update projects" on public.projects
  for update to authenticated using (public.has_project_role(id, array['admin']::public.app_role[]))
  with check (public.has_project_role(id, array['admin']::public.app_role[]));

create policy "members read project membership" on public.project_members
  for select to authenticated using (public.is_project_member(project_id));
create policy "admins manage project membership" on public.project_members
  for all to authenticated using (public.has_project_role(project_id, array['admin']::public.app_role[]))
  with check (public.has_project_role(project_id, array['admin']::public.app_role[]));

create policy "members read matches" on public.matches
  for select to authenticated using (public.is_project_member(project_id));
create policy "analysts create matches" on public.matches
  for insert to authenticated with check (
    created_by = auth.uid() and public.has_project_role(project_id, array['admin','analyst']::public.app_role[])
  );
create policy "admins and analysts update matches" on public.matches
  for update to authenticated using (public.has_project_role(project_id, array['admin','analyst']::public.app_role[]));

create policy "members read event types" on public.event_types
  for select to authenticated using (
    project_id is null or public.is_project_member(project_id)
  );
create policy "configurators manage project event types" on public.event_types
  for all to authenticated using (
    project_id is not null and public.has_project_role(project_id, array['admin','configurator']::public.app_role[])
  ) with check (
    project_id is not null and public.has_project_role(project_id, array['admin','configurator']::public.app_role[])
  );

create policy "members read match events" on public.match_events
  for select to authenticated using (
    match_id is not null and exists (
      select 1 from public.matches m where m.id = match_id and public.is_project_member(m.project_id)
    )
  );
create policy "analysts create match events" on public.match_events
  for insert to authenticated with check (
    created_by = auth.uid() and match_id is not null and exists (
      select 1 from public.matches m where m.id = match_id
      and public.has_project_role(m.project_id, array['admin','analyst']::public.app_role[])
    )
  );
create policy "authors or admins delete match events" on public.match_events
  for delete to authenticated using (
    created_by = auth.uid() or (match_id is not null and exists (
      select 1 from public.matches m where m.id = match_id
      and public.has_project_role(m.project_id, array['admin']::public.app_role[])
    ))
  );

-- Automatically create a profile for every new Supabase Auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bootstrap a project and its first administrator in one transaction.
create or replace function public.create_analysis_project(project_name text, team_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_project_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.projects(name, analyzed_team, owner_id)
  values (project_name, team_name, auth.uid()) returning id into new_project_id;
  insert into public.project_members(project_id, user_id, role)
  values (new_project_id, auth.uid(), 'admin');
  return new_project_id;
end;
$$;

grant execute on function public.create_analysis_project(text, text) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.has_project_role(uuid, public.app_role[]) to authenticated;

-- Realtime publication for collaborative event registration.
alter publication supabase_realtime add table public.match_events;
