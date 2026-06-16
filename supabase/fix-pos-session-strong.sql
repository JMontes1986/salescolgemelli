create or replace function public.current_session_has_mfa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.current_session_has_mfa() from public;
grant execute on function public.current_session_has_mfa() to authenticated;

create or replace function public.current_session_is_dashboard_strong()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_session_is_recent(900);
$$;

revoke all on function public.current_session_is_dashboard_strong() from public;
grant execute on function public.current_session_is_dashboard_strong() to authenticated;

create or replace function public.require_dashboard_strong_permission(
  p_permission text,
  p_action text default 'realizar esta acción'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;

  if not public.current_user_has_permission(p_permission) then
    raise exception 'No tiene permiso para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;

  if not public.current_session_is_recent(900) then
    raise exception 'La sesión superó 15 minutos. Vuelva a iniciar sesión para %.', coalesce(nullif(btrim(p_action), ''), 'realizar esta acción');
  end if;
end;
$$;

revoke all on function public.require_dashboard_strong_permission(text, text) from public;
grant execute on function public.require_dashboard_strong_permission(text, text) to authenticated;
