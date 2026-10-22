-- =====================================================================
-- Traitements planifiés (pg_cron) : chaque matin, la base fait le tour des échéances et
-- prévient les bonnes personnes. Idempotent : une même alerte n'est notifiée qu'une fois.
-- =====================================================================

create extension if not exists pg_cron;

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  org_id uuid references public.orgs on delete cascade,
  job text not null,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
create index if not exists job_runs_org on public.job_runs (org_id, started_at desc);
alter table public.job_runs enable row level security;
create policy "read" on public.job_runs for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('settings', 'read') or app.has_perm('pilotage', 'read')));

-- Notifie tous les utilisateurs de l'organisation qui ont un droit donné.
create or replace function app.notify_role(p_org uuid, p_module text, p_action text, p_title text, p_body text, p_link text, p_key text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notifications (org_id, user_id, title, body, link, dedupe_key)
  select distinct pr.org_id, pr.user_id, p_title, p_body, p_link, p_key
  from public.profiles pr join public.permissions pe on pe.role_id = pr.role_id
  where pr.org_id = p_org and pe.module = p_module and pe.action = p_action
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Notifie le compte lié à un salarié.
create or replace function app.notify_emp(p_org uuid, p_employee uuid, p_title text, p_body text, p_link text, p_key text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notifications (org_id, user_id, title, body, link, dedupe_key)
  select pr.org_id, pr.user_id, p_title, p_body, p_link, p_key
  from public.profiles pr where pr.org_id = p_org and pr.employee_id = p_employee
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.daily_jobs_for(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone (select timezone from public.orgs where id = p_org))::date;
  r record;
  c_overdue int := 0; c_expired int := 0; c_follow int := 0; c_maint int := 0; c_train int := 0; c_notes int := 0;
begin
  -- 1. Factures émises dont l'échéance est passée → « en retard », la compta est prévenue.
  for r in
    update public.invoices i set status = 'overdue'
    where i.org_id = p_org and i.status in ('sent', 'partially_paid') and i.due_date < v_today and i.kind <> 'credit_note'
    returning i.id, i.number, i.total_ttc - i.paid_amount as rest, (select name from public.clients c where c.id = i.client_id) as client
  loop
    c_overdue := c_overdue + 1;
    c_notes := c_notes + app.notify_role(p_org, 'finance', 'update', 'Facture ' || r.number || ' échue', coalesce(r.client, '') || ' · reste dû ' || to_char(r.rest, 'FM999G999G990D00') || ' €', '/finance/invoices/' || r.id, 'inv-overdue:' || r.id);
  end loop;

  -- 2. Devis envoyés arrivés au bout de leur validité → « expiré », le commercial est prévenu.
  for r in
    update public.quotes q set status = 'expired'
    where q.org_id = p_org and q.status = 'sent' and q.valid_until < v_today
    returning q.id, q.number, (select d.owner_employee_id from public.deals d where d.id = q.deal_id) as owner
  loop
    c_expired := c_expired + 1;
    if r.owner is not null then
      c_notes := c_notes + app.notify_emp(p_org, r.owner, 'Devis ' || r.number || ' expiré', 'Relancez le client avec une offre actualisée.', '/crm/quotes/' || r.id, 'quote-expired:' || r.id);
    end if;
  end loop;

  -- 3. Devis sans réponse depuis 7 jours (3 relances maximum) → à relancer.
  for r in
    select q.id, q.number, q.followups, (select d.owner_employee_id from public.deals d where d.id = q.deal_id) as owner
    from public.quotes q
    where q.org_id = p_org and q.status = 'sent' and q.followups < 3 and coalesce(q.last_followup_at, q.sent_at) <= now() - interval '7 days'
  loop
    c_follow := c_follow + 1;
    if r.owner is not null then
      c_notes := c_notes + app.notify_emp(p_org, r.owner, 'Devis ' || r.number || ' à relancer', 'Relance pré-remplie disponible dans le Commercial.', '/crm', 'quote-follow:' || r.id || ':' || r.followups);
    end if;
  end loop;

  -- 4. Maintenances dues aujourd'hui ou en retard.
  for r in
    select a.id, a.code, a.next_maintenance_on from public.assets a
    where a.org_id = p_org and a.next_maintenance_on is not null and a.next_maintenance_on <= v_today
  loop
    c_maint := c_maint + 1;
    c_notes := c_notes + app.notify_role(p_org, 'resources', 'update', 'Maintenance due : ' || r.code, 'Prévue le ' || to_char(r.next_maintenance_on, 'DD/MM/YYYY'), '/resources/equipment/' || r.id, 'maint:' || r.id || ':' || r.next_maintenance_on);
  end loop;

  -- 5. Habilitations expirées ou qui expirent sous 30 jours : RH et salarié concerné.
  for r in
    select t.id, t.title, t.expires_on, t.employee_id, e.first_name || ' ' || e.last_name as name
    from public.trainings t join public.employees e on e.id = t.employee_id
    where t.org_id = p_org and t.expires_on is not null and t.expires_on <= v_today + 30
  loop
    c_train := c_train + 1;
    c_notes := c_notes + app.notify_role(p_org, 'hr', 'update', (case when r.expires_on < v_today then 'Habilitation expirée : ' else 'Habilitation à renouveler : ' end) || r.title, r.name || ' · ' || to_char(r.expires_on, 'DD/MM/YYYY'), '/hr/employees/' || r.employee_id, 'training:' || r.id || ':' || r.expires_on);
    c_notes := c_notes + app.notify_emp(p_org, r.employee_id, 'Votre habilitation « ' || r.title || ' » ' || (case when r.expires_on < v_today then 'a expiré' else 'expire bientôt' end), 'Échéance ' || to_char(r.expires_on, 'DD/MM/YYYY'), '/me', 'training-self:' || r.id || ':' || r.expires_on);
  end loop;

  return jsonb_build_object('date', v_today, 'factures_en_retard', c_overdue, 'devis_expires', c_expired, 'devis_a_relancer', c_follow, 'maintenances', c_maint, 'habilitations', c_train, 'notifications', c_notes);
end $$;

-- Toutes les organisations ; une erreur sur l'une n'empêche pas les autres.
create or replace function app.daily_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare o record; v_id bigint;
begin
  for o in select id from public.orgs loop
    insert into public.job_runs (org_id, job) values (o.id, 'daily') returning id into v_id;
    begin
      update public.job_runs set result = app.daily_jobs_for(o.id), finished_at = now() where id = v_id;
    exception when others then
      update public.job_runs set error = sqlerrm, finished_at = now() where id = v_id;
    end;
  end loop;
end $$;

-- Lancement manuel pour son organisation (direction : paramètres).
create or replace function public.run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_res jsonb;
begin
  if not app.has_perm('settings', 'update') then raise exception 'Droit « paramètres » requis'; end if;
  v_res := app.daily_jobs_for(v_org);
  insert into public.job_runs (org_id, job, trigger, finished_at, result) values (v_org, 'daily', 'manual', now(), v_res);
  return v_res;
end $$;
revoke all on function public.run_daily_jobs() from public, anon;
grant execute on function public.run_daily_jobs() to authenticated;
revoke all on function app.daily_jobs(), app.daily_jobs_for(uuid), app.notify_role(uuid, text, text, text, text, text, text), app.notify_emp(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- Chaque jour à 4 h UTC (5 h / 6 h à Paris), avant l'arrivée des équipes.
select cron.schedule('daily-jobs', '0 4 * * *', $$select app.daily_jobs()$$);
