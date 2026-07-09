create extension if not exists "pgcrypto";

grant usage on schema public to anon, authenticated;

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
update public.users
set permissions = array['redeem']::text[]
where role = 'seller'
  and permissions is distinct from array['redeem']::text[];

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
  status text not null,
  "deliveryCode" text,
  "qrPayload" text,
  "reservationExpiresAt" text
);

alter table public.purchases add column if not exists "deliveryCode" text;
alter table public.purchases add column if not exists "qrPayload" text;
alter table public.purchases add column if not exists "reservationExpiresAt" text;

update public.purchases
set "reservationExpiresAt" = (now() + interval '2 hours')::text
where "sellerId" is null
  and status = 'pending'
  and "reservationExpiresAt" is null;

create table if not exists public."appSecrets" (
  key text primary key,
  value text not null,
  "createdAt" text not null default now()::text
);

alter table public."appSecrets" enable row level security;
revoke all on public."appSecrets" from anon, authenticated;

insert into public."appSecrets" (key, value)
values ('delivery_qr_hmac', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create index if not exists purchases_status_seller_id_idx
  on public.purchases (status, "sellerId");

create index if not exists purchases_id_text_pattern_idx
  on public.purchases (id text_pattern_ops);

create index if not exists purchases_cedula_idx
  on public.purchases (cedula);

create index if not exists purchases_self_service_reservation_idx
  on public.purchases (status, "sellerId", "reservationExpiresAt");

create index if not exists products_position_idx
  on public.products (position);

create or replace function public.base64url_encode(p_value bytea)
returns text
language sql
immutable
as $$
  select rtrim(translate(encode(p_value, 'base64'), '+/', '-_'), '=');
$$;

create or replace function public.base64url_decode(p_value text)
returns bytea
language plpgsql
immutable
as $$
declare
  normalized_value text := translate(coalesce(p_value, ''), '-_', '+/');
  padding_length integer;
begin
  padding_length := (4 - length(normalized_value) % 4) % 4;
  return decode(normalized_value || repeat('=', padding_length), 'base64');
end;
$$;

create or replace function public.get_delivery_qr_secret()
returns bytea
language plpgsql
security definer
set search_path = public
as $$
declare
  secret_value text;
begin
  select value
  into secret_value
  from public."appSecrets"
  where key = 'delivery_qr_hmac';

  if secret_value is null or secret_value !~ '^[0-9a-f]{64}$' then
    raise exception 'No está configurada la firma segura de QR.';
  end if;

  return decode(secret_value, 'hex');
end;
$$;

revoke all on function public.get_delivery_qr_secret() from public;

create or replace function public.sign_delivery_qr_payload(p_encoded_payload text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select public.base64url_encode(
    hmac(convert_to(coalesce(p_encoded_payload, ''), 'UTF8'), public.get_delivery_qr_secret(), 'sha256'::text)
  );
$$;

revoke all on function public.sign_delivery_qr_payload(text) from public;

create or replace function public.build_signed_delivery_qr_payload(
  p_purchase_id text,
  p_delivery_code text,
  p_expires_at timestamptz default now() + interval '10 minutes'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  payload text;
  encoded_payload text;
  signature text;
begin
  if p_purchase_id is null or trim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if p_delivery_code is null or trim(p_delivery_code) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'El código adicional del QR es inválido.';
  end if;

  payload := jsonb_build_object(
    'orderId', trim(p_purchase_id),
    'deliveryCode', trim(p_delivery_code),
    'exp', floor(extract(epoch from p_expires_at))::bigint
  )::text;
  encoded_payload := public.base64url_encode(convert_to(payload, 'UTF8'));
  signature := public.sign_delivery_qr_payload(encoded_payload);

  return '/dashboard/redeem?token=' || encoded_payload || '.' || signature;
end;
$$;

revoke all on function public.build_signed_delivery_qr_payload(text, text, timestamptz) from public;

create or replace function public.verify_signed_delivery_qr_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_parts text[];
  encoded_payload text;
  provided_signature text;
  expected_signature text;
  payload jsonb;
  expires_at bigint;
begin
  if p_token is null or trim(p_token) !~ '^[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{32,}$' then
    raise exception 'El QR firmado no tiene un formato válido.';
  end if;

  token_parts := string_to_array(trim(p_token), '.');
  if array_length(token_parts, 1) <> 2 then
    raise exception 'El QR firmado no tiene un formato válido.';
  end if;

  encoded_payload := token_parts[1];
  provided_signature := token_parts[2];
  expected_signature := public.sign_delivery_qr_payload(encoded_payload);

  if provided_signature <> expected_signature then
    raise exception 'La firma del QR no es válida.';
  end if;

  payload := convert_from(public.base64url_decode(encoded_payload), 'UTF8')::jsonb;
  expires_at := (payload->>'exp')::bigint;

  if expires_at is null or expires_at < floor(extract(epoch from now()))::bigint then
    raise exception 'El QR de entrega expiró. Digite el código manualmente o regenere el comprobante.';
  end if;

  return payload;
end;
$$;

revoke all on function public.verify_signed_delivery_qr_token(text) from public;

drop function if exists public.get_purchase_for_delivery_lookup(text, text);

create or replace function public.get_purchase_for_delivery_lookup(
  p_code text default null,
  p_delivery_code text default null,
  p_token text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  lookup_code text := nullif(btrim(coalesce(p_code, '')), '');
  lookup_delivery_code text := nullif(btrim(coalesce(p_delivery_code, '')), '');
  lookup_token text := nullif(btrim(coalesce(p_token, '')), '');
  token_payload jsonb;
  found_purchase public.purchases;
begin
  if lookup_token is not null then
    token_payload := public.verify_signed_delivery_qr_token(lookup_token);
    lookup_code := nullif(btrim(coalesce(token_payload->>'orderId', '')), '');
    lookup_delivery_code := nullif(btrim(coalesce(token_payload->>'deliveryCode', '')), '');

    if lookup_code is null
      or lookup_code !~ '^[0-9A-Za-z_-]{1,80}$'
      or lookup_delivery_code is null
      or lookup_delivery_code !~ '^[0-9A-Za-z_-]{1,80}$' then
      raise exception 'El QR firmado no corresponde a una compra válida.';
    end if;

    select *
    into found_purchase
    from public.purchases
    where id = lookup_code
      and "deliveryCode" = lookup_delivery_code
    limit 1;
  elsif lookup_code is not null then
    select *
    into found_purchase
    from public.purchases
    where upper(id) = upper(lookup_code)
    limit 1;
  elsif lookup_delivery_code is not null then
    select *
    into found_purchase
    from public.purchases
    where upper("deliveryCode") = upper(lookup_delivery_code)
    limit 1;
  end if;

  return found_purchase;
end;
$$;

revoke all on function public.get_purchase_for_delivery_lookup(text, text, text) from public;
grant execute on function public.get_purchase_for_delivery_lookup(text, text, text) to anon, authenticated;

alter table public.purchases enable row level security;

grant select, insert, update on public.purchases to authenticated;
revoke insert on public.purchases from anon;

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

alter table public.returns enable row level security;
grant select, insert on public.returns to authenticated;

create table if not exists public."auditLogs" (
  id text primary key default gen_random_uuid()::text,
  timestamp text not null,
  "userId" text not null,
  "userName" text not null,
  action text not null,
  details text not null
);

alter table public."auditLogs" enable row level security;

grant select, insert on public."auditLogs" to authenticated;

create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id::text = auth.uid()::text
      and (
        app_user.role = 'admin'
        or coalesce(app_user.permissions, '{}'::text[]) @> array[p_permission]::text[]
      )
  );
$$;

revoke all on function public.current_user_has_permission(text) from public;
grant execute on function public.current_user_has_permission(text) to authenticated;

create or replace function public.current_session_has_mfa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.current_session_has_mfa() from public;
grant execute on function public.current_session_has_mfa() to authenticated;

create or replace function public.current_session_is_recent(
  p_max_age_seconds integer default 900
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  issued_at_text text := coalesce(auth.jwt()->>'iat', '');
  issued_at_epoch bigint;
  now_epoch bigint := floor(extract(epoch from now()))::bigint;
begin
  if auth.uid() is null or issued_at_text !~ '^[0-9]+$' then
    return false;
  end if;

  issued_at_epoch := issued_at_text::bigint;

  return issued_at_epoch >= now_epoch - greatest(coalesce(p_max_age_seconds, 900), 60)
    and issued_at_epoch <= now_epoch + 60;
end;
$$;

revoke all on function public.current_session_is_recent(integer) from public;
grant execute on function public.current_session_is_recent(integer) to authenticated;

create or replace function public.current_session_is_dashboard_strong()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_session_is_recent(900);
$$;

revoke all on function public.current_session_is_dashboard_strong() from public;
grant execute on function public.current_session_is_dashboard_strong() to authenticated;

create or replace function public.require_dashboard_strong_permission(
  p_permission text,
  p_action text default 'realizar esta acción'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;

  if not public.current_user_has_permission(p_permission) then
    raise exception 'No tiene permiso para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;

  if not public.current_session_is_recent(900) then
    raise exception 'La sesión superó 15 minutos. Vuelva a iniciar sesión para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;
end;
$$;

revoke all on function public.require_dashboard_strong_permission(text, text) from public;
grant execute on function public.require_dashboard_strong_permission(text, text) to authenticated;

drop policy if exists "dashboard_audit_logs_select" on public."auditLogs";
drop policy if exists "dashboard_audit_logs_insert" on public."auditLogs";

create policy "dashboard_audit_logs_select"
  on public."auditLogs"
  for select
  to authenticated
  using (public.current_user_has_permission('audit'));

create policy "dashboard_audit_logs_insert"
  on public."auditLogs"
  for insert
  to authenticated
  with check (auth.uid() is not null);

create or replace function public.record_audit_log(
  p_user_id text,
  p_user_name text,
  p_action text,
  p_details text
)
returns public."auditLogs"
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_log public."auditLogs"%rowtype;
  safe_action text := upper(nullif(btrim(coalesce(p_action, '')), ''));
begin
  if safe_action not in (
    'TICKET_ISSUE',
    'TICKET_SELL',
    'TICKET_REDEEM',
    'TICKET_VOID',
    'CASHBOX_OPEN',
    'CASHBOX_CLOSE',
    'USER_ROLE_CHANGE',
    'PAYMENT_CONFIRM',
    'STOCK_RESTOCK',
    'PURCHASE_EDIT',
    'USER_LOGIN',
    'SELF_SERVICE_PURCHASE',
    'SELF_SERVICE_HISTORY',
    'SELF_SERVICE_SECURITY_ALERT',
    'PRODUCT_CREATE',
    'PRODUCT_UPDATE',
    'RETURN_PROCESS',
    'AUDIT_LOG_FAILURE'
  ) then
    p_details := 'Intento de registrar acción de auditoría no permitida: ' || coalesce(nullif(btrim(p_action), ''), '[vacía]');
    safe_action := 'AUDIT_LOG_FAILURE';
  end if;

  insert into public."auditLogs" (
    timestamp,
    "userId",
    "userName",
    action,
    details
  ) values (
    now()::text,
    left(coalesce(nullif(btrim(p_user_id), ''), 'anonymous'), 120),
    left(coalesce(nullif(btrim(p_user_name), ''), 'Anónimo'), 160),
    safe_action,
    left(coalesce(nullif(btrim(p_details), ''), 'Sin detalles.'), 1200)
  )
  returning * into saved_log;

  return saved_log;
end;
$$;

revoke all on function public.record_audit_log(text, text, text, text) from public;
grant execute on function public.record_audit_log(text, text, text, text) to anon, authenticated;

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

alter table public."cashboxSessions" enable row level security;

create or replace function public.open_cashbox_session(
  p_opening_balance numeric,
  p_user_name text
)
returns public."cashboxSessions"
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_session public."cashboxSessions"%rowtype;
begin
  perform public.require_dashboard_strong_permission('cashbox', 'abrir caja');

  if coalesce(p_opening_balance, 0) <= 0 then
    raise exception 'El saldo de apertura debe ser mayor que cero.';
  end if;

  if exists (
    select 1
    from public."cashboxSessions" session
    where session."userId" = auth.uid()::text
      and session.status = 'open'
  ) then
    raise exception 'Ya existe una sesión de caja abierta para este usuario.';
  end if;

  insert into public."cashboxSessions" (
    "userId",
    "userName",
    status,
    "openingBalance",
    "openedAt",
    "totalSales"
  ) values (
    auth.uid()::text,
    left(coalesce(nullif(btrim(p_user_name), ''), 'Usuario'), 160),
    'open',
    p_opening_balance,
    now()::text,
    0
  )
  returning * into saved_session;

  return saved_session;
end;
$$;

revoke all on function public.open_cashbox_session(numeric, text) from public;
grant execute on function public.open_cashbox_session(numeric, text) to authenticated;

create or replace function public.close_cashbox_session(
  p_session_id text,
  p_closing_balance numeric
)
returns public."cashboxSessions"
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_session public."cashboxSessions"%rowtype;
begin
  perform public.require_dashboard_strong_permission('cashbox', 'cerrar caja');

  if p_session_id is null or trim(p_session_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La sesión de caja no es válida.';
  end if;

  if coalesce(p_closing_balance, 0) < 0 then
    raise exception 'El saldo de cierre no puede ser negativo.';
  end if;

  select *
    into saved_session
    from public."cashboxSessions" session
    where session.id = trim(p_session_id)
      and session."userId" = auth.uid()::text
    for update;

  if not found or saved_session.status <> 'open' then
    raise exception 'La sesión no existe o ya ha sido cerrada.';
  end if;

  update public."cashboxSessions"
     set status = 'closed',
         "closingBalance" = p_closing_balance,
         "closedAt" = now()::text
   where id = saved_session.id
   returning * into saved_session;

  return saved_session;
end;
$$;

revoke all on function public.close_cashbox_session(text, numeric) from public;
grant execute on function public.close_cashbox_session(text, numeric) to authenticated;

create table if not exists public.counters (
  id text primary key,
  count integer not null default 0
);

alter table public.counters enable row level security;
revoke all on public.counters from anon, authenticated;

drop policy if exists "counters_no_direct_select" on public.counters;
drop policy if exists "counters_no_direct_insert" on public.counters;
drop policy if exists "counters_no_direct_update" on public.counters;
drop policy if exists "counters_no_direct_delete" on public.counters;

create policy "counters_no_direct_select"
  on public.counters
  for select
  to anon, authenticated
  using (false);

create policy "counters_no_direct_insert"
  on public.counters
  for insert
  to anon, authenticated
  with check (false);

create policy "counters_no_direct_update"
  on public.counters
  for update
  to anon, authenticated
  using (false)
  with check (false);

create policy "counters_no_direct_delete"
  on public.counters
  for delete
  to anon, authenticated
  using (false);

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

create or replace function public.get_self_service_reserved_quantities(
  p_exclude_purchase_id text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with reservation_items as (
    select
      trim(item->>'id') as product_id,
      greatest(
        coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
          - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
        0
      ) as pending_quantity
    from public.purchases purchase
    cross join jsonb_array_elements(purchase.items) as input(item)
    where purchase."sellerId" is null
      and (
        purchase.status = 'partially-delivered'
        or (
          purchase.status = 'pending'
          and nullif(purchase."reservationExpiresAt", '')::timestamptz > now()
        )
      )
      and (
        p_exclude_purchase_id is null
        or purchase.id <> trim(p_exclude_purchase_id)
      )
  ),
  reserved_totals as (
    select product_id, sum(pending_quantity)::integer as reserved_quantity
    from reservation_items
    where product_id ~ '^[0-9A-Za-z_-]{1,80}$'
      and pending_quantity > 0
    group by product_id
  )
  select coalesce(jsonb_object_agg(product_id, reserved_quantity), '{}'::jsonb)
  from reserved_totals;
$$;

revoke all on function public.get_self_service_reserved_quantities(text) from public;
grant execute on function public.get_self_service_reserved_quantities(text) to anon, authenticated;

drop function if exists public.get_self_service_purchases_by_customer(text);
drop function if exists public.get_self_service_purchases_by_customer(text, text);
drop function if exists public.get_self_service_purchases_by_cedula(text);

create or replace function public.get_self_service_purchases_by_cedula(
  p_cedula text
)
returns table (
  id text,
  date text,
  total numeric,
  items jsonb,
  cedula text,
  celular text,
  "sellerId" text,
  "sellerName" text,
  status text,
  "deliveryCode" text,
  "qrPayload" text,
  "reservationExpiresAt" text
)
language sql
security definer
set search_path = public
as $$
  select
    purchase.id,
    purchase.date,
    purchase.total,
    purchase.items,
    purchase.cedula,
    ''::text as celular,
    null::text as "sellerId",
    null::text as "sellerName",
    purchase.status,
    null::text as "deliveryCode",
    null::text as "qrPayload",
    purchase."reservationExpiresAt"
  from public.purchases purchase
  where trim(p_cedula) ~ '^[0-9A-Za-z.-]{4,30}$'
    and purchase.cedula = trim(p_cedula)
  order by purchase.date desc
  limit 50;
$$;

revoke all on function public.get_self_service_purchases_by_cedula(text) from public;
grant execute on function public.get_self_service_purchases_by_cedula(text) to anon, authenticated;

create or replace function public.get_self_service_purchases_by_customer(
  p_cedula text,
  p_celular text
)
returns setof public.purchases
language sql
security definer
set search_path = public
as $$
  select purchase.*
  from public.purchases purchase
  where trim(p_cedula) ~ '^[0-9A-Za-z.-]{4,30}$'
    and trim(p_celular) ~ '^[0-9+()[:space:]-]{7,20}$'
    and purchase.cedula = trim(p_cedula)
    and purchase.celular = trim(p_celular)
  order by purchase.date desc
  limit 50;
$$;

revoke all on function public.get_self_service_purchases_by_customer(text, text) from public;
revoke execute on function public.get_self_service_purchases_by_customer(text, text) from anon, authenticated;

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
  perform public.require_dashboard_strong_permission('sales', 'registrar ventas POS');

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
      'returned', false,
      'deliveredQuantity', 0
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


create or replace function public.create_dashboard_presale_purchase(
  p_items jsonb,
  p_cedula text,
  p_celular text,
  p_seller_id text,
  p_seller_name text,
  p_date text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = public, extensions
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
  delivery_code text;
  saved_purchase public.purchases%rowtype;
  safe_cedula text := btrim(coalesce(p_cedula, ''));
  safe_celular text := btrim(coalesce(p_celular, ''));
  safe_seller_id text := btrim(coalesce(p_seller_id, ''));
  safe_seller_name text := btrim(coalesce(p_seller_name, ''));
begin
  perform public.require_dashboard_strong_permission('presale', 'registrar preventas');

  if safe_cedula !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cédula no tiene un formato válido.';
  end if;

  if safe_celular !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato válido.';
  end if;

  if safe_seller_id = '' or safe_seller_id !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'El vendedor tiene un identificador inválido.';
  end if;

  if safe_seller_name = '' or length(safe_seller_name) > 120 then
    raise exception 'El nombre del vendedor no tiene un formato válido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir más de 30 productos diferentes en una compra.';
  end if;

  for normalized_item in
    select
      trim(item->>'id') as id,
      sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
      bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid,
      min(ord) as first_position
    from jsonb_array_elements(p_items) with ordinality as input(item, ord)
    group by trim(item->>'id')
    order by min(ord)
  loop
    if normalized_item.id is null or normalized_item.id !~ '^[0-9A-Za-z_-]{1,80}$' then
      raise exception 'La compra contiene un producto inválido.';
    end if;

    if normalized_item.quantities_valid is not true
      or normalized_item.quantity is null
      or normalized_item.quantity < 1
      or normalized_item.quantity > 99 then
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
      and not coalesce(product_record.availability, '{}'::text[]) @> array['presale']::text[] then
      raise exception '% no está disponible para preventa.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio inválido.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    update public.products
    set
      stock = stock + normalized_item.quantity,
      "preSaleSold" = coalesce("preSaleSold", 0) + normalized_item.quantity
    where id::text = normalized_item.id;

    purchase_total := purchase_total + (product_record.price * normalized_item.quantity);
    verified_items := verified_items || jsonb_build_array(jsonb_build_object(
      'id', product_record.id::text,
      'name', product_record.name,
      'price', product_record.price,
      'quantity', normalized_item.quantity,
      'returned', false,
      'deliveredQuantity', 0
    ));
  end loop;

  first_item_initial := upper(substring(first_item_name from 1 for 1));
  if first_item_initial !~ '^[A-Z]$' then
    first_item_initial := 'X';
  end if;

  insert into public.counters (id, count)
  values ('preSaleCounter', 1)
  on conflict (id) do update
    set count = public.counters.count + 1
  returning count into next_count;

  generated_id := 'PV' || first_item_initial || lpad(next_count::text, 4, '0');
  delivery_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));

  insert into public.purchases (
    id,
    date,
    total,
    items,
    cedula,
    celular,
    "sellerId",
    "sellerName",
    status,
    "deliveryCode",
    "qrPayload",
    "reservationExpiresAt"
  ) values (
    generated_id,
    coalesce(p_date, now()::text),
    purchase_total,
    verified_items,
    safe_cedula,
    safe_celular,
    safe_seller_id,
    safe_seller_name,
    'pre-sale',
    delivery_code,
    public.build_signed_delivery_qr_payload(generated_id, delivery_code),
    null
  ) returning * into saved_purchase;

  return saved_purchase;
end;
$$;

revoke all on function public.create_dashboard_presale_purchase(jsonb, text, text, text, text, text) from public;
grant execute on function public.create_dashboard_presale_purchase(jsonb, text, text, text, text, text) to authenticated;

create or replace function public.create_self_service_purchase(
  p_items jsonb,
  p_cedula text,
  p_celular text
)
returns public.purchases
language plpgsql
security definer
set search_path = public, extensions
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
  delivery_code text;
  saved_purchase public.purchases%rowtype;
  reserved_quantity integer := 0;
  safe_cedula text := btrim(coalesce(p_cedula, ''));
  safe_celular text := btrim(coalesce(p_celular, ''));
begin
  if safe_cedula !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cédula no tiene un formato válido.';
  end if;

  if safe_celular !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato válido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir más de 30 productos diferentes en una compra.';
  end if;

  for normalized_item in
    select
      trim(item->>'id') as id,
      sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
      bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid,
      min(ord) as first_position
    from jsonb_array_elements(p_items) with ordinality as input(item, ord)
    group by trim(item->>'id')
    order by min(ord)
  loop
    if normalized_item.id is null or normalized_item.id !~ '^[0-9A-Za-z_-]{1,80}$' then
      raise exception 'La compra contiene un producto inválido.';
    end if;

    if normalized_item.quantities_valid is not true
      or normalized_item.quantity is null
      or normalized_item.quantity < 1
      or normalized_item.quantity > 99 then
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
      and not coalesce(product_record.availability, '{}'::text[]) @> array['self-service']::text[] then
      raise exception '% no está disponible para autogestión.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio inválido.', product_record.name;
    end if;

    select coalesce(sum(
      greatest(
        coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
          - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
        0
      )
    ), 0)::integer into reserved_quantity
    from public.purchases reserved_purchase
    cross join jsonb_array_elements(reserved_purchase.items) as input(item)
    where reserved_purchase."sellerId" is null
      and (
        reserved_purchase.status = 'partially-delivered'
        or (
          reserved_purchase.status = 'pending'
          and nullif(reserved_purchase."reservationExpiresAt", '')::timestamptz > now()
        )
      )
      and trim(item->>'id') = normalized_item.id;

    if product_record.stock - reserved_quantity < normalized_item.quantity then
      raise exception 'Stock insuficiente para %.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    purchase_total := purchase_total + (product_record.price * normalized_item.quantity);
    verified_items := verified_items || jsonb_build_array(jsonb_build_object(
      'id', product_record.id::text,
      'name', product_record.name,
      'price', product_record.price,
      'quantity', normalized_item.quantity,
      'returned', false,
      'deliveredQuantity', 0
    ));
  end loop;

  first_item_initial := upper(substring(first_item_name from 1 for 1));
  if first_item_initial !~ '^[A-Z]$' then
    first_item_initial := 'X';
  end if;

  insert into public.counters (id, count)
  values ('preSaleCounter', 1)
  on conflict (id) do update
    set count = public.counters.count + 1
  returning count into next_count;

  generated_id := 'PV' || first_item_initial || lpad(next_count::text, 4, '0');
  delivery_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));

  insert into public.purchases (
    id,
    date,
    total,
    items,
    cedula,
    celular,
    "sellerId",
    "sellerName",
    status,
    "deliveryCode",
    "qrPayload",
    "reservationExpiresAt"
  ) values (
    generated_id,
    now()::text,
    purchase_total,
    verified_items,
    safe_cedula,
    safe_celular,
    null,
    null,
    'pending',
    delivery_code,
    public.build_signed_delivery_qr_payload(generated_id, delivery_code),
    (now() + interval '2 hours')::text
  ) returning * into saved_purchase;

  return saved_purchase;
end;
$$;

revoke all on function public.create_self_service_purchase(jsonb, text, text) from public;
grant execute on function public.create_self_service_purchase(jsonb, text, text) to anon, authenticated;

create or replace function public.update_self_service_pending_purchase(
  p_purchase_id text,
  p_items jsonb,
  p_cedula text,
  p_celular text
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_item record;
  product_record public.products%rowtype;
  purchase_record public.purchases%rowtype;
  verified_items jsonb := '[]'::jsonb;
  purchase_total numeric := 0;
  reserved_quantity integer := 0;
begin
  if p_purchase_id is null or trim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if p_cedula is null or trim(p_cedula) !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cédula no tiene un formato válido.';
  end if;

  if p_celular is null or trim(p_celular) !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato válido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir más de 30 productos diferentes en una compra.';
  end if;

  select * into purchase_record
  from public.purchases
  where id = trim(p_purchase_id)
  for update;

  if not found
    or purchase_record.status <> 'pending'
    or purchase_record."sellerId" is not null
    or purchase_record."sellerName" is not null then
    raise exception 'Compra no encontrada o ya ha sido procesada.';
  end if;

  if purchase_record.cedula <> trim(p_cedula)
    or purchase_record.celular <> trim(p_celular) then
    raise exception 'Los datos del cliente no coinciden con esta compra.';
  end if;

  if coalesce(nullif(purchase_record."reservationExpiresAt", '')::timestamptz, now() - interval '1 second') <= now() then
    raise exception 'La reserva de esta compra expiró. Genere un nuevo código de pago.';
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
      and not coalesce(product_record.availability, '{}'::text[]) @> array['self-service']::text[] then
      raise exception '% no está disponible para autogestión.', product_record.name;
    end if;

    select coalesce(sum(
      greatest(
        coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
          - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
        0
      )
    ), 0)::integer into reserved_quantity
    from public.purchases reserved_purchase
    cross join jsonb_array_elements(reserved_purchase.items) as input(item)
    where reserved_purchase.id <> purchase_record.id
      and reserved_purchase."sellerId" is null
      and (
        reserved_purchase.status = 'partially-delivered'
        or (
          reserved_purchase.status = 'pending'
          and nullif(reserved_purchase."reservationExpiresAt", '')::timestamptz > now()
        )
      )
      and trim(item->>'id') = normalized_item.id;

    if product_record.stock - reserved_quantity < normalized_item.quantity then
      raise exception 'Stock insuficiente para %.', product_record.name;
    end if;

    purchase_total := purchase_total + (product_record.price * normalized_item.quantity);
    verified_items := verified_items || jsonb_build_array(jsonb_build_object(
      'id', product_record.id::text,
      'name', product_record.name,
      'price', product_record.price,
      'quantity', normalized_item.quantity,
      'returned', false,
      'deliveredQuantity', 0
    ));
  end loop;

  update public.purchases
  set
    date = now()::text,
    total = purchase_total,
    items = verified_items,
    "reservationExpiresAt" = (now() + interval '2 hours')::text
  where id = purchase_record.id
  returning * into purchase_record;

  return purchase_record;
end;
$$;

revoke all on function public.update_self_service_pending_purchase(text, jsonb, text, text) from public;
grant execute on function public.update_self_service_pending_purchase(text, jsonb, text, text) to anon, authenticated;

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
  reserved_quantity integer := 0;
begin
  if p_purchase_id is null or trim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if p_target_status not in ('paid', 'pre-sale-confirmed', 'delivered') then
    raise exception 'Estado de compra no permitido.';
  end if;

  if auth.uid() is not null then
    if p_target_status = 'paid' then
      perform public.require_dashboard_strong_permission('sales', 'confirmar pagos');
    end if;

    if p_target_status = 'pre-sale-confirmed' then
      perform public.require_dashboard_strong_permission('presale', 'confirmar preventas');
    end if;

    if p_target_status = 'delivered' then
      perform public.require_dashboard_strong_permission('redeem', 'registrar entregas');
    end if;
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

    if purchase_record."sellerId" is null
      and coalesce(nullif(purchase_record."reservationExpiresAt", '')::timestamptz, now() - interval '1 second') <= now() then
      raise exception 'La reserva de esta compra expiró. Genere un nuevo código de pago.';
    end if;

    for item_record in
      select
        trim(item->>'id') as id,
        sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
        bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if item_record.id is null or item_record.id !~ '^[0-9A-Za-z_-]{1,80}$' then
        raise exception 'La compra contiene un producto inválido.';
      end if;

      if item_record.quantities_valid is not true
        or item_record.quantity is null
        or item_record.quantity < 1
        or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad inválida.';
      end if;

      select * into product_record
      from public.products
      where id::text = item_record.id
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      select coalesce(sum(
        greatest(
          coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
            - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
          0
        )
      ), 0)::integer into reserved_quantity
      from public.purchases reserved_purchase
      cross join jsonb_array_elements(reserved_purchase.items) as input(item)
      where reserved_purchase.id <> purchase_record.id
        and reserved_purchase."sellerId" is null
        and (
          reserved_purchase.status = 'partially-delivered'
          or (
            reserved_purchase.status = 'pending'
            and nullif(reserved_purchase."reservationExpiresAt", '')::timestamptz > now()
          )
        )
        and trim(item->>'id') = item_record.id;

      if product_record.stock - reserved_quantity < item_record.quantity then
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
      select
        trim(item->>'id') as id,
        sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
        bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if item_record.id is null or item_record.id !~ '^[0-9A-Za-z_-]{1,80}$' then
        raise exception 'La compra contiene un producto inválido.';
      end if;

      if item_record.quantities_valid is not true
        or item_record.quantity is null
        or item_record.quantity < 1
        or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad inválida.';
      end if;

      select * into product_record
      from public.products
      where id::text = item_record.id
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      -- La confirmación de una preventa solo cambia el estado de la compra.
      -- El stock planificado y el contador de unidades preventidas ya se aumentaron
      -- al registrar la preventa, y deben conservarse para saber cuántas unidades
      -- llevar/vender el día del evento.
    end loop;
  elsif p_target_status = 'delivered' then
    if purchase_record.status not in ('paid', 'pre-sale-confirmed') then
      raise exception 'Solo se pueden entregar compras pagadas o preventas confirmadas.';
    end if;
  end if;

  update public.purchases
  set
    status = p_target_status,
    "reservationExpiresAt" = case
      when p_target_status in ('paid', 'pre-sale-confirmed', 'delivered') then null
      else "reservationExpiresAt"
    end
  where id = purchase_record.id
  returning * into purchase_record;

  return purchase_record;
end;
$$;

revoke all on function public.update_purchase_status_with_stock(text, text) from public;
grant execute on function public.update_purchase_status_with_stock(text, text) to authenticated;

drop function if exists public.deliver_purchase_items_for_lookup(text, jsonb, text, text);

create or replace function public.deliver_purchase_items_for_lookup(
  p_purchase_id text,
  p_delivery_quantities jsonb,
  p_user_id text default 'system',
  p_user_name text default 'Sistema',
  p_token text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record public.purchases%rowtype;
  stock_item_record record;
  product_record public.products%rowtype;
  updated_items jsonb := '[]'::jsonb;
  item_record jsonb;
  requested_quantity integer;
  delivered_quantity integer;
  pending_quantity integer;
  quantity_to_deliver integer;
  moved_units integer := 0;
  all_delivered boolean := true;
  next_status text;
  reserved_quantity integer := 0;
  generated_delivery_code text;
  lookup_token text := nullif(btrim(coalesce(p_token, '')), '');
  token_payload jsonb;
begin
  if auth.uid() is not null then
    perform public.require_dashboard_strong_permission('redeem', 'registrar entregas');
  end if;

  if p_purchase_id is null or trim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if auth.uid() is null then
    if lookup_token is null then
      raise exception 'Se requiere un QR firmado vigente para registrar entregas desde una sesión local.';
    end if;

    token_payload := public.verify_signed_delivery_qr_token(lookup_token);
    if nullif(btrim(coalesce(token_payload->>'orderId', '')), '') <> trim(p_purchase_id) then
      raise exception 'El QR firmado no corresponde a esta compra.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_delivery_quantities, '{}'::jsonb)) <> 'object' then
    raise exception 'Las cantidades de entrega no son válidas.';
  end if;

  select *
  into purchase_record
  from public.purchases
  where id = trim(p_purchase_id)
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if auth.uid() is null
    and nullif(btrim(coalesce(token_payload->>'deliveryCode', '')), '') <> purchase_record."deliveryCode" then
    raise exception 'El QR firmado no corresponde a esta compra.';
  end if;

  if purchase_record.status not in ('pending', 'paid', 'pre-sale-confirmed', 'partially-delivered', 'delivered') then
    raise exception 'Solo se pueden entregar compras pagadas o preventas confirmadas.';
  end if;

  if purchase_record.status = 'pending' then
    for stock_item_record in
      select
        trim(item->>'id') as id,
        sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
        bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if stock_item_record.id is null or stock_item_record.id !~ '^[0-9A-Za-z_-]{1,80}$' then
        raise exception 'La compra contiene un producto inválido.';
      end if;

      if stock_item_record.quantities_valid is not true
        or stock_item_record.quantity is null
        or stock_item_record.quantity < 1
        or stock_item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad inválida.';
      end if;

      select * into product_record
      from public.products
      where id::text = stock_item_record.id
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', stock_item_record.id;
      end if;

      select coalesce(sum(
        greatest(
          coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
            - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
          0
        )
      ), 0)::integer into reserved_quantity
      from public.purchases reserved_purchase
      cross join jsonb_array_elements(reserved_purchase.items) as input(item)
      where reserved_purchase.id <> purchase_record.id
        and reserved_purchase."sellerId" is null
        and (
          reserved_purchase.status = 'partially-delivered'
          or (
            reserved_purchase.status = 'pending'
            and nullif(reserved_purchase."reservationExpiresAt", '')::timestamptz > now()
          )
        )
        and trim(item->>'id') = stock_item_record.id;

      if product_record.stock - reserved_quantity < stock_item_record.quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set stock = stock - stock_item_record.quantity
      where id::text = stock_item_record.id;
    end loop;

    insert into public."auditLogs" (
      timestamp,
      "userId",
      "userName",
      action,
      details
    ) values (
      now()::text,
      coalesce(nullif(trim(p_user_id), ''), 'system'),
      coalesce(nullif(trim(p_user_name), ''), 'Sistema'),
      'PAYMENT_CONFIRM',
      'Compra de autogestión ' || purchase_record.id || ' confirmada desde entrega. Stock descontado al registrar la entrega.'
    );
  end if;

  for item_record in
    select item
    from jsonb_array_elements(purchase_record.items) as input(item)
  loop
    requested_quantity := coalesce((p_delivery_quantities ->> (item_record->>'id'))::integer, 0);

    if requested_quantity < 0 then
      raise exception 'Cantidad inválida para %.', item_record->>'name';
    end if;

    delivered_quantity := least(greatest(coalesce((item_record->>'deliveredQuantity')::integer, 0), 0), (item_record->>'quantity')::integer);
    pending_quantity := greatest((item_record->>'quantity')::integer - delivered_quantity, 0);
    quantity_to_deliver := least(requested_quantity, pending_quantity);
    moved_units := moved_units + quantity_to_deliver;
    delivered_quantity := delivered_quantity + quantity_to_deliver;

    if delivered_quantity < (item_record->>'quantity')::integer then
      all_delivered := false;
    end if;

    updated_items := updated_items || jsonb_build_array(
      item_record
        || jsonb_build_object(
          'returned', coalesce((item_record->>'returned')::boolean, false),
          'deliveredQuantity', delivered_quantity
        )
    );
  end loop;

  if moved_units <= 0 then
    raise exception 'Seleccione al menos una unidad pendiente para entregar.';
  end if;

  next_status := case when all_delivered then 'delivered' else 'partially-delivered' end;
  generated_delivery_code := coalesce(
    purchase_record."deliveryCode",
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

  update public.purchases
  set
    items = updated_items,
    status = next_status,
    "deliveryCode" = generated_delivery_code,
    "reservationExpiresAt" = null
  where id = purchase_record.id
  returning * into purchase_record;

  insert into public."auditLogs" (
    timestamp,
    "userId",
    "userName",
    action,
    details
  ) values (
    now()::text,
    coalesce(nullif(trim(p_user_id), ''), 'system'),
    coalesce(nullif(trim(p_user_name), ''), 'Sistema'),
    'TICKET_REDEEM',
    'Se entregaron ' || moved_units || ' unidad(es) de la compra ' || purchase_record.id || '. Estado: ' || next_status || '.'
  );

  return purchase_record;
end;
$$;

revoke all on function public.deliver_purchase_items_for_lookup(text, jsonb, text, text, text) from public;
grant execute on function public.deliver_purchase_items_for_lookup(text, jsonb, text, text, text) to anon, authenticated;

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
  with check (
    public.current_user_has_permission('products')
    and public.current_session_is_dashboard_strong()
  );

create policy "dashboard_products_update"
  on public.products
  for update
  to authenticated
  using (
    public.current_session_is_dashboard_strong()
    and (
      public.current_user_has_permission('products')
      or public.current_user_has_permission('sales')
      or public.current_user_has_permission('presale')
      or public.current_user_has_permission('returns')
    )
  )
  with check (
    public.current_session_is_dashboard_strong()
    and (
      public.current_user_has_permission('products')
      or public.current_user_has_permission('sales')
      or public.current_user_has_permission('presale')
      or public.current_user_has_permission('returns')
    )
  );

create policy "dashboard_products_delete"
  on public.products
  for delete
  to authenticated
  using (
    public.current_user_has_permission('products')
    and public.current_session_is_dashboard_strong()
  );

drop policy if exists "dashboard_purchases_select" on public.purchases;
drop policy if exists "dashboard_purchases_insert" on public.purchases;
drop policy if exists "dashboard_purchases_update" on public.purchases;
drop policy if exists "self_service_pre_sale_insert" on public.purchases;
drop policy if exists "self_service_purchase_insert" on public.purchases;

create policy "dashboard_purchases_select"
  on public.purchases
  for select
  to authenticated
  using (
    public.current_user_has_permission('dashboard')
    or public.current_user_has_permission('sales')
    or public.current_user_has_permission('presale')
    or public.current_user_has_permission('redeem')
    or public.current_user_has_permission('audit')
  );

create policy "dashboard_purchases_insert"
  on public.purchases
  for insert
  to authenticated
  with check (
    public.current_session_is_dashboard_strong()
    and (
      public.current_user_has_permission('sales')
      or public.current_user_has_permission('presale')
    )
  );

create policy "dashboard_purchases_update"
  on public.purchases
  for update
  to authenticated
  using (
    public.current_session_is_dashboard_strong()
    and (
      public.current_user_has_permission('sales')
      or public.current_user_has_permission('presale')
      or public.current_user_has_permission('redeem')
    )
  )
  with check (
    public.current_session_is_dashboard_strong()
    and (
      public.current_user_has_permission('sales')
      or public.current_user_has_permission('presale')
      or public.current_user_has_permission('redeem')
    )
  );

drop policy if exists "dashboard_returns_select" on public.returns;
drop policy if exists "dashboard_returns_insert" on public.returns;

create policy "dashboard_returns_select"
  on public.returns
  for select
  to authenticated
  using (
    public.current_user_has_permission('returns')
    or public.current_user_has_permission('audit')
  );

create policy "dashboard_returns_insert"
  on public.returns
  for insert
  to authenticated
  with check (
    public.current_user_has_permission('returns')
    and public.current_session_is_dashboard_strong()
    and "processedByUserId" = auth.uid()::text
    and quantity > 0
  );

drop policy if exists "dashboard_cashbox_sessions_select" on public."cashboxSessions";
drop policy if exists "dashboard_cashbox_sessions_insert" on public."cashboxSessions";
drop policy if exists "dashboard_cashbox_sessions_update" on public."cashboxSessions";

grant select on public."cashboxSessions" to authenticated;
revoke insert, update, delete on public."cashboxSessions" from anon, authenticated;

create policy "dashboard_cashbox_sessions_select"
  on public."cashboxSessions"
  for select
  to authenticated
  using (
    public.current_user_has_permission('cashbox')
    or public.current_user_has_permission('audit')
  );

create policy "dashboard_cashbox_sessions_insert"
  on public."cashboxSessions"
  for insert
  to authenticated
  with check (
    public.current_user_has_permission('cashbox')
    and public.current_session_is_dashboard_strong()
    and "userId" = auth.uid()::text
    and status = 'open'
    and "openingBalance" >= 0
    and "totalSales" >= 0
  );

create policy "dashboard_cashbox_sessions_update"
  on public."cashboxSessions"
  for update
  to authenticated
  using (
    public.current_user_has_permission('cashbox')
    and public.current_session_is_dashboard_strong()
    and "userId" = auth.uid()::text
  )
  with check (
    public.current_user_has_permission('cashbox')
    and public.current_session_is_dashboard_strong()
    and "userId" = auth.uid()::text
    and status in ('open', 'closed')
    and coalesce("closingBalance", 0) >= 0
    and "totalSales" >= 0
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

notify pgrst, 'reload schema';
