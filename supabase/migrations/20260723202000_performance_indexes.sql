create index if not exists purchases_self_service_pending_date_idx
  on public.purchases ("sellerId", status, date desc)
  where "sellerId" is null
    and status in ('pending', 'pre-sale', 'partially-delivered');

create index if not exists purchases_presales_dashboard_idx
  on public.purchases (status, cedula, date desc)
  where id like 'PV%'
    and "sellerId" is not null
    and status in ('pre-sale', 'pre-sale-confirmed');

create index if not exists purchases_cedula_date_idx
  on public.purchases (cedula, date desc);

create index if not exists purchases_celular_date_idx
  on public.purchases (celular, date desc);

create index if not exists purchases_delivery_code_upper_idx
  on public.purchases (upper("deliveryCode"))
  where "deliveryCode" is not null;

create index if not exists purchases_id_upper_idx
  on public.purchases (upper(id));

create index if not exists products_availability_gin_idx
  on public.products using gin (availability);

create index if not exists users_name_idx
  on public.users (name);

create index if not exists users_username_lower_idx
  on public.users (lower(username));

create index if not exists users_name_lower_idx
  on public.users (lower(name));

create index if not exists audit_logs_timestamp_idx
  on public."auditLogs" (timestamp desc);

create index if not exists returns_returned_at_idx
  on public.returns ("returnedAt" desc);

create index if not exists cashbox_sessions_status_opened_at_idx
  on public."cashboxSessions" (status, "openedAt" desc);

create index if not exists cashbox_sessions_user_status_idx
  on public."cashboxSessions" ("userId", status);

create index if not exists bingo_registrations_created_at_idx
  on public.bingo_registrations (created_at desc);

notify pgrst, 'reload schema';
