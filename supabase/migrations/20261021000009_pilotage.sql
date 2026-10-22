-- =====================================================================
-- Pilotage : audit élargi aux actions métier, lecture limitée aux modules lisibles.
-- =====================================================================

-- Identifiant de ligne générique (profiles a pour clé user_id).
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (org_id, table_name, row_id, action, old_data, new_data)
  values (
    (rec->>'org_id')::uuid, tg_table_name, coalesce(rec->>'id', rec->>'user_id')::uuid, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['quotes','deals','work_orders','leave_requests','purchase_orders','employees','profiles','roles','documents','badge_events','assets','map_objects','clients','expenses']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function app.audit()', t);
  end loop;
end $$;

create index if not exists audit_log_org_at on public.audit_log (org_id, at desc);
create index if not exists audit_log_row on public.audit_log (row_id);

-- Le journal ne doit rien montrer qu'on ne pourrait pas lire dans le module concerné
-- (ex. : un responsable de production ne voit pas l'historique des factures).
create or replace function app.module_of(p_table text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select module from app.table_modules where table_name = p_table), 'settings')
$$;
grant execute on function app.module_of(text) to authenticated;

drop policy if exists "pilotage_read" on public.audit_log;
create policy "pilotage_read" on public.audit_log for select to authenticated
  using (
    org_id = app.current_org_id()
    and app.has_perm('pilotage', 'read')
    and app.has_perm(app.module_of(table_name), 'read')
    and (table_name <> 'employee_salaries' or app.has_perm('salaries', 'read'))
  );

-- Noms des membres de l'organisation (seulement le nom : les profils restent protégés).
create or replace function app.member_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select full_name from public.profiles where user_id = p_user and org_id = app.current_org_id()
$$;

create or replace function public.org_members() returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.full_name from public.profiles p where p.org_id = app.current_org_id() order by p.full_name
$$;
grant execute on function app.member_name(uuid) to authenticated;
revoke all on function public.org_members() from public, anon;
grant execute on function public.org_members() to authenticated;

-- Qui a fait quoi : la RLS de audit_log s'applique (security_invoker), le nom vient de member_name.
create or replace view public.audit_entries with (security_invoker = true) as
select a.id, a.org_id, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.actor, a.at,
  app.member_name(a.actor) as actor_name
from public.audit_log a;
