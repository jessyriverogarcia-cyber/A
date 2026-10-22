-- =====================================================================
-- Module Commercial : suivi des devis, prochaines étapes, numérotation,
-- et acceptation de devis « zéro double saisie » (devis → OF).
-- =====================================================================

alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists followups int not null default 0,
  add column if not exists last_followup_at timestamptz,
  add column if not exists contact_id uuid references public.contacts on delete set null,
  add column if not exists rejected_reason text;

alter table public.deals
  add column if not exists next_step text,
  add column if not exists next_step_on date,
  add column if not exists lost_reason text;

alter table public.clients
  add column if not exists notes text,
  add column if not exists address text,
  add column if not exists website text;

-- Numérotation séquentielle annuelle (DEV-2026-0042) calculée en base.
create or replace function public.next_document_number(p_table text, p_prefix text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if p_table not in ('quotes', 'invoices', 'work_orders', 'purchase_orders') then
    raise exception 'table non numérotée : %', p_table;
  end if;
  execute format(
    'select coalesce(max((regexp_match(number, ''(\d+)$''))[1]::int), 0) + 1 from public.%I where org_id = $1 and number like $2',
    p_table
  ) into v_next using v_org, p_prefix || '-' || v_year || '-%';
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end $$;
grant execute on function public.next_document_number(text, text) to authenticated;

-- Acceptation d'un devis : devis accepté, affaire gagnée, OF créé à la première étape,
-- historique d'étape et événement pour la Map. Atomique et idempotent.
-- Le commercial n'a pas le droit de créer un OF directement : la fonction le fait pour lui
-- (security definer) après avoir vérifié son droit crm:update.
create or replace function public.accept_quote(
  p_quote uuid,
  p_wo_prefix text,
  p_stage text,
  p_progress int,
  p_site_key text,
  p_zone_key text,
  p_technology text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_quote record;
  v_org uuid;
  v_wo_id uuid;
  v_number text;
  v_title text;
  v_family text;
  v_hours numeric;
  v_site uuid;
  v_zone uuid;
  v_client text;
begin
  select q.*, c.name as client_name, c.product_family as client_family
    into v_quote
    from public.quotes q join public.clients c on c.id = q.client_id
    where q.id = p_quote;
  if not found then raise exception 'devis introuvable'; end if;

  if auth.role() = 'service_role' then
    v_org := v_quote.org_id;
  else
    v_org := app.current_org_id();
    if v_quote.org_id <> v_org or not app.has_perm('crm', 'update') then
      raise exception 'droits insuffisants' using errcode = '42501';
    end if;
  end if;

  -- Déjà accepté : on renvoie l'OF existant (double clic, rejeu du scénario).
  select id, number into v_wo_id, v_number from public.work_orders where quote_id = p_quote limit 1;
  if v_wo_id is not null then
    return jsonb_build_object('work_order_id', v_wo_id, 'number', v_number, 'created', false);
  end if;
  if v_quote.status not in ('draft', 'sent') then
    raise exception 'devis non acceptable (statut %)', v_quote.status;
  end if;

  select d.title, d.product_family into v_title, v_family from public.deals d where d.id = v_quote.deal_id;
  v_title := coalesce(v_title, 'Commande ' || v_quote.number);
  v_family := coalesce(v_family, v_quote.client_family);
  select coalesce(sum(l.quantity), 0) into v_hours
    from public.quote_lines l join public.catalog_items ci on ci.id = l.catalog_item_id
    where l.quote_id = p_quote and ci.unit = 'h';
  select id into v_site from public.sites where org_id = v_org and key = p_site_key;
  select id into v_zone from public.zones where org_id = v_org and key = p_zone_key;

  -- Numéro d'OF
  select p_wo_prefix || '-' || to_char(now(), 'YYYY') || '-' ||
         lpad((coalesce(max((regexp_match(number, '(\d+)$'))[1]::int), 0) + 1)::text, 4, '0')
    into v_number
    from public.work_orders where org_id = v_org and number like p_wo_prefix || '-' || to_char(now(), 'YYYY') || '-%';

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote;
  if v_quote.deal_id is not null then
    update public.deals set stage = 'won', probability = 1 where id = v_quote.deal_id;
  end if;

  insert into public.work_orders (
    org_id, site_id, number, client_id, quote_id, title, product_family, technology, physical_object,
    stage, stage_progress, progress, zone_id, hours_budget, due_date, created_by
  ) values (
    v_org, v_site, v_number, v_quote.client_id, p_quote, v_title, v_family, p_technology, v_title,
    p_stage, 5, p_progress, v_zone, v_hours, current_date + 21, auth.uid()
  ) returning id into v_wo_id;

  insert into public.work_order_stages (org_id, work_order_id, stage, created_by)
  values (v_org, v_wo_id, p_stage, auth.uid());

  insert into public.activity_events (org_id, type, entity_type, entity_id, actor, payload)
  values (v_org, 'quote.accepted', 'quote', p_quote, auth.uid(), jsonb_build_object(
    'numero', v_quote.number, 'client', v_quote.client_name, 'work_order', v_number,
    'work_order_id', v_wo_id, 'site_id', v_site
  ));

  return jsonb_build_object('work_order_id', v_wo_id, 'number', v_number, 'created', true);
end $$;
revoke execute on function public.accept_quote(uuid, text, text, int, text, text, text) from anon, public;
grant execute on function public.accept_quote(uuid, text, text, int, text, text, text) to authenticated, service_role;

-- Les nouvelles affaires et devis apparaissent en direct dans le pipeline.
alter publication supabase_realtime add table public.deals, public.quotes;
