-- =====================================================================
-- Ressources et stock : commandes fournisseurs (envoi, réception), intervalle de maintenance,
-- unité de conditionnement pour les réassorts.
-- =====================================================================

alter table public.purchase_orders
  add column if not exists sent_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists notes text;

alter table public.stock_items
  add column if not exists pack_size numeric(12,3) not null default 1;

alter table public.assets
  add column if not exists maintenance_interval_days int not null default 90;

-- Un fil de messages peut concerner un fournisseur (commandes) et non un client.
alter table public.threads add column if not exists supplier_id uuid references public.suppliers on delete set null;

-- Réception d'une commande : stock incrémenté, mouvements tracés, commande close, événement Map.
-- Atomique et idempotent (une commande reçue ne se reçoit pas deux fois).
create or replace function public.receive_purchase_order(p_po uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po record;
  v_line jsonb;
  v_count int := 0;
begin
  select * into v_po from public.purchase_orders where id = p_po for update;
  if not found then raise exception 'commande introuvable'; end if;
  if v_po.org_id <> app.current_org_id() or not app.has_perm('resources', 'update') then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  if v_po.status = 'received' then
    return jsonb_build_object('received', false, 'lines', 0);
  end if;
  if v_po.status not in ('sent', 'draft') then
    raise exception 'commande non réceptionnable (statut %)', v_po.status;
  end if;

  for v_line in select * from jsonb_array_elements(v_po.lines) loop
    if (v_line->>'stock_item_id') is not null then
      update public.stock_items set quantity = quantity + (v_line->>'qty')::numeric
        where id = (v_line->>'stock_item_id')::uuid and org_id = v_po.org_id;
      insert into public.stock_movements (org_id, stock_item_id, delta, reason, created_by)
        values (v_po.org_id, (v_line->>'stock_item_id')::uuid, (v_line->>'qty')::numeric, 'réception ' || v_po.number, auth.uid());
      v_count := v_count + 1;
    end if;
  end loop;

  update public.purchase_orders set status = 'received', received_at = now() where id = p_po;
  insert into public.activity_events (org_id, type, entity_type, entity_id, actor, payload)
    values (v_po.org_id, 'stock.received', 'purchase_order', p_po, auth.uid(), jsonb_build_object('number', v_po.number, 'lines', v_count));
  return jsonb_build_object('received', true, 'lines', v_count);
end $$;
revoke execute on function public.receive_purchase_order(uuid) from anon, public;
grant execute on function public.receive_purchase_order(uuid) to authenticated;

alter publication supabase_realtime add table public.purchase_orders;
