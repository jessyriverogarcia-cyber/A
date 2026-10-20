-- Contexte de l'utilisateur connecté (profil, rôle, organisation, droits) en un appel.
-- security definer : un opérateur n'a pas le droit de lire roles/permissions directement.
create or replace function public.my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'full_name', p.full_name,
    'locale', p.locale,
    'employee_id', p.employee_id,
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'currency', o.currency, 'vat_rate', o.vat_rate),
    'role', jsonb_build_object('id', r.id, 'key', r.key, 'label', r.label, 'read_only', r.read_only, 'can_see_salaries', r.can_see_salaries),
    'permissions', coalesce(
      (select jsonb_agg(pe.module || ':' || pe.action order by pe.module, pe.action) from public.permissions pe where pe.role_id = r.id),
      '[]'::jsonb
    )
  )
  from public.profiles p
  join public.roles r on r.id = p.role_id
  join public.orgs o on o.id = p.org_id
  where p.user_id = auth.uid()
$$;

revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
