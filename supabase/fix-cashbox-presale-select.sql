drop policy if exists "dashboard_purchases_select" on public.purchases;

create policy "dashboard_purchases_select"
  on public.purchases
  for select
  to authenticated
  using (
    public.current_user_has_permission('dashboard')
    or public.current_user_has_permission('sales')
    or public.current_user_has_permission('presale')
    or public.current_user_has_permission('redeem')
    or public.current_user_has_permission('cashbox')
    or public.current_user_has_permission('audit')
  );
