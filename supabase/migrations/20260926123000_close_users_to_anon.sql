-- Phase 1 authentication hardening.
-- Removes anonymous access to public.users. Legacy cashier/seller credential
-- validation now happens only in the Next.js server using service_role.

alter table public.users enable row level security;

revoke all on public.users from anon;
grant select on public.users to authenticated;

drop policy if exists "public_users_select" on public.users;
drop policy if exists "authenticated_users_select" on public.users;

create policy "authenticated_users_select"
  on public.users
  for select
  to authenticated
  using (auth.uid() is not null);
