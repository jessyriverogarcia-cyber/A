-- =====================================================================
-- Notes de frais : saisie par chacun, validation par la comptabilité, remboursement par la paie,
-- refacturation au client quand la dépense est rattachée à un dossier.
-- =====================================================================

alter table public.expenses
  add column if not exists km numeric(8,1),
  add column if not exists vat_amount numeric(12,2) not null default 0,
  add column if not exists work_order_id uuid references public.work_orders on delete set null,
  add column if not exists billable boolean not null default false,
  add column if not exists comment text,
  add column if not exists receipt_name text,
  add column if not exists rejection_reason text,
  add column if not exists decided_at timestamptz,
  add column if not exists reimbursed_at timestamptz,
  add column if not exists invoice_id uuid references public.invoices on delete set null,
  add column if not exists created_at timestamptz not null default now();
create index if not exists expenses_emp on public.expenses (employee_id, spent_on desc);
create index if not exists expenses_status on public.expenses (org_id, status);
create index if not exists expenses_wo on public.expenses (work_order_id) where billable;

-- Chacun peut retirer sa note tant qu'elle n'est pas traitée.
drop policy if exists "own_delete" on public.expenses;
create policy "own_delete" on public.expenses for delete to authenticated
  using (employee_id = (select app.current_employee_id()) and status = 'pending');

-- Justificatifs : <org>/expense/<employee>/<fichier>. Le salarié dépose et relit les siens ;
-- la comptabilité (expenses:read) les consulte.
create policy "receipts_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select app.current_org_id())::text
    and (storage.foldername(name))[2] = 'expense' and (storage.foldername(name))[3] = (select app.current_employee_id())::text);
create policy "receipts_read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select app.current_org_id())::text
    and (storage.foldername(name))[2] = 'expense'
    and ((storage.foldername(name))[3] = (select app.current_employee_id())::text or (select app.has_perm('expenses', 'read'))));
create policy "receipts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select app.current_org_id())::text
    and (storage.foldername(name))[2] = 'expense' and (storage.foldername(name))[3] = (select app.current_employee_id())::text);

-- Les documents « Communication » ne donnent plus accès aux justificatifs ni aux documents salariés.
drop policy if exists "documents_read" on storage.objects;
create policy "documents_read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select app.current_org_id())::text
    and (storage.foldername(name))[2] <> 'expense'
    and ((storage.foldername(name))[2] <> 'employee' or (select app.has_perm('hr', 'read')))
    and (select app.has_perm('comms', 'read')));

-- Une note déposée prévient les valideurs (droit expenses:approve), avec un message construit
-- à partir de la note elle-même : impossible de s'en servir pour envoyer autre chose.
create or replace function public.notify_expense_submitted(p_expense uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int;
begin
  select e.id, e.org_id, e.label, e.amount, x.first_name || ' ' || x.last_name as name into r
  from public.expenses e join public.employees x on x.id = e.employee_id
  where e.id = p_expense and e.employee_id = app.current_employee_id() and e.status = 'pending';
  if r.id is null then return 0; end if;
  n := app.notify_role(r.org_id, 'expenses', 'approve', 'Note de frais à valider', r.name || ' · ' || r.label || ' · ' || to_char(r.amount, 'FM999G990D00') || ' €', '/finance/expenses', 'expense:' || r.id);
  return n;
end $$;
revoke all on function public.notify_expense_submitted(uuid) from public, anon;
grant execute on function public.notify_expense_submitted(uuid) to authenticated;
