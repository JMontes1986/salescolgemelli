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
    raise exception 'La compra tiene un identificador invalido.';
  end if;

  if p_delivery_code is null or trim(p_delivery_code) !~ '^([0-9a-fA-F]{8}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' then
    raise exception 'El codigo adicional del QR es invalido.';
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
      raise exception 'El QR firmado no corresponde a una compra valida.';
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