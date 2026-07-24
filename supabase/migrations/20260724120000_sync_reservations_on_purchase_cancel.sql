create or replace function public.sync_self_service_reservations_from_purchase_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."sellerId" is null then
    perform public.sync_self_service_reservations(
      new.id,
      new.items,
      new.status,
      new."reservationExpiresAt"
    );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_self_service_reservations_from_purchase_trigger() from public;

drop trigger if exists purchases_sync_self_service_reservations on public.purchases;
create trigger purchases_sync_self_service_reservations
after insert or update of items, status, "reservationExpiresAt" on public.purchases
for each row
execute function public.sync_self_service_reservations_from_purchase_trigger();

-- Liberar reservas que quedaron colgadas por cancelaciones hechas antes del trigger.
delete from public.self_service_reservations reservation
using public.purchases purchase
where reservation.purchase_id = purchase.id
  and (
    purchase."sellerId" is not null
    or purchase.status not in ('pending', 'partially-delivered')
    or nullif(purchase."reservationExpiresAt", '') is null
    or nullif(purchase."reservationExpiresAt", '')::timestamptz <= now()
  );