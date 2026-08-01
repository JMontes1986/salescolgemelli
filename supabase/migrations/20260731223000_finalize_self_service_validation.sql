create or replace function public.finalize_self_service_validation(
  p_purchase_id text,
  p_accepted_quantities jsonb,
  p_user_id text default 'system',
  p_user_name text default 'Sistema'
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record public.purchases%rowtype;
  product_record public.products%rowtype;
  item_record jsonb;
  updated_items jsonb := '[]'::jsonb;
  accepted_text text;
  original_quantity integer;
  delivered_quantity integer;
  pending_quantity integer;
  accepted_quantity integer;
  rejected_quantity integer;
  final_quantity integer;
  delivered_units integer := 0;
  released_units integer := 0;
  other_reserved_quantity integer := 0;
  final_total numeric := 0;
  next_status text;
  starting_status text;
begin
  perform public.require_dashboard_strong_permission('redeem', 'finalizar la validación de autogestión');

  if p_purchase_id is null or btrim(p_purchase_id) !~ '^[0-9A-Za-z_-]{1,80}$' then
    raise exception 'La compra tiene un identificador inválido.';
  end if;

  if jsonb_typeof(coalesce(p_accepted_quantities, '{}'::jsonb)) <> 'object' then
    raise exception 'Las cantidades aprobadas no son válidas.';
  end if;

  select * into purchase_record
  from public.purchases
  where id = btrim(p_purchase_id)
  for update;

  if not found
    or purchase_record."sellerId" is not null
    or purchase_record.status not in ('pending', 'paid', 'partially-delivered') then
    raise exception 'La autogestión no está disponible para finalizar su validación.';
  end if;

  starting_status := purchase_record.status;

  for item_record in
    select item
    from jsonb_array_elements(purchase_record.items) as input(item)
  loop
    if coalesce(item_record->>'id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(item_record->>'quantity', '') !~ '^[0-9]+$'
      or coalesce(item_record->>'price', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'La compra contiene un producto inválido.';
    end if;

    original_quantity := (item_record->>'quantity')::integer;
    delivered_quantity := least(
      greatest(
        case
          when coalesce(item_record->>'deliveredQuantity', '') ~ '^[0-9]+$'
            then (item_record->>'deliveredQuantity')::integer
          else 0
        end,
        0
      ),
      original_quantity
    );
    pending_quantity := greatest(original_quantity - delivered_quantity, 0);
    accepted_text := p_accepted_quantities ->> (item_record->>'id');

    if accepted_text is null or accepted_text = '' then
      accepted_quantity := 0;
    elsif accepted_text ~ '^[0-9]+$' then
      accepted_quantity := accepted_text::integer;
    else
      raise exception 'La cantidad aprobada para % no es válida.', item_record->>'name';
    end if;

    if accepted_quantity > pending_quantity then
      raise exception 'La cantidad aprobada para % supera las unidades pendientes.', item_record->>'name';
    end if;

    rejected_quantity := pending_quantity - accepted_quantity;
    final_quantity := delivered_quantity + accepted_quantity;

    select * into product_record
    from public.products
    where id = (item_record->>'id')::uuid
    for update;

    if not found then
      raise exception 'Producto con ID % no encontrado.', item_record->>'id';
    end if;

    if purchase_record.status = 'pending' and accepted_quantity > 0 then
      select coalesce(sum(reservation.pending_quantity), 0)::integer
      into other_reserved_quantity
      from public.self_service_reservations reservation
      where reservation.purchase_id <> purchase_record.id
        and reservation.product_id = product_record.id
        and reservation.pending_quantity > 0
        and (
          reservation.status = 'partially-delivered'
          or (reservation.status = 'pending' and reservation.expires_at > now())
        );

      if product_record.stock - other_reserved_quantity < accepted_quantity then
        raise exception 'Stock insuficiente para %.', product_record.name;
      end if;

      update public.products
      set stock = stock - accepted_quantity
      where id = product_record.id;
    elsif purchase_record.status in ('paid', 'partially-delivered') and rejected_quantity > 0 then
      update public.products
      set stock = stock + rejected_quantity
      where id = product_record.id;
    end if;

    delivered_units := delivered_units + accepted_quantity;
    released_units := released_units + rejected_quantity;

    if final_quantity > 0 then
      updated_items := updated_items || jsonb_build_array(
        item_record || jsonb_build_object(
          'quantity', final_quantity,
          'returned', coalesce((item_record->>'returned')::boolean, false),
          'deliveredQuantity', final_quantity
        )
      );
      final_total := final_total + ((item_record->>'price')::numeric * final_quantity);
    end if;
  end loop;

  next_status := case
    when jsonb_array_length(updated_items) = 0 then 'cancelled'
    else 'delivered'
  end;

  update public.purchases
  set
    items = updated_items,
    total = final_total,
    status = next_status,
    "deliveryCode" = case
      when next_status = 'delivered' then coalesce(
        "deliveryCode",
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
      )
      else "deliveryCode"
    end,
    "reservationExpiresAt" = null
  where id = purchase_record.id
  returning * into purchase_record;

  perform public.sync_self_service_reservations(
    purchase_record.id,
    purchase_record.items,
    purchase_record.status,
    purchase_record."reservationExpiresAt"
  );

  if starting_status = 'pending' and purchase_record.status = 'delivered' then
    insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
    values (
      now()::text,
      coalesce(nullif(btrim(p_user_id), ''), 'system'),
      coalesce(nullif(btrim(p_user_name), ''), 'Sistema'),
      'PAYMENT_CONFIRM',
      'Compra de autogestión ' || purchase_record.id || ' confirmada durante la validación. Stock descontado únicamente para las unidades aprobadas.'
    );
  end if;
  if purchase_record.status = 'delivered' then
    insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
    values (
      now()::text,
      coalesce(nullif(btrim(p_user_id), ''), 'system'),
      coalesce(nullif(btrim(p_user_name), ''), 'Sistema'),
      'TICKET_REDEEM',
      'Validación de autogestión ' || purchase_record.id || ' finalizada. Entregadas: ' || delivered_units || ' unidad(es). Liberadas al stock: ' || released_units || ' unidad(es). Total final: ' || final_total || '.'
    );
  else
    insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
    values (
      now()::text,
      coalesce(nullif(btrim(p_user_id), ''), 'system'),
      coalesce(nullif(btrim(p_user_name), ''), 'Sistema'),
      'TICKET_VOID',
      'Autogestión ' || purchase_record.id || ' cancelada durante validación. Se liberaron ' || released_units || ' unidad(es) al stock.'
    );
  end if;

  return purchase_record;
end;
$$;

revoke all on function public.finalize_self_service_validation(text, jsonb, text, text) from public;
grant execute on function public.finalize_self_service_validation(text, jsonb, text, text) to authenticated;
