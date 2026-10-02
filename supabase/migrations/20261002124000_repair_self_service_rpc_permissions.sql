-- Repair public self-service RPC permissions after a partial/new database bootstrap.
-- Safe to run repeatedly.

do $$
begin
  if to_regprocedure('public.create_self_service_purchase(jsonb,text,text)') is null then
    raise exception 'Falta public.create_self_service_purchase(jsonb,text,text). Ejecute primero BOOTSTRAP_NEW_DATABASE.sql completo.';
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;

revoke all on function public.create_self_service_purchase(jsonb, text, text) from public;
grant execute on function public.create_self_service_purchase(jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
