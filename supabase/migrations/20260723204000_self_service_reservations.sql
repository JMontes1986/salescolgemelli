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

create index if not exists self_service_reservations_active_product_idx
  on public.self_service_reservations (product_id, expires_at)
  where pending_quantity > 0
    and status in ('pending', 'partially-delivered');

create index if not exists self_service_reservations_purchase_idx
  on public.self_service_reservations (purchase_id);

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
