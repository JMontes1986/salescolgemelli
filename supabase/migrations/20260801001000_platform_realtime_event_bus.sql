create table if not exists public.app_realtime_events (
  id bigint generated always as identity primary key,
  topic text not null,
  occurred_at timestamptz not null default now()
);

alter table public.app_realtime_events enable row level security;
revoke all on public.app_realtime_events from anon, authenticated;
grant select on public.app_realtime_events to anon, authenticated;

drop policy if exists "public_realtime_events_select" on public.app_realtime_events;
create policy "public_realtime_events_select"
  on public.app_realtime_events
  for select
  to anon, authenticated
  using (true);

create or replace function public.publish_platform_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_event_id bigint;
begin
  insert into public.app_realtime_events (topic)
  values (tg_table_name)
  returning id into saved_event_id;

  if saved_event_id % 100 = 0 then
    delete from public.app_realtime_events
    where occurred_at < now() - interval '1 day';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.publish_platform_realtime_event() from public;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'products',
    'purchases',
    'self_service_reservations',
    'cashboxSessions',
    'returns',
    'auditLogs',
    'users',
    'bingo_registrations',
    'bingo_landing_views',
    'bingo_landing_content'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format(
        'drop trigger if exists platform_realtime_notify on public.%I',
        target_table
      );
      execute format(
        'create trigger platform_realtime_notify after insert or update or delete on public.%I for each statement execute function public.publish_platform_realtime_event()',
        target_table
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_realtime_events'
    ) then
    alter publication supabase_realtime add table public.app_realtime_events;
  end if;
end;
$$;
