create or replace function public.admin_delete_test_record(
  p_entity text,
  p_record_id text,
  p_user_id text,
  p_user_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record public.purchases%rowtype;
  return_record public.returns%rowtype;
  item_record record;
  deleted_label text;
  inventory_effect text := 'Sin cambio de inventario';
begin
  if p_entity not in ('purchase', 'return', 'cashbox', 'bingo', 'audit') then
    raise exception 'Tipo de registro no permitido.';
  end if;

  if p_record_id is null or btrim(p_record_id) = '' or length(btrim(p_record_id)) > 100 then
    raise exception 'El identificador del registro no es válido.';
  end if;

  if p_entity = 'purchase' then
    select * into purchase_record
    from public.purchases
    where id = btrim(p_record_id)
    for update;

    if not found then
      raise exception 'La compra ya no existe.';
    end if;

    for item_record in
      select
        btrim(item->>'id') as product_id,
        sum(case when (item->>'quantity') ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end)::integer as quantity
      from jsonb_array_elements(purchase_record.items) as input(item)
      group by btrim(item->>'id')
    loop
      if item_record.product_id ~ '^[0-9a-fA-F-]{36}$' and item_record.quantity > 0 then
        if purchase_record.id like 'PV%' and purchase_record."sellerId" is not null then
          update public.products
          set
            stock = greatest(stock - item_record.quantity, 0),
            "preSaleSold" = greatest(coalesce("preSaleSold", 0) - item_record.quantity, 0)
          where id = item_record.product_id::uuid;
          inventory_effect := 'Se revirtió el inventario planificado de la preventa';
        elsif purchase_record.status in ('paid', 'delivered', 'partially-delivered') then
          update public.products
          set stock = stock + item_record.quantity
          where id = item_record.product_id::uuid;
          inventory_effect := 'Se devolvieron al inventario las unidades descontadas';
        end if;
      end if;
    end loop;

    deleted_label := 'Compra ' || purchase_record.id || ' (' || purchase_record.status || ')';
    delete from public.purchases where id = purchase_record.id;

  elsif p_entity = 'return' then
    select * into return_record
    from public.returns
    where id::text = btrim(p_record_id)
    for update;

    if not found then
      raise exception 'La devolución ya no existe.';
    end if;

    update public.products
    set stock = stock - return_record.quantity
    where id::text = return_record."productId"
      and stock >= return_record.quantity;

    if not found then
      raise exception 'No se puede revertir la devolución porque el inventario actual es menor que la cantidad devuelta.';
    end if;

    deleted_label := 'Devolución de ' || return_record."productName" || ' x' || return_record.quantity;
    inventory_effect := 'Se descontaron del inventario las unidades de la devolución anulada';
    delete from public.returns where id = return_record.id;

  elsif p_entity = 'cashbox' then
    delete from public."cashboxSessions" where id::text = btrim(p_record_id);
    if not found then raise exception 'La sesión de caja ya no existe.'; end if;
    deleted_label := 'Sesión de caja ' || btrim(p_record_id);

  elsif p_entity = 'bingo' then
    delete from public.bingo_registrations where id::text = btrim(p_record_id);
    if not found then raise exception 'El registro del Bingo ya no existe.'; end if;
    deleted_label := 'Registro del Bingo ' || btrim(p_record_id);

  else
    delete from public."auditLogs" where id::text = btrim(p_record_id);
    if not found then raise exception 'El evento de auditoría ya no existe.'; end if;
    deleted_label := 'Evento de auditoría ' || btrim(p_record_id);
  end if;

  insert into public."auditLogs" (timestamp, "userId", "userName", action, details)
  values (
    now()::text,
    coalesce(nullif(btrim(p_user_id), ''), 'system'),
    coalesce(nullif(btrim(p_user_name), ''), 'Administrador'),
    'TICKET_VOID',
    'LIMPIEZA DE PRUEBAS: ' || deleted_label || ' eliminado. ' || inventory_effect || '.'
  );

  return jsonb_build_object(
    'id', btrim(p_record_id),
    'entity', p_entity,
    'label', deleted_label,
    'inventoryEffect', inventory_effect
  );
end;
$$;

revoke all on function public.admin_delete_test_record(text, text, text, text) from public;
grant execute on function public.admin_delete_test_record(text, text, text, text) to service_role;
