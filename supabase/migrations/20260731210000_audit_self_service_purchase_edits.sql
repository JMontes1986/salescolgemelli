create or replace function public.audit_self_service_purchase_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old."sellerId" is null
    and new."sellerId" is null
    and old.status = 'pending'
    and new.status = 'pending'
    and new.items is distinct from old.items
    and new."reservationExpiresAt" is distinct from old."reservationExpiresAt" then
    insert into public."auditLogs" (
      timestamp,
      "userId",
      "userName",
      action,
      details
    ) values (
      now()::text,
      old.cedula,
      'Cliente (Autogestión)',
      'PURCHASE_EDIT',
      'SELF_SERVICE_EDIT_V1:' || jsonb_build_object(
        'purchaseId', old.id,
        'beforeTotal', old.total,
        'afterTotal', new.total,
        'beforeItems', old.items,
        'afterItems', new.items
      )::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_self_service_purchase_edit
  on public.purchases;

create trigger audit_self_service_purchase_edit
after update of items, "reservationExpiresAt" on public.purchases
for each row
execute function public.audit_self_service_purchase_edit();