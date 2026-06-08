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

create or replace function public.create_pos_purchase(
  p_items jsonb,
  p_cedula text default 'N/A',
  p_celular text default 'N/A',
  p_seller_id text default null,
  p_seller_name text default null,
  p_date text default null,
  p_status text default 'paid'
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_item record;
  product_record public.products%rowtype;
  verified_items jsonb := '[]'::jsonb;
  first_item_name text := '';
  first_item_initial text := 'X';
  generated_id text;
  next_count integer;
  purchase_total numeric := 0;
  saved_purchase public.purchases%rowtype;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir más de 30 productos diferentes en una compra.';
  end if;

  for normalized_item in
    select
      trim(item->>'id') as id,
      sum((item->>'quantity')::integer) as quantity,
      min(ord) as first_position
    from jsonb_array_elements(p_items) with ordinality as input(item, ord)
    group by trim(item->>'id')
    order by min(ord)
  loop
    if normalized_item.id is null or normalized_item.id !~ '^[0-9A-Za-z_-]{1,80}$' then
      raise exception 'La compra contiene un producto inválido.';
    end if;

    if normalized_item.quantity is null or normalized_item.quantity < 1 or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad inválida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['pos']::text[] then
      raise exception '% no está disponible para este canal de venta.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio inválido.', product_record.name;
    end if;

    if product_record.stock < normalized_item.quantity then
      raise exception 'Stock insuficiente para %.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    update public.products
    set stock = stock - normalized_item.quantity
    where id = normalized_item.id;

    purchase_total := purchase_total + (product_record.price * normalized_item.quantity);
    verified_items := verified_items || jsonb_build_array(jsonb_build_object(
      'id', product_record.id,
      'name', product_record.name,
      'price', product_record.price,
      'quantity', normalized_item.quantity,
      'returned', false
    ));
  end loop;

  first_item_initial := upper(substring(first_item_name from 1 for 1));
  if first_item_initial !~ '^[A-Z]$' then
    first_item_initial := 'X';
  end if;

  insert into public.counters (id, count)
  values ('purchaseCounter', 1)
  on conflict (id) do update
    set count = public.counters.count + 1
  returning count into next_count;

  generated_id := 'CG' || first_item_initial || lpad(next_count::text, 4, '0');

  insert into public.purchases (
    id,
    date,
    total,
    items,
    cedula,
    celular,
    "sellerId",
    "sellerName",
    status
  ) values (
    generated_id,
    coalesce(p_date, now()::text),
    purchase_total,
    verified_items,
    coalesce(p_cedula, 'N/A'),
    coalesce(p_celular, 'N/A'),
    p_seller_id,
    p_seller_name,
    case when p_status = 'delivered' then 'delivered' else 'paid' end
  ) returning * into saved_purchase;

  return saved_purchase;
end;
$$;

revoke all on function public.create_pos_purchase(jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_pos_purchase(jsonb, text, text, text, text, text, text) to authenticated;

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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'purchases'
      and policyname = 'self_service_purchase_insert'
  ) then
    create policy "self_service_purchase_insert"
      on public.purchases
      for insert
      to anon, authenticated
      with check (
        id like 'PV%'
        and status = 'pending'
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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'returns'
      and policyname = 'dashboard_returns_select'
  ) then
    create policy "dashboard_returns_select"
      on public.returns
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'returns'
      and policyname = 'dashboard_returns_insert'
  ) then
    create policy "dashboard_returns_insert"
      on public.returns
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and "processedByUserId" = auth.uid()::text
        and quantity > 0
      );
  end if;
end;
$$;

alter table public.products replica identity full;
alter table public.purchases replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'purchases'
    ) then
      alter publication supabase_realtime add table public.purchases;
    end if;
  end if;
end;
$$;
