-- =====================================================================
-- Agenda : chacun gère ses propres événements ; flux iCal personnel (abonnement depuis
-- Outlook, Google Agenda, Apple) ; synchronisation vers l'agenda connecté.
-- =====================================================================

alter table public.calendar_events
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists leave_request_id uuid references public.leave_requests on delete cascade,
  add column if not exists synced_at timestamptz,
  add column if not exists created_at timestamptz not null default now();
create index if not exists calendar_events_owner on public.calendar_events (owner_employee_id, starts_at);
create index if not exists calendar_events_time on public.calendar_events (org_id, starts_at);

-- Self-service : ses événements et ceux où l'on est invité.
create policy "own_read" on public.calendar_events for select to authenticated
  using (org_id = (select app.current_org_id()) and (owner_employee_id = (select app.current_employee_id()) or (select app.current_employee_id()) = any (participants)));
create policy "own_create" on public.calendar_events for insert to authenticated
  with check (org_id = (select app.current_org_id()) and owner_employee_id = (select app.current_employee_id()));
create policy "own_update" on public.calendar_events for update to authenticated
  using (owner_employee_id = (select app.current_employee_id())) with check (owner_employee_id = (select app.current_employee_id()));
create policy "own_delete" on public.calendar_events for delete to authenticated
  using (owner_employee_id = (select app.current_employee_id()));

-- Flux iCal : seule l'empreinte SHA-256 du jeton est stockée.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references public.orgs on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_read_at timestamptz
);
alter table public.calendar_feeds enable row level security;
create policy "own" on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and org_id = (select app.current_org_id()));

/**
 * Lecture d'un flux par son jeton (appelée sans session par l'application d'agenda) :
 * uniquement les événements du titulaire, ses invitations et ses absences validées, 1 mois en arrière, 6 mois en avant.
 */
create or replace function public.calendar_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_org uuid; v_emp uuid; v_name text; v_res jsonb;
begin
  select f.user_id, f.org_id into v_user, v_org from public.calendar_feeds f
  where f.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_user is null then return null; end if;
  select p.employee_id, p.full_name into v_emp, v_name from public.profiles p where p.user_id = v_user and p.org_id = v_org;
  update public.calendar_feeds set last_read_at = now() where user_id = v_user;
  select jsonb_build_object(
    'name', v_name,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'notes', e.notes, 'created_at', e.created_at))
      from public.calendar_events e
      where e.org_id = v_org and e.leave_request_id is null and (e.owner_employee_id = v_emp or v_emp = any (e.participants))
        and e.starts_at > now() - interval '31 days' and e.starts_at < now() + interval '183 days'), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'starts_on', l.starts_on, 'ends_on', l.ends_on))
      from public.leave_requests l
      where l.org_id = v_org and l.employee_id = v_emp and l.status = 'approved'
        and l.ends_on > current_date - 31 and l.starts_on < current_date + 183), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
