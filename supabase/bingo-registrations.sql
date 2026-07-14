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
