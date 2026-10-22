-- =====================================================================
-- Module Finance : type de facture (facture, acompte, avoir), envoi, remise par ligne,
-- statut recalculé à chaque paiement.
-- =====================================================================

alter table public.invoices
  add column if not exists kind text not null default 'invoice' check (kind in ('invoice', 'deposit', 'credit_note')),
  add column if not exists sent_at timestamptz,
  add column if not exists notes text,
  add column if not exists contact_id uuid references public.contacts on delete set null;

alter table public.invoice_lines
  add column if not exists discount numeric(4,3) not null default 0,
  add column if not exists catalog_item_id uuid references public.catalog_items on delete set null;

alter table public.dunning_steps add column if not exists note text;

-- Le montant payé et le statut suivent les paiements (zéro double saisie).
create or replace function app.sync_invoice_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_status text;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice;
  select total_ttc, status into v_total, v_status from public.invoices where id = v_invoice;
  update public.invoices set
    paid_amount = v_paid,
    status = case
      when v_status in ('draft', 'cancelled') then v_status
      when v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partially_paid'
      when due_date < current_date then 'overdue'
      else 'sent'
    end
  where id = v_invoice;
  return coalesce(new, old);
end $$;

drop trigger if exists sync_invoice_paid on public.payments;
create trigger sync_invoice_paid after insert or update or delete on public.payments
  for each row execute function app.sync_invoice_paid();

-- Passage automatique en retard (appelé au chargement du module et, en phase 4, par pg_cron).
create or replace function public.refresh_overdue_invoices() returns int
language sql security definer set search_path = '' as $$
  with upd as (
    update public.invoices set status = 'overdue'
    where org_id = app.current_org_id() and status = 'sent' and due_date < current_date
    returning 1
  ) select count(*)::int from upd
$$;
grant execute on function public.refresh_overdue_invoices() to authenticated;

alter publication supabase_realtime add table public.invoices, public.payments;
