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

revoke all on function public.create_dashboard_presale_purchase_server(jsonb, text, text, text, text, text) from public;
grant execute on function public.create_dashboard_presale_purchase_server(jsonb, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
