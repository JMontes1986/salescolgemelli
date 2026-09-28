do $$
declare
  function_definition text;
  function_regprocedure regprocedure;
begin
  function_regprocedure := to_regprocedure(
    'public.create_self_service_purchase(jsonb,text,text)'
  );

  if function_regprocedure is not null then
    select pg_get_functiondef(function_regprocedure)
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
  end if;

  function_regprocedure := to_regprocedure(
    'public.update_self_service_pending_purchase(text,jsonb,text,text)'
  );

  if function_regprocedure is not null then
    select pg_get_functiondef(function_regprocedure)
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
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.purchases') is not null then
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
  end if;
end;
$$;
