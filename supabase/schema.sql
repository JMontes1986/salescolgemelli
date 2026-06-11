create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  role text not null,
  permissions text[] not null default '{}',
  "avatarUrl" text not null default '',
  "passwordHash" text
);

alter table public.users drop constraint if exists users_id_fkey;
alter table public.users alter column id set default gen_random_uuid();
alter table public.users add column if not exists "passwordHash" text;

alter table public.users enable row level security;

grant select on public.users to anon, authenticated;
grant insert, update, delete on public.users to authenticated;

drop policy if exists "public_users_select" on public.users;
drop policy if exists "dashboard_users_insert" on public.users;
drop policy if exists "dashboard_users_update" on public.users;
drop policy if exists "dashboard_users_delete" on public.users;

create policy "public_users_select"
  on public.users
  for select
  to anon, authenticated
  using (true);

create policy "dashboard_users_insert"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "dashboard_users_update"
  on public.users
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "dashboard_users_delete"
  on public.users
  for delete
  to authenticated
  using (auth.uid() is not null);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  price numeric not null default 0,
  stock integer not null default 0,
  "imageUrl" text not null default '',
  "imageHint" text not null default '',
  category text not null default 'general',
  availability text[] not null default '{}',
  "restockCount" integer not null default 0,
  "preSaleSold" integer not null default 0,
  position integer not null default 0
);

alter table public.products add column if not exists "imageUrl" text not null default '';
alter table public.products add column if not exists "imageHint" text not null default '';
alter table public.products add column if not exists category text not null default 'general';
update public.products set category = 'general' where category is null or btrim(category) = '';
alter table public.products alter column category set default 'general';
alter table public.products alter column category set not null;
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

create or replace function public.create_pos_purchase_with_stock(
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
    where id::text = normalized_item.id
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
    where id::text = normalized_item.id;

    purchase_total := purchase_total + (product_record.price * normalized_item.quantity);
    verified_items := verified_items || jsonb_build_array(jsonb_build_object(
      'id', product_record.id::text,
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

revoke all on function public.create_pos_purchase_with_stock(jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_pos_purchase_with_stock(jsonb, text, text, text, text, text, text) to authenticated;

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
language sql
security definer
set search_path = public
as $$
  select public.create_pos_purchase_with_stock(
    p_items,
    p_cedula,
    p_celular,
    p_seller_id,
    p_seller_name,
    p_date,
    p_status
  );
$$;

revoke all on function public.create_pos_purchase(jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_pos_purchase(jsonb, text, text, text, text, text, text) to authenticated;

create or replace function public.update_purchase_status_with_stock(
  p_purchase_id text,
  p_target_status text
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record public.purchases%rowtype;
  item_record record;
  product_record public.products%rowtype;
begin
  if p_purchase_id is null or trim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if p_target_status not in ('paid', 'pre-sale-confirmed', 'delivered') then
    raise exception 'Estado de compra no permitido.';
  end if;

  select * into purchase_record
  from public.purchases
  where id = trim(p_purchase_id)
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if p_target_status = 'paid' then
    if purchase_record.status <> 'pending' then
      raise exception 'Esta compra ya ha sido confirmada o procesada.';
    end if;

    for item_record in
      select trim(item->>'id') as id, sum((item->>'quantity')::integer) as quantity
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if item_record.id is null or item_record.id !~ '^[0-9A-Za-z_-]{1,80}$' then
        raise exception 'La compra contiene un producto inválido.';
      end if;

      if item_record.quantity is null or item_record.quantity < 1 or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad inválida.';
      end if;

      select * into product_record
      from public.products
      where id::text = item_record.id
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      if product_record.stock < item_record.quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set stock = stock - item_record.quantity
      where id::text = item_record.id;
    end loop;
  elsif p_target_status = 'pre-sale-confirmed' then
    if purchase_record.status <> 'pre-sale' then
      raise exception 'Esta preventa ya ha sido confirmada o procesada.';
    end if;

    for item_record in
      select trim(item->>'id') as id, sum((item->>'quantity')::integer) as quantity
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if item_record.id is null or item_record.id !~ '^[0-9A-Za-z_-]{1,80}$' then
        raise exception 'La compra contiene un producto inválido.';
      end if;

      if item_record.quantity is null or item_record.quantity < 1 or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad inválida.';
      end if;

      select * into product_record
      from public.products
      where id::text = item_record.id
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      if product_record.stock < item_record.quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set
        stock = stock - item_record.quantity,
        "preSaleSold" = greatest("preSaleSold" - item_record.quantity, 0)
      where id::text = item_record.id;
    end loop;
  elsif p_target_status = 'delivered' then
    if purchase_record.status not in ('paid', 'pre-sale-confirmed') then
      raise exception 'Solo se pueden entregar compras pagadas o preventas confirmadas.';
    end if;
  end if;

  update public.purchases
  set status = p_target_status
  where id = purchase_record.id
  returning * into purchase_record;

  return purchase_record;
end;
$$;

revoke all on function public.update_purchase_status_with_stock(text, text) from public;
grant execute on function public.update_purchase_status_with_stock(text, text) to authenticated;

alter table public.products enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "public_products_select" on public.products;
drop policy if exists "dashboard_products_insert" on public.products;
drop policy if exists "dashboard_products_update" on public.products;
drop policy if exists "dashboard_products_delete" on public.products;

create policy "public_products_select"
  on public.products
  for select
  to anon, authenticated
  using (true);

create policy "dashboard_products_insert"
  on public.products
  for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "dashboard_products_update"
  on public.products
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "dashboard_products_delete"
  on public.products
  for delete
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "dashboard_purchases_select" on public.purchases;
drop policy if exists "dashboard_purchases_insert" on public.purchases;
drop policy if exists "dashboard_purchases_update" on public.purchases;
drop policy if exists "self_service_pre_sale_insert" on public.purchases;
drop policy if exists "self_service_purchase_insert" on public.purchases;

create policy "dashboard_purchases_select"
  on public.purchases
  for select
  to authenticated
  using (true);

create policy "dashboard_purchases_insert"
  on public.purchases
  for insert
  to authenticated
  with check (true);

create policy "dashboard_purchases_update"
  on public.purchases
  for update
  to authenticated
  using (true)
  with check (true);

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

drop policy if exists "dashboard_returns_select" on public.returns;
drop policy if exists "dashboard_returns_insert" on public.returns;

create policy "dashboard_returns_select"
  on public.returns
  for select
  to authenticated
  using (true);

create policy "dashboard_returns_insert"
  on public.returns
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "processedByUserId" = auth.uid()::text
    and quantity > 0
  );

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
