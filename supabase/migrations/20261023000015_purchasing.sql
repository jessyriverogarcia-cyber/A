-- =====================================================================
-- Achats : fiche fournisseur complète, réception partielle des commandes, historique des réceptions.
-- =====================================================================

alter table public.suppliers
  add column if not exists contact_name text,
  add column if not exists address text,
  add column if not exists vat_number text,
  add column if not exists siret text,
  add column if not exists payment_terms_days int not null default 30,
  add column if not exists notes text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled'));
create index if not exists purchase_orders_supplier on public.purchase_orders (supplier_id);

create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders on delete cascade,
  received_at timestamptz not null default now(),
  received_by uuid references auth.users on delete set null,
  lines jsonb not null,
  note text
);
create index if not exists po_receipts_po on public.purchase_order_receipts (purchase_order_id, received_at);
insert into app.table_modules values ('purchase_order_receipts', 'resources') on conflict do nothing;
alter table public.purchase_order_receipts enable row level security;
create policy "org_read" on public.purchase_order_receipts for select to authenticated
  using (org_id = (select app.current_org_id()) and (select app.has_perm('resources', 'read')));

/**
 * Réception (partielle ou totale), atomique : quantités plafonnées au reste à recevoir,
 * stock et mouvements mis à jour, quantité reçue mémorisée par ligne, statut recalculé.
 * p_qty : {"<stock_item_id>": quantité, …} ; null = tout le reste.
 */
create or replace function public.receive_purchase_order_lines(p_po uuid, p_qty jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po record;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_taken jsonb := '[]'::jsonb;
  v_rest numeric;
  v_take numeric;
  v_complete boolean := true;
  v_any_before boolean := false;
begin
  select * into v_po from public.purchase_orders where id = p_po for update;
  if not found then raise exception 'commande introuvable'; end if;
  if v_po.org_id <> app.current_org_id() or not app.has_perm('resources', 'update') then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  if v_po.status not in ('sent', 'partially_received', 'draft') then
    return jsonb_build_object('received', false, 'lines', 0, 'status', v_po.status);
  end if;

  for v_line in select * from jsonb_array_elements(v_po.lines) loop
    v_rest := greatest(0, (v_line->>'qty')::numeric - coalesce((v_line->>'received')::numeric, 0));
    if coalesce((v_line->>'received')::numeric, 0) > 0 then v_any_before := true; end if;
    v_take := case when p_qty is null then v_rest else least(v_rest, greatest(0, coalesce((p_qty->>(v_line->>'stock_item_id'))::numeric, 0))) end;
    if v_take > 0 and (v_line->>'stock_item_id') is not null then
      update public.stock_items set quantity = quantity + v_take where id = (v_line->>'stock_item_id')::uuid and org_id = v_po.org_id;
      insert into public.stock_movements (org_id, stock_item_id, delta, reason, created_by)
        values (v_po.org_id, (v_line->>'stock_item_id')::uuid, v_take, 'réception ' || v_po.number, auth.uid());
      v_taken := v_taken || jsonb_build_object('stock_item_id', v_line->>'stock_item_id', 'label', v_line->>'label', 'qty', v_take, 'unit', v_line->>'unit');
    end if;
    v_line := jsonb_set(v_line, '{received}', to_jsonb(coalesce((v_line->>'received')::numeric, 0) + v_take));
    if v_rest - v_take > 0 then v_complete := false; end if;
    v_lines := v_lines || v_line;
  end loop;

  if jsonb_array_length(v_taken) = 0 then
    return jsonb_build_object('received', false, 'lines', 0, 'status', v_po.status);
  end if;

  update public.purchase_orders
    set lines = v_lines,
        status = case when v_complete then 'received' else 'partially_received' end,
        received_at = case when v_complete then now() else received_at end
    where id = p_po;
  insert into public.purchase_order_receipts (org_id, purchase_order_id, received_by, lines, note)
    values (v_po.org_id, p_po, auth.uid(), v_taken, p_note);
  insert into public.activity_events (org_id, type, entity_type, entity_id, actor, payload)
    values (v_po.org_id, 'stock.received', 'purchase_order', p_po, auth.uid(),
      jsonb_build_object('number', v_po.number, 'lines', jsonb_array_length(v_taken), 'partial', not v_complete));
  return jsonb_build_object('received', true, 'lines', jsonb_array_length(v_taken), 'status', case when v_complete then 'received' else 'partially_received' end);
end $$;
revoke execute on function public.receive_purchase_order_lines(uuid, jsonb, text) from anon, public;
grant execute on function public.receive_purchase_order_lines(uuid, jsonb, text) to authenticated;

-- L'ancienne réception « tout d'un coup » devient le cas particulier « tout le reste ».
create or replace function public.receive_purchase_order(p_po uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public.receive_purchase_order_lines(p_po, null, null)
$$;

create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function app.audit();
