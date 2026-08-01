alter table public.purchases
  add column if not exists "modifiedAt" text;

alter table public.purchases
  add column if not exists "modificationCount" integer not null default 0;

create or replace function public.mark_self_service_purchase_modified()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old."sellerId" is null
    and new."sellerId" is null
    and old.status = 'pending'
    and new.status = 'pending'
    and new.items is distinct from old.items
    and new."reservationExpiresAt" is distinct from old."reservationExpiresAt" then
    new."modifiedAt" := now()::text;
    new."modificationCount" := coalesce(old."modificationCount", 0) + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists mark_self_service_purchase_modified
  on public.purchases;

create trigger mark_self_service_purchase_modified
before update of items, "reservationExpiresAt" on public.purchases
for each row
execute function public.mark_self_service_purchase_modified();

drop function if exists public.get_self_service_purchases_by_cedula(text);

create function public.get_self_service_purchases_by_cedula(
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
  "reservationExpiresAt" text,
  "modifiedAt" text,
  "modificationCount" integer
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
    purchase."reservationExpiresAt",
    purchase."modifiedAt",
    purchase."modificationCount"
  from public.purchases purchase
  where trim(p_cedula) ~ '^[0-9A-Za-z.-]{4,30}$'
    and purchase.cedula = trim(p_cedula)
    and purchase.id like 'PV%'
    and purchase."sellerId" is null
  order by purchase.date desc
  limit 50;
$$;

revoke all on function public.get_self_service_purchases_by_cedula(text) from public;
grant execute on function public.get_self_service_purchases_by_cedula(text) to anon, authenticated;
