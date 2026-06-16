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
