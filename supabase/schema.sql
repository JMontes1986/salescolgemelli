create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  role text not null,
  permissions text[] not null default '{}',
  "avatarUrl" text not null default ''
);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  price numeric not null default 0,
  stock integer not null default 0,
  "imageUrl" text not null default '',
  "imageHint" text not null default '',
  availability text[] not null default '{}',
  "restockCount" integer not null default 0,
  "preSaleSold" integer not null default 0,
  position integer not null default 0
);

alter table public.products add column if not exists "imageUrl" text not null default '';
alter table public.products add column if not exists "imageHint" text not null default '';
alter table public.products add column if not exists availability text[] not null default '{}';
alter table public.products add column if not exists "restockCount" integer not null default 0;
alter table public.products add column if not exists "preSaleSold" integer not null default 0;
alter table public.products add column if not exists position integer not null default 0;

create table if not exists public.purchases (
  id text primary key,
  date text not null,
  total numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  cedula text not null default '',
  celular text not null default '',
  "sellerId" text,
  "sellerName" text,
  status text not null
);

create table if not exists public.returns (
  id text primary key default gen_random_uuid()::text,
  "productId" text not null,
  "productName" text not null,
  quantity integer not null default 0,
  "returnedAt" text not null,
  "processedByUserId" text not null,
  "processedByUserName" text not null,
  source text not null
);

create table if not exists public."auditLogs" (
  id text primary key default gen_random_uuid()::text,
  timestamp text not null,
  "userId" text not null,
  "userName" text not null,
  action text not null,
  details text not null
);

create table if not exists public."cashboxSessions" (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null,
  "userName" text not null,
  status text not null,
  "openingBalance" numeric not null default 0,
  "closingBalance" numeric,
  "openedAt" text not null,
  "closedAt" text,
  "totalSales" numeric not null default 0
);

create table if not exists public.counters (
  id text primary key,
  count integer not null default 0
);

create or replace function public.next_counter(counter_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  insert into public.counters (id, count)
  values (counter_id, 1)
  on conflict (id) do update
    set count = public.counters.count + 1
  returning count into next_count;

  return next_count;
end;
$$;

revoke all on function public.next_counter(text) from public;
grant execute on function public.next_counter(text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'dashboard_purchases_select'
  ) then
    create policy "dashboard_purchases_select"
      on public.purchases
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'dashboard_purchases_insert'
  ) then
    create policy "dashboard_purchases_insert"
      on public.purchases
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'dashboard_purchases_update'
  ) then
    create policy "dashboard_purchases_update"
      on public.purchases
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'self_service_pre_sale_insert'
  ) then
    create policy "self_service_pre_sale_insert"
      on public.purchases
      for insert
      to anon, authenticated
      with check (
        id like 'PV%'
        and status = 'pre-sale'
        and coalesce(cedula, '') <> ''
        and coalesce(celular, '') <> ''
        and "sellerId" is null
        and "sellerName" is null
        and total >= 0
        and jsonb_typeof(items) = 'array'
      );
  end if;
end;
$$;
