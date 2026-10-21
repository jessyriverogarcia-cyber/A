-- =====================================================================
-- Performance : RLS évaluée une fois par requête (initplan) et index sur les filtres courants.
-- =====================================================================

-- 1. Politiques génériques réécrites : (select …) fait calculer org et droit une seule fois,
--    au lieu d'un appel de fonction par ligne.
do $$
declare r record;
begin
  for r in select * from app.table_modules loop
    execute format('drop policy if exists "org_read" on public.%I', r.table_name);
    execute format('drop policy if exists "org_create" on public.%I', r.table_name);
    execute format('drop policy if exists "org_update" on public.%I', r.table_name);
    execute format('drop policy if exists "org_delete" on public.%I', r.table_name);
    execute format($p$create policy "org_read" on public.%I for select to authenticated
      using (org_id = (select app.current_org_id()) and (select app.has_perm(%L, 'read')))$p$, r.table_name, r.module);
    execute format($p$create policy "org_create" on public.%I for insert to authenticated
      with check (org_id = (select app.current_org_id()) and (select app.has_perm(%L, 'create')))$p$, r.table_name, r.module);
    execute format($p$create policy "org_update" on public.%I for update to authenticated
      using (org_id = (select app.current_org_id()) and (select app.has_perm(%L, 'update')))
      with check (org_id = (select app.current_org_id()))$p$, r.table_name, r.module);
    execute format($p$create policy "org_delete" on public.%I for delete to authenticated
      using (org_id = (select app.current_org_id()) and (select app.has_perm(%L, 'delete')))$p$, r.table_name, r.module);
    -- Toute requête filtre sur l'organisation
    execute format('create index if not exists %I on public.%I (org_id)', r.table_name || '_org_idx', r.table_name);
  end loop;
end $$;

-- Self-service (mêmes règles, évaluées une fois)
drop policy if exists "own_read" on public.badge_events;
create policy "own_read" on public.badge_events for select to authenticated using (employee_id = (select app.current_employee_id()));
drop policy if exists "own_read" on public.leave_requests;
create policy "own_read" on public.leave_requests for select to authenticated using (employee_id = (select app.current_employee_id()));
drop policy if exists "own_read" on public.time_entries;
create policy "own_read" on public.time_entries for select to authenticated using (employee_id = (select app.current_employee_id()));

drop policy if exists "own" on public.notifications;
create policy "own" on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and org_id = (select app.current_org_id()));

drop policy if exists "pilotage_read" on public.audit_log;
create policy "pilotage_read" on public.audit_log for select to authenticated
  using (
    org_id = (select app.current_org_id())
    and (select app.has_perm('pilotage', 'read'))
    and app.has_perm(app.module_of(table_name), 'read')
    and (table_name <> 'employee_salaries' or (select app.has_perm('salaries', 'read')))
  );

-- 2. Clés étrangères et filtres des écrans les plus consultés
create index if not exists work_orders_status_due on public.work_orders (org_id, status, due_date);
create index if not exists work_orders_client on public.work_orders (client_id);
create index if not exists work_order_stages_wo on public.work_order_stages (work_order_id, entered_at);
create index if not exists time_entries_wo on public.time_entries (work_order_id);
create index if not exists time_entries_emp on public.time_entries (employee_id, work_date);
create index if not exists tasks_wo on public.tasks (work_order_id);
create index if not exists tasks_assignee on public.tasks (assignee_employee_id) where status <> 'done';
create index if not exists invoices_status_due on public.invoices (org_id, status, due_date);
create index if not exists invoices_client on public.invoices (client_id);
create index if not exists invoices_wo on public.invoices (work_order_id);
create index if not exists invoice_lines_invoice on public.invoice_lines (invoice_id);
create index if not exists payments_invoice on public.payments (invoice_id);
create index if not exists quotes_client on public.quotes (client_id);
create index if not exists quote_lines_quote on public.quote_lines (quote_id);
create index if not exists deals_client on public.deals (client_id);
create index if not exists contacts_client on public.contacts (client_id);
create index if not exists threads_last on public.threads (org_id, last_message_at desc);
create index if not exists threads_wo on public.threads (work_order_id);
create index if not exists threads_client on public.threads (client_id);
create index if not exists messages_thread on public.messages (thread_id, sent_at);
create index if not exists documents_entity on public.documents (entity_type, entity_id);
create index if not exists stock_movements_item on public.stock_movements (stock_item_id, at desc);
create index if not exists leave_requests_emp on public.leave_requests (employee_id, starts_on);
create index if not exists trainings_expiry on public.trainings (org_id, expires_on);
create index if not exists notifications_user_unread on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists map_objects_site on public.map_objects (site_id);
create index if not exists asset_bookings_asset on public.asset_bookings (asset_id, starts_at);
