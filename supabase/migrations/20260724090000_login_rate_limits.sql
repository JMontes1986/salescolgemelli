create table if not exists public.auth_login_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.auth_login_rate_limits enable row level security;
revoke all on public.auth_login_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.auth_login_rate_limits to service_role;

create index if not exists auth_login_rate_limits_reset_at_idx
  on public.auth_login_rate_limits (reset_at);

create or replace function public.consume_login_rate_limit(
  p_key text,
  p_max_attempts integer default 600,
  p_window_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := trim(coalesce(p_key, ''));
  safe_max_attempts integer := greatest(coalesce(p_max_attempts, 600), 1);
  safe_window_seconds integer := greatest(coalesce(p_window_seconds, 300), 1);
  rate_record public.auth_login_rate_limits%rowtype;
  retry_after integer := 0;
begin
  if safe_key !~ '^[0-9a-f]{64}$' then
    raise exception 'La llave de rate limit no tiene un formato valido.';
  end if;

  delete from public.auth_login_rate_limits
  where reset_at < now() - interval '1 hour';

  insert into public.auth_login_rate_limits as attempts (key, count, reset_at)
  values (safe_key, 1, now() + make_interval(secs => safe_window_seconds))
  on conflict (key) do update
    set
      count = case
        when attempts.reset_at <= now() then 1
        else attempts.count + 1
      end,
      reset_at = case
        when attempts.reset_at <= now() then now() + make_interval(secs => safe_window_seconds)
        else attempts.reset_at
      end
  returning * into rate_record;

  if rate_record.count > safe_max_attempts then
    retry_after := greatest(1, ceil(extract(epoch from (rate_record.reset_at - now())))::integer);
  end if;

  return jsonb_build_object(
    'limited', rate_record.count > safe_max_attempts,
    'retryAfter', retry_after
  );
end;
$$;

revoke all on function public.consume_login_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_login_rate_limit(text, integer, integer) to service_role;

create or replace function public.reset_login_rate_limit(
  p_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := trim(coalesce(p_key, ''));
begin
  if safe_key !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  delete from public.auth_login_rate_limits
  where key = safe_key;
end;
$$;

revoke all on function public.reset_login_rate_limit(text) from public;
grant execute on function public.reset_login_rate_limit(text) to service_role;
