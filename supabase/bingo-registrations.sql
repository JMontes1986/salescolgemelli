create extension if not exists "pgcrypto";

create table if not exists public.bingo_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  document_number text not null default '',
  phone text not null,
  email text not null default '',
  grade_course text not null,
  student_name text not null,
  attendees integer not null default 1 check (attendees between 1 and 30),
  tables integer not null default 1 check (tables between 1 and 99),
  notes text not null default '',
  source text not null default 'bingo_landing'
);

alter table public.bingo_registrations add column if not exists created_at timestamptz not null default now();
alter table public.bingo_registrations add column if not exists full_name text not null default '';
alter table public.bingo_registrations add column if not exists document_number text not null default '';
alter table public.bingo_registrations add column if not exists phone text not null default '';
alter table public.bingo_registrations add column if not exists email text not null default '';
alter table public.bingo_registrations add column if not exists grade_course text not null default '';
alter table public.bingo_registrations add column if not exists student_name text not null default '';
alter table public.bingo_registrations add column if not exists attendees integer not null default 1;
alter table public.bingo_registrations add column if not exists tables integer not null default 1;
alter table public.bingo_registrations add column if not exists notes text not null default '';
alter table public.bingo_registrations add column if not exists source text not null default 'bingo_landing';

alter table public.bingo_registrations enable row level security;

grant select on public.bingo_registrations to authenticated;
grant select, insert, update on public.bingo_registrations to service_role;

drop policy if exists "dashboard_bingo_registrations_select" on public.bingo_registrations;

create policy "dashboard_bingo_registrations_select"
  on public.bingo_registrations
  for select
  to authenticated
  using (
    public.current_user_has_permission('dashboard')
    or public.current_user_has_permission('presale')
    or public.current_user_has_permission('audit')
  );

notify pgrst, 'reload schema';

-- Editable content for the public Bingo landing page.
create table if not exists public.bingo_landing_content (
  id text primary key default 'default',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bingo_landing_content enable row level security;

drop policy if exists "service_role_bingo_landing_content_all" on public.bingo_landing_content;

create policy "service_role_bingo_landing_content_all"
  on public.bingo_landing_content
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.bingo_landing_content to service_role;

notify pgrst, 'reload schema';

-- Visit counter for the public Bingo landing page.
create table if not exists public.bingo_landing_views (
  id text primary key default 'default',
  total_views integer not null default 0 check (total_views >= 0),
  updated_at timestamptz not null default now()
);

alter table public.bingo_landing_views enable row level security;

drop policy if exists "service_role_bingo_landing_views_all" on public.bingo_landing_views;

create policy "service_role_bingo_landing_views_all"
  on public.bingo_landing_views
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.bingo_landing_views to service_role;

insert into public.bingo_landing_views (id, total_views, updated_at)
values ('default', 0, now())
on conflict (id) do nothing;

create table if not exists public.bingo_landing_view_events (
  id uuid primary key default gen_random_uuid(),
  viewed_at timestamptz not null default now(),
  browser text not null default 'Desconocido',
  device text not null default 'Desconocido',
  user_agent text not null default ''
);

alter table public.bingo_landing_view_events enable row level security;

drop policy if exists "service_role_bingo_landing_view_events_all" on public.bingo_landing_view_events;

create policy "service_role_bingo_landing_view_events_all"
  on public.bingo_landing_view_events
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert on public.bingo_landing_view_events to service_role;

create index if not exists bingo_landing_view_events_viewed_at_idx
  on public.bingo_landing_view_events (viewed_at desc);

notify pgrst, 'reload schema';
