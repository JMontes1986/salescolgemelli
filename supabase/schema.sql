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
  id uuid primary key default gen_random_uuid(),
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

create table if not exists public.self_service_reservations (
  purchase_id text not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  pending_quantity integer not null check (pending_quantity >= 0),
  status text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (purchase_id, product_id)
);

alter table public.self_service_reservations enable row level security;
revoke all on public.self_service_reservations from anon, authenticated;
grant select, insert, update, delete on public.self_service_reservations to service_role;

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

create index if not exists bingo_registrations_created_at_idx
  on public.bingo_registrations (created_at desc);

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

create table if not exists public.auth_login_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.auth_login_rate_limits enable row level security;
revoke all on public.auth_login_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.auth_login_rate_limits to service_role;

create index if not exists auth_login_rate_limits_reset_at_idx
  on public.auth_login_rate_limits (reset_at);

create index if not exists purchases_status_seller_id_idx
  on public.purchases (status, "sellerId");

create index if not exists purchases_id_text_pattern_idx
  on public.purchases (id text_pattern_ops);

create index if not exists purchases_cedula_idx
  on public.purchases (cedula);

create index if not exists purchases_self_service_reservation_idx
  on public.purchases (status, "sellerId", "reservationExpiresAt");

create index if not exists purchases_self_service_pending_date_idx
  on public.purchases ("sellerId", status, date desc)
  where "sellerId" is null
    and status in ('pending', 'pre-sale', 'partially-delivered');

create index if not exists purchases_presales_dashboard_idx
  on public.purchases (status, cedula, date desc)
  where id like 'PV%'
    and "sellerId" is not null
    and status in ('pre-sale', 'pre-sale-confirmed');

create index if not exists purchases_cedula_date_idx
  on public.purchases (cedula, date desc);

create index if not exists purchases_celular_date_idx
  on public.purchases (celular, date desc);

create index if not exists purchases_delivery_code_upper_idx
  on public.purchases (upper("deliveryCode"))
  where "deliveryCode" is not null;

create index if not exists purchases_id_upper_idx
  on public.purchases (upper(id));

create index if not exists self_service_reservations_active_product_idx
  on public.self_service_reservations (product_id, expires_at)
  where pending_quantity > 0
    and status in ('pending', 'partially-delivered');

create index if not exists self_service_reservations_purchase_idx
  on public.self_service_reservations (purchase_id);

create index if not exists products_position_idx
  on public.products (position);

create index if not exists products_availability_gin_idx
  on public.products using gin (availability);

create index if not exists users_name_idx
  on public.users (name);

create index if not exists users_username_lower_idx
  on public.users (lower(username));

create index if not exists users_name_lower_idx
  on public.users (lower(name));

create or replace function public.base64url_encode(p_value bytea)
returns text
language sql
immutable
as $$
  select rtrim(translate(replace(replace(encode(p_value, 'base64'), E'\r', ''), E'\n', ''), '+/', '-_'), '=');
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
    raise exception 'No estÃ¡ configurada la firma segura de QR.';
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
    raise exception 'La compra tiene un identificador invÃ¡lido.';
  end if;

  if p_delivery_code is null or trim(p_delivery_code) !~ '^([0-9a-fA-F]{8}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' then
    raise exception 'El cÃ³digo adicional del QR es invÃ¡lido.';
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
    raise exception 'El QR firmado no tiene un formato vÃ¡lido.';
  end if;

  token_parts := string_to_array(trim(p_token), '.');
  if array_length(token_parts, 1) <> 2 then
    raise exception 'El QR firmado no tiene un formato vÃ¡lido.';
  end if;

  encoded_payload := token_parts[1];
  provided_signature := token_parts[2];
  expected_signature := public.sign_delivery_qr_payload(encoded_payload);

  if provided_signature <> expected_signature then
    raise exception 'La firma del QR no es vÃ¡lida.';
  end if;

  payload := convert_from(public.base64url_decode(encoded_payload), 'UTF8')::jsonb;
  expires_at := (payload->>'exp')::bigint;

  if expires_at is null or expires_at < floor(extract(epoch from now()))::bigint then
    raise exception 'El QR de entrega expirÃ³. Digite el cÃ³digo manualmente o regenere el comprobante.';
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
      or lookup_delivery_code !~ '^([0-9a-fA-F]{8}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' then
      raise exception 'El QR firmado no corresponde a una compra vÃ¡lida.';
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
  p_action text default 'realizar esta acciÃ³n'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesiÃ³n autenticada para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acciÃ³n');
  end if;

  if not public.current_user_has_permission(p_permission) then
    raise exception 'No tiene permiso para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acciÃ³n');
  end if;

  if not public.current_session_is_recent(900) then
    raise exception 'La sesiÃ³n superÃ³ 15 minutos. Vuelva a iniciar sesiÃ³n para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acciÃ³n');
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
    p_details := 'Intento de registrar acciÃ³n de auditorÃ­a no permitida: ' || coalesce(nullif(btrim(p_action), ''), '[vacÃ­a]');
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
    left(coalesce(nullif(btrim(p_user_name), ''), 'AnÃ³nimo'), 160),
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
    raise exception 'Ya existe una sesiÃ³n de caja abierta para este usuario.';
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

  if p_session_id is null or trim(p_session_id) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'La sesiÃ³n de caja no es vÃ¡lida.';
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
    raise exception 'La sesiÃ³n no existe o ya ha sido cerrada.';
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

create index if not exists audit_logs_timestamp_idx
  on public."auditLogs" (timestamp desc);

create index if not exists returns_returned_at_idx
  on public.returns ("returnedAt" desc);

create index if not exists cashbox_sessions_status_opened_at_idx
  on public."cashboxSessions" (status, "openedAt" desc);

create index if not exists cashbox_sessions_user_status_idx
  on public."cashboxSessions" ("userId", status);

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

create or replace function public.consume_login_rate_limit(
  p_key text,
  p_max_attempts integer default 600,
  p_window_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := trim(coalesce(p_key, ''));
  safe_max_attempts integer := greatest(coalesce(p_max_attempts, 600), 1);
  safe_window_seconds integer := greatest(coalesce(p_window_seconds, 300), 1);
  rate_record public.auth_login_rate_limits%rowtype;
  retry_after integer := 0;
begin
  if safe_key !~ '^[0-9a-f]{64}$' then
    raise exception 'La llave de rate limit no tiene un formato valido.';
  end if;

  delete from public.auth_login_rate_limits
  where reset_at < now() - interval '1 hour';

  insert into public.auth_login_rate_limits as attempts (key, count, reset_at)
  values (safe_key, 1, now() + make_interval(secs => safe_window_seconds))
  on conflict (key) do update
    set
      count = case
        when attempts.reset_at <= now() then 1
        else attempts.count + 1
      end,
      reset_at = case
        when attempts.reset_at <= now() then now() + make_interval(secs => safe_window_seconds)
        else attempts.reset_at
      end
  returning * into rate_record;

  if rate_record.count > safe_max_attempts then
    retry_after := greatest(1, ceil(extract(epoch from (rate_record.reset_at - now())))::integer);
  end if;

  return jsonb_build_object(
    'limited', rate_record.count > safe_max_attempts,
    'retryAfter', retry_after
  );
end;
$$;

revoke all on function public.consume_login_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_login_rate_limit(text, integer, integer) to service_role;

create or replace function public.reset_login_rate_limit(
  p_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := trim(coalesce(p_key, ''));
begin
  if safe_key !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  delete from public.auth_login_rate_limits
  where key = safe_key;
end;
$$;

revoke all on function public.reset_login_rate_limit(text) from public;
grant execute on function public.reset_login_rate_limit(text) to service_role;

create or replace function public.sync_self_service_reservations(
  p_purchase_id text,
  p_items jsonb,
  p_status text,
  p_expires_at text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_purchase_id text := trim(coalesce(p_purchase_id, ''));
  safe_expires_at timestamptz := nullif(p_expires_at, '')::timestamptz;
begin
  if safe_purchase_id = '' then
    return;
  end if;

  delete from public.self_service_reservations
  where purchase_id = safe_purchase_id;

  if p_status not in ('pending', 'partially-delivered') then
    return;
  end if;

  if p_status = 'pending' and (safe_expires_at is null or safe_expires_at <= now()) then
    return;
  end if;

  insert into public.self_service_reservations (
    purchase_id,
    product_id,
    pending_quantity,
    status,
    expires_at,
    updated_at
  )
  select
    safe_purchase_id,
    reservation_items.product_id::uuid,
    reservation_items.pending_quantity,
    p_status,
    safe_expires_at,
    now()
  from (
    select
      trim(item->>'id') as product_id,
      sum(greatest(
        coalesce(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end, 0)
          - coalesce(case when (item->>'deliveredQuantity') ~ '^[0-9]+$' then (item->>'deliveredQuantity')::integer else 0 end, 0),
        0
      ))::integer as pending_quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as input(item)
    group by trim(item->>'id')
  ) reservation_items
  where reservation_items.product_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and reservation_items.pending_quantity > 0
  on conflict (purchase_id, product_id) do update
    set
      pending_quantity = excluded.pending_quantity,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.sync_self_service_reservations(text, jsonb, text, text) from public;
grant execute on function public.sync_self_service_reservations(text, jsonb, text, text) to service_role;
create or replace function public.sync_self_service_reservations_from_purchase_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."sellerId" is null then
    perform public.sync_self_service_reservations(
      new.id,
      new.items,
      new.status,
      new."reservationExpiresAt"
    );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_self_service_reservations_from_purchase_trigger() from public;

drop trigger if exists purchases_sync_self_service_reservations on public.purchases;
create trigger purchases_sync_self_service_reservations
after insert or update of items, status, "reservationExpiresAt" on public.purchases
for each row
execute function public.sync_self_service_reservations_from_purchase_trigger();

do $$
declare
  purchase_record public.purchases%rowtype;
begin
  for purchase_record in
    select *
    from public.purchases
    where "sellerId" is null
      and (
        status = 'partially-delivered'
        or (
          status = 'pending'
          and nullif("reservationExpiresAt", '')::timestamptz > now()
        )
      )
  loop
    perform public.sync_self_service_reservations(
      purchase_record.id,
      purchase_record.items,
      purchase_record.status,
      purchase_record."reservationExpiresAt"
    );
  end loop;
end;
$$;

create or replace function public.get_self_service_reserved_quantities(
  p_exclude_purchase_id text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with reserved_totals as (
    select
      product_id,
      sum(pending_quantity)::integer as reserved_quantity
    from public.self_service_reservations
    where pending_quantity > 0
      and (
        status = 'partially-delivered'
        or (status = 'pending' and expires_at > now())
      )
      and (
        p_exclude_purchase_id is null
        or purchase_id <> trim(p_exclude_purchase_id)
      )
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
    raise exception 'No se pueden incluir mÃ¡s de 30 productos diferentes en una compra.';
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
    if normalized_item.id is null or normalized_item.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La compra contiene un producto invÃ¡lido.';
    end if;

    if normalized_item.quantity is null or normalized_item.quantity < 1 or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad invÃ¡lida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['pos']::text[] then
      raise exception '% no estÃ¡ disponible para este canal de venta.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio invÃ¡lido.', product_record.name;
    end if;

    if product_record.stock < normalized_item.quantity then
      raise exception 'Stock insuficiente para %.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    update public.products
    set stock = stock - normalized_item.quantity
    where id = normalized_item.id::uuid;

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
    raise exception 'La cÃ©dula no tiene un formato vÃ¡lido.';
  end if;

  if safe_celular !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato vÃ¡lido.';
  end if;

  if safe_seller_id = '' or safe_seller_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'El vendedor tiene un identificador invÃ¡lido.';
  end if;

  if safe_seller_name = '' or length(safe_seller_name) > 120 then
    raise exception 'El nombre del vendedor no tiene un formato vÃ¡lido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir mÃ¡s de 30 productos diferentes en una compra.';
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
    if normalized_item.id is null or normalized_item.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La compra contiene un producto invÃ¡lido.';
    end if;

    if normalized_item.quantities_valid is not true
      or normalized_item.quantity is null
      or normalized_item.quantity < 1
      or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad invÃ¡lida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['presale']::text[] then
      raise exception '% no estÃ¡ disponible para preventa.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio invÃ¡lido.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    update public.products
    set
      stock = stock + normalized_item.quantity,
      "preSaleSold" = coalesce("preSaleSold", 0) + normalized_item.quantity
    where id = normalized_item.id::uuid;

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

drop function if exists public.create_dashboard_presale_purchase_server(jsonb, text, text, text, text, text);

create or replace function public.create_dashboard_presale_purchase_server(
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
  if safe_cedula !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cÃ©dula no tiene un formato vÃ¡lido.';
  end if;

  if safe_celular !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato vÃ¡lido.';
  end if;

  if safe_seller_id = '' or safe_seller_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'El vendedor tiene un identificador invÃ¡lido.';
  end if;

  if safe_seller_name = '' or length(safe_seller_name) > 120 then
    raise exception 'El nombre del vendedor no tiene un formato vÃ¡lido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir mÃ¡s de 30 productos diferentes en una compra.';
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
    if normalized_item.id is null or normalized_item.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La compra contiene un producto invÃ¡lido.';
    end if;

    if normalized_item.quantities_valid is not true
      or normalized_item.quantity is null
      or normalized_item.quantity < 1
      or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad invÃ¡lida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['presale']::text[] then
      raise exception '% no estÃ¡ disponible para preventa.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio invÃ¡lido.', product_record.name;
    end if;

    if first_item_name = '' then
      first_item_name := product_record.name;
    end if;

    update public.products
    set
      stock = stock + normalized_item.quantity,
      "preSaleSold" = coalesce("preSaleSold", 0) + normalized_item.quantity
    where id = normalized_item.id::uuid;

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

revoke all on function public.create_dashboard_presale_purchase_server(jsonb, text, text, text, text, text) from public;
grant execute on function public.create_dashboard_presale_purchase_server(jsonb, text, text, text, text, text) to service_role;

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
    raise exception 'La cÃ©dula no tiene un formato vÃ¡lido.';
  end if;

  if safe_celular !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato vÃ¡lido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir mÃ¡s de 30 productos diferentes en una compra.';
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
    if normalized_item.id is null or normalized_item.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La compra contiene un producto invÃ¡lido.';
    end if;

    if normalized_item.quantities_valid is not true
      or normalized_item.quantity is null
      or normalized_item.quantity < 1
      or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad invÃ¡lida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['self-service']::text[] then
      raise exception '% no estÃ¡ disponible para autogestiÃ³n.', product_record.name;
    end if;

    if product_record.price < 0 then
      raise exception '% tiene un precio invÃ¡lido.', product_record.name;
    end if;

    select coalesce(sum(pending_quantity), 0)::integer into reserved_quantity
    from public.self_service_reservations
    where product_id = normalized_item.id::uuid
      and pending_quantity > 0
      and (
        status = 'partially-delivered'
        or (status = 'pending' and expires_at > now())
      );

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

  perform public.sync_self_service_reservations(
    saved_purchase.id,
    saved_purchase.items,
    saved_purchase.status,
    saved_purchase."reservationExpiresAt"
  );

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
    raise exception 'La compra tiene un identificador invÃ¡lido.';
  end if;

  if p_cedula is null or trim(p_cedula) !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cÃ©dula no tiene un formato vÃ¡lido.';
  end if;

  if p_celular is null or trim(p_celular) !~ '^[0-9+()[:space:]-]{7,20}$' then
    raise exception 'El celular no tiene un formato vÃ¡lido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'No se pueden incluir mÃ¡s de 30 productos diferentes en una compra.';
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
    raise exception 'La reserva de esta compra expirÃ³. Genere un nuevo cÃ³digo de pago.';
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
    if normalized_item.id is null or normalized_item.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La compra contiene un producto invÃ¡lido.';
    end if;

    if normalized_item.quantity is null or normalized_item.quantity < 1 or normalized_item.quantity > 99 then
      raise exception 'La compra contiene una cantidad invÃ¡lida.';
    end if;

    select * into product_record
    from public.products
    where id = normalized_item.id::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', normalized_item.id;
    end if;

    if cardinality(coalesce(product_record.availability, '{}'::text[])) > 0
      and not coalesce(product_record.availability, '{}'::text[]) @> array['self-service']::text[] then
      raise exception '% no estÃ¡ disponible para autogestiÃ³n.', product_record.name;
    end if;

    select coalesce(sum(pending_quantity), 0)::integer into reserved_quantity
    from public.self_service_reservations
    where purchase_id <> purchase_record.id
      and product_id = normalized_item.id::uuid
      and pending_quantity > 0
      and (
        status = 'partially-delivered'
        or (status = 'pending' and expires_at > now())
      );

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

  perform public.sync_self_service_reservations(
    purchase_record.id,
    purchase_record.items,
    purchase_record.status,
    purchase_record."reservationExpiresAt"
  );

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
    raise exception 'La compra tiene un identificador invÃ¡lido.';
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
      raise exception 'La reserva de esta compra expirÃ³. Genere un nuevo cÃ³digo de pago.';
    end if;

    for item_record in
      select
        trim(item->>'id') as id,
        sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else null end) as quantity,
        bool_and((item->>'quantity') ~ '^[0-9]+$') as quantities_valid
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by trim(item->>'id')
    loop
      if item_record.id is null or item_record.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'La compra contiene un producto invÃ¡lido.';
      end if;

      if item_record.quantities_valid is not true
        or item_record.quantity is null
        or item_record.quantity < 1
        or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad invÃ¡lida.';
      end if;

      select * into product_record
      from public.products
      where id = item_record.id::uuid
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      select coalesce(sum(pending_quantity), 0)::integer into reserved_quantity
      from public.self_service_reservations
      where purchase_id <> purchase_record.id
        and product_id = item_record.id::uuid
        and pending_quantity > 0
        and (
          status = 'partially-delivered'
          or (status = 'pending' and expires_at > now())
        );

      if product_record.stock - reserved_quantity < item_record.quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set stock = stock - item_record.quantity
      where id = item_record.id::uuid;
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
      if item_record.id is null or item_record.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'La compra contiene un producto invÃ¡lido.';
      end if;

      if item_record.quantities_valid is not true
        or item_record.quantity is null
        or item_record.quantity < 1
        or item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad invÃ¡lida.';
      end if;

      select * into product_record
      from public.products
      where id = item_record.id::uuid
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', item_record.id;
      end if;

      -- La confirmaciÃ³n de una preventa solo cambia el estado de la compra.
      -- El stock planificado y el contador de unidades preventidas ya se aumentaron
      -- al registrar la preventa, y deben conservarse para saber cuÃ¡ntas unidades
      -- llevar/vender el dÃ­a del evento.
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

  perform public.sync_self_service_reservations(
    purchase_record.id,
    purchase_record.items,
    purchase_record.status,
    purchase_record."reservationExpiresAt"
  );

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
    raise exception 'La compra tiene un identificador invÃ¡lido.';
  end if;

  if auth.uid() is null then
    if lookup_token is null then
      raise exception 'Se requiere un QR firmado vigente para registrar entregas desde una sesiÃ³n local.';
    end if;

    token_payload := public.verify_signed_delivery_qr_token(lookup_token);
    if nullif(btrim(coalesce(token_payload->>'orderId', '')), '') <> trim(p_purchase_id) then
      raise exception 'El QR firmado no corresponde a esta compra.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_delivery_quantities, '{}'::jsonb)) <> 'object' then
    raise exception 'Las cantidades de entrega no son vÃ¡lidas.';
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
      if stock_item_record.id is null or stock_item_record.id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'La compra contiene un producto invÃ¡lido.';
      end if;

      if stock_item_record.quantities_valid is not true
        or stock_item_record.quantity is null
        or stock_item_record.quantity < 1
        or stock_item_record.quantity > 99 then
        raise exception 'La compra contiene una cantidad invÃ¡lida.';
      end if;

      select * into product_record
      from public.products
      where id = stock_item_record.id::uuid
      for update;

      if not found then
        raise exception 'Producto con ID % no encontrado.', stock_item_record.id;
      end if;

      select coalesce(sum(pending_quantity), 0)::integer into reserved_quantity
      from public.self_service_reservations
      where purchase_id <> purchase_record.id
        and product_id = stock_item_record.id::uuid
        and pending_quantity > 0
        and (
          status = 'partially-delivered'
          or (status = 'pending' and expires_at > now())
        );

      if product_record.stock - reserved_quantity < stock_item_record.quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set stock = stock - stock_item_record.quantity
      where id = stock_item_record.id::uuid;
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
      'Compra de autogestiÃ³n ' || purchase_record.id || ' confirmada desde entrega. Stock descontado al registrar la entrega.'
    );
  end if;

  for item_record in
    select item
    from jsonb_array_elements(purchase_record.items) as input(item)
  loop
    requested_quantity := coalesce((p_delivery_quantities ->> (item_record->>'id'))::integer, 0);

    if requested_quantity < 0 then
      raise exception 'Cantidad invÃ¡lida para %.', item_record->>'name';
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

  perform public.sync_self_service_reservations(
    purchase_record.id,
    purchase_record.items,
    purchase_record.status,
    purchase_record."reservationExpiresAt"
  );

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
    or public.current_user_has_permission('cashbox')
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
