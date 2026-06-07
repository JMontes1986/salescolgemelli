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
