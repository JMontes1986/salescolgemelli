-- Self-service no longer uses a national ID. Public callers must use the
-- server API, which owns the service-role call and a signed HttpOnly session.
revoke all on function public.create_self_service_purchase(jsonb, text, text) from anon, authenticated;
revoke all on function public.update_self_service_pending_purchase(text, jsonb, text, text) from anon, authenticated;
drop function if exists public.get_self_service_purchases_by_cedula(text);
drop function if exists public.get_self_service_purchases_by_customer(text);
drop function if exists public.get_self_service_purchases_by_customer(text, text);

create or replace function public.create_self_service_purchase_v2(
  p_items jsonb,
  p_celular text
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.purchases%rowtype;
  safe_phone text := btrim(coalesce(p_celular, ''));
begin
  if safe_phone !~ '^3[0-9]{9}$' then
    raise exception 'El celular no tiene un formato valido.';
  end if;
  -- Reuse the already audited transactional inventory implementation. The
  -- legacy reference exists only inside this transaction and is erased before commit.
  saved := public.create_self_service_purchase(p_items, safe_phone, safe_phone);
  update public.purchases set cedula = '' where id = saved.id returning * into saved;
  insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
  values (now()::text, 'self-service', 'Cliente (Autogestion)', 'SELF_SERVICE_PURCHASE_CREATED',
          'Compra ' || saved.id || ' creada desde sesion protegida.');
  return saved;
end;
$$;
revoke all on function public.create_self_service_purchase_v2(jsonb, text) from public, anon, authenticated;
grant execute on function public.create_self_service_purchase_v2(jsonb, text) to service_role;

create or replace function public.update_self_service_pending_purchase_v2(
  p_purchase_id text,
  p_items jsonb
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.purchases%rowtype;
begin
  select * into saved from public.purchases
  where id = btrim(p_purchase_id) and "sellerId" is null
  for update;
  if not found then raise exception 'Compra no encontrada.'; end if;
  if to_regclass('public.payment_transactions') is not null and exists (
    select 1 from public.payment_transactions
    where purchase_id = saved.id and status in ('reported', 'verified')
  ) then
    raise exception 'La compra no se puede modificar después de reportar un pago.';
  end if;
  -- The server has already proven ownership with the signed purchase session.
  update public.purchases set cedula = saved.celular where id = saved.id;
  saved := public.update_self_service_pending_purchase(saved.id, p_items, saved.celular, saved.celular);
  update public.purchases set cedula = '' where id = saved.id returning * into saved;
  insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
  values (now()::text, 'self-service', 'Cliente (Autogestion)', 'SELF_SERVICE_PURCHASE_UPDATED',
          'Compra ' || saved.id || ' actualizada desde su sesion protegida.');
  return saved;
end;
$$;
revoke all on function public.update_self_service_pending_purchase_v2(text, jsonb) from public, anon, authenticated;
grant execute on function public.update_self_service_pending_purchase_v2(text, jsonb) to service_role;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  purchase_id text not null references public.purchases(id) on delete restrict,
  provider text not null check (provider in ('breb', 'daviplata', 'davivienda', 'cash')),
  method text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'COP' check (currency = 'COP'),
  status text not null check (status in ('created', 'reported', 'verified', 'rejected', 'cancelled')),
  external_reference text,
  provider_transaction_id text,
  authorization_number text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reported_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  notes text
);
alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from anon, authenticated;
grant select, insert, update on public.payment_transactions to service_role;
create index if not exists payment_transactions_purchase_idx on public.payment_transactions(purchase_id, created_at desc);
create index if not exists payment_transactions_reported_idx on public.payment_transactions(reported_at) where status = 'reported';
create unique index if not exists payment_transactions_one_verified_idx on public.payment_transactions(purchase_id, provider) where status = 'verified';

create or replace function public.report_breb_payment(p_purchase_id text, p_hold_minutes integer default 1440)
returns public.payment_transactions
language plpgsql security definer set search_path = public
as $$
declare
  purchase_record public.purchases%rowtype;
  payment_record public.payment_transactions%rowtype;
  hold_minutes integer := greatest(60, least(10080, coalesce(p_hold_minutes, 1440)));
begin
  select * into purchase_record from public.purchases where id = btrim(p_purchase_id) for update;
  if not found or purchase_record."sellerId" is not null then raise exception 'Compra no encontrada.'; end if;
  if purchase_record.status <> 'pending' then raise exception 'La compra ya no esta pendiente de pago.'; end if;
  if coalesce(nullif(purchase_record."reservationExpiresAt", '')::timestamptz, now() - interval '1 second') <= now() then
    raise exception 'La reserva de esta compra expiro.';
  end if;
  select * into payment_record from public.payment_transactions
  where purchase_id = purchase_record.id and provider = 'breb' and status in ('created','reported')
  order by created_at desc limit 1 for update;
  if found then
    update public.payment_transactions
      set amount = purchase_record.total, status = 'reported', reported_at = coalesce(reported_at, now())
      where id = payment_record.id returning * into payment_record;
  else
    insert into public.payment_transactions(purchase_id, provider, method, amount, status, reported_at)
    values(purchase_record.id, 'breb', 'breb_key', purchase_record.total, 'reported', now())
    returning * into payment_record;
  end if;
  update public.purchases set "reservationExpiresAt" = (now() + make_interval(mins => hold_minutes))::text
  where id = purchase_record.id returning * into purchase_record;
  perform public.sync_self_service_reservations(purchase_record.id, purchase_record.items, purchase_record.status, purchase_record."reservationExpiresAt");
  insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
  values(now()::text, 'self-service', 'Cliente (Autogestion)', 'BREB_PAYMENT_REPORTED', 'Pago Bre-B reportado para ' || purchase_record.id || '.');
  return payment_record;
end;
$$;
revoke all on function public.report_breb_payment(text, integer) from public, anon, authenticated;
grant execute on function public.report_breb_payment(text, integer) to service_role;

create or replace function public.verify_breb_payment(p_payment_id uuid, p_user_id text, p_user_name text)
returns public.payment_transactions
language plpgsql security definer set search_path = public
as $$
declare
  payment_record public.payment_transactions%rowtype;
  purchase_record public.purchases%rowtype;
begin
  select * into payment_record from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.'; end if;
  select * into purchase_record from public.purchases where id = payment_record.purchase_id for update;
  if payment_record.status = 'verified' and purchase_record.status in ('paid','delivered','partially-delivered') then return payment_record; end if;
  if payment_record.status <> 'reported' then raise exception 'El pago no esta reportado.'; end if;
  if purchase_record.status <> 'pending' then raise exception 'La compra ya no esta pendiente.'; end if;
  if payment_record.amount <> purchase_record.total then raise exception 'El monto reportado no coincide con la compra.'; end if;
  perform public.update_purchase_status_with_stock(purchase_record.id, 'paid');
  update public.payment_transactions set status='verified', verified_at=now(), verified_by=btrim(p_user_id)
  where id=payment_record.id returning * into payment_record;
  insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
  values(now()::text, btrim(p_user_id), left(btrim(p_user_name),120), 'BREB_PAYMENT_VERIFIED',
         'Pago Bre-B verificado para ' || purchase_record.id || ' por valor ' || payment_record.amount || '.');
  return payment_record;
end;
$$;
revoke all on function public.verify_breb_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_breb_payment(uuid, text, text) to service_role;

create or replace function public.reject_breb_payment(p_payment_id uuid, p_user_id text, p_user_name text)
returns public.payment_transactions
language plpgsql security definer set search_path = public
as $$
declare
  payment_record public.payment_transactions%rowtype;
  purchase_record public.purchases%rowtype;
begin
  select * into payment_record from public.payment_transactions where id=p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.'; end if;
  if payment_record.status = 'rejected' then return payment_record; end if;
  if payment_record.status <> 'reported' then raise exception 'Solo se puede rechazar un pago reportado.'; end if;
  update public.payment_transactions set status='rejected', notes='No se encontro el ingreso durante la verificacion manual.'
  where id=payment_record.id returning * into payment_record;
  select * into purchase_record from public.purchases where id=payment_record.purchase_id for update;
  if purchase_record.status='pending' then
    update public.purchases set "reservationExpiresAt"=(now()+interval '2 hours')::text where id=purchase_record.id returning * into purchase_record;
    perform public.sync_self_service_reservations(purchase_record.id,purchase_record.items,purchase_record.status,purchase_record."reservationExpiresAt");
  end if;
  insert into public."auditLogs" (timestamp,"userId","userName",action,details)
  values(now()::text,btrim(p_user_id),left(btrim(p_user_name),120),'BREB_PAYMENT_REJECTED','No se encontro el pago de '||payment_record.purchase_id||'.');
  return payment_record;
end;
$$;
revoke all on function public.reject_breb_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reject_breb_payment(uuid, text, text) to service_role;

create or replace function public.prevent_purchase_delete_with_payments()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists(select 1 from public.payment_transactions where purchase_id=old.id) then
    raise exception 'No se puede eliminar una compra con trazabilidad de pagos.';
  end if;
  return old;
end;
$$;
drop trigger if exists purchases_preserve_payment_history on public.purchases;
create trigger purchases_preserve_payment_history before delete on public.purchases
for each row execute function public.prevent_purchase_delete_with_payments();
revoke all on function public.prevent_purchase_delete_with_payments() from public, anon, authenticated;

create or replace function public.block_unpaid_purchase_delivery()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'pending' and new.status in ('delivered', 'partially-delivered') then
    raise exception 'La compra debe estar pagada antes de registrar la entrega.';
  end if;
  return new;
end;
$$;
drop trigger if exists purchases_block_unpaid_delivery on public.purchases;
create trigger purchases_block_unpaid_delivery
before update of status on public.purchases
for each row execute function public.block_unpaid_purchase_delivery();
revoke all on function public.block_unpaid_purchase_delivery() from public, anon, authenticated;
