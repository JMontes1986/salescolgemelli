do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.create_self_service_purchase(jsonb,text,text)'::regprocedure
  )
  into function_definition;

  if position('interval ''2 hours''' in function_definition) > 0 then
    execute replace(
      function_definition,
      'interval ''2 hours''',
      'interval ''6 hours'''
    );
  elsif position('interval ''6 hours''' in function_definition) = 0 then
    raise exception 'No se encontró el vencimiento esperado en create_self_service_purchase.';
  end if;

  select pg_get_functiondef(
    'public.update_self_service_pending_purchase(text,jsonb,text,text)'::regprocedure
  )
  into function_definition;

  if position('interval ''2 hours''' in function_definition) > 0 then
    execute replace(
      function_definition,
      'interval ''2 hours''',
      'interval ''6 hours'''
    );
  elsif position('interval ''6 hours''' in function_definition) = 0 then
    raise exception 'No se encontró el vencimiento esperado en update_self_service_pending_purchase.';
  end if;
end;
$$;

update public.purchases
set "reservationExpiresAt" = case
  when nullif(btrim("reservationExpiresAt"), '') is null
    then (now() + interval '6 hours')::text
  else (nullif(btrim("reservationExpiresAt"), '')::timestamptz + interval '4 hours')::text
end
where "sellerId" is null
  and status = 'pending'
  and (
    nullif(btrim("reservationExpiresAt"), '') is null
    or nullif(btrim("reservationExpiresAt"), '')::timestamptz > now()
  );
