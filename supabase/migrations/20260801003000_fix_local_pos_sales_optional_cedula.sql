-- Allow the authenticated dashboard server route to execute atomic POS sales.

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
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;

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

drop function if exists public.create_pos_purchase_with_stock_server(jsonb, text, text, text, text, text, text, text);

create function public.create_pos_purchase_with_stock_server(
  p_items jsonb,
  p_cedula text default '',
  p_seller_id text default null,
  p_seller_name text default null,
  p_date text default null,
  p_status text default 'paid',
  p_delivery_code text default null,
  p_qr_base_url text default ''
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_purchase public.purchases%rowtype;
  safe_cedula text := btrim(coalesce(p_cedula, ''));
  safe_delivery_code text := upper(btrim(coalesce(p_delivery_code, '')));
  safe_qr_base_url text := rtrim(btrim(coalesce(p_qr_base_url, '')), '/');
begin
  if safe_cedula <> '' and safe_cedula !~ '^[0-9A-Za-z.-]{4,30}$' then
    raise exception 'La cédula no tiene un formato válido.';
  end if;

  if safe_delivery_code !~ '^[0-9A-Z]{8}$' then
    raise exception 'El código de entrega no tiene un formato válido.';
  end if;

  saved_purchase := public.create_pos_purchase_with_stock(
    p_items,
    safe_cedula,
    '',
    p_seller_id,
    p_seller_name,
    p_date,
    p_status
  );

  update public.purchases
  set
    "deliveryCode" = safe_delivery_code,
    "qrPayload" = safe_qr_base_url
      || '/dashboard/redeem?code=' || saved_purchase.id
      || '&delivery=' || safe_delivery_code
  where id = saved_purchase.id
  returning * into saved_purchase;

  perform public.record_audit_log(
    coalesce(nullif(btrim(p_seller_id), ''), 'system'),
    coalesce(nullif(btrim(p_seller_name), ''), 'Sistema'),
    'TICKET_SELL',
    'Venta POS ' || saved_purchase.id || ' registrada por '
      || saved_purchase.total || '. Cliente: '
      || coalesce(nullif(saved_purchase.cedula, ''), 'N/A') || '.'
  );

  return saved_purchase;
end;
$$;

revoke all on function public.create_pos_purchase_with_stock_server(jsonb, text, text, text, text, text, text, text) from public;
grant execute on function public.create_pos_purchase_with_stock_server(jsonb, text, text, text, text, text, text, text) to service_role;
