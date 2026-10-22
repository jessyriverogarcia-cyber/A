-- =====================================================================
-- Intégrations Microsoft 365 / Google Workspace : une boîte d'envoi par organisation.
-- Les jetons OAuth sont chiffrés par l'application (clé serveur INTEGRATIONS_SECRET) ;
-- la base ne stocke qu'un texte chiffré, jamais lisible directement par les clients.
-- =====================================================================

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  provider text not null check (provider in ('microsoft', 'google')),
  account_email text not null,
  scopes text[] not null default '{}',
  token_ciphertext text not null,
  connected_by uuid references auth.users on delete set null,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text,
  unique (org_id, provider)
);

alter table public.integration_accounts enable row level security;
-- Lecture des métadonnées (pas du jeton : privilège de colonne retiré ci-dessous).
create policy "read" on public.integration_accounts for select to authenticated
  using (org_id = app.current_org_id());
revoke select on public.integration_accounts from authenticated, anon;
grant select (id, org_id, provider, account_email, scopes, connected_by, connected_at, last_used_at, last_error) on public.integration_accounts to authenticated;

-- Jeton chiffré pour l'envoi (qui a le droit d'écrire dans la Communication).
create or replace function public.integration_secret(p_provider text) returns text
language sql stable security definer set search_path = '' as $$
  select token_ciphertext from public.integration_accounts
  where org_id = app.current_org_id() and provider = p_provider and app.has_perm('comms', 'create')
$$;

-- Connexion / déconnexion : direction (paramètres).
create or replace function public.save_integration(p_provider text, p_email text, p_scopes text[], p_ciphertext text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_perm('settings', 'update') then raise exception 'Droit « paramètres » requis'; end if;
  insert into public.integration_accounts (org_id, provider, account_email, scopes, token_ciphertext, connected_by)
  values (app.current_org_id(), p_provider, p_email, p_scopes, p_ciphertext, auth.uid())
  on conflict (org_id, provider) do update set account_email = excluded.account_email, scopes = excluded.scopes,
    token_ciphertext = excluded.token_ciphertext, connected_by = excluded.connected_by, connected_at = now(), last_error = null;
end $$;

-- Mise à jour après rafraîchissement du jeton ou erreur d'envoi (qui a le droit d'envoyer).
create or replace function public.touch_integration(p_provider text, p_ciphertext text, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.integration_accounts
  set token_ciphertext = coalesce(p_ciphertext, token_ciphertext), last_used_at = now(), last_error = p_error
  where org_id = app.current_org_id() and provider = p_provider and app.has_perm('comms', 'create')
$$;

create or replace function public.remove_integration(p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_perm('settings', 'update') then raise exception 'Droit « paramètres » requis'; end if;
  delete from public.integration_accounts where org_id = app.current_org_id() and provider = p_provider;
end $$;

revoke all on function public.integration_secret(text), public.save_integration(text, text, text[], text), public.touch_integration(text, text, text), public.remove_integration(text) from public, anon;
grant execute on function public.integration_secret(text), public.save_integration(text, text, text[], text), public.touch_integration(text, text, text), public.remove_integration(text) to authenticated;

-- Pas de trigger d'audit ici : il recopierait le jeton chiffré dans le journal. Les connexions
-- et déconnexions sont tracées par l'application dans activity_events.
