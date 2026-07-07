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
