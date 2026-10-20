-- =====================================================================
-- Strato Fab — schéma générique CRM/ERP « Map vivante »
-- Le vocabulaire métier (étapes, zones, pipeline…) vient de config/sector.config.ts :
-- on stocke des identifiants texte, jamais d'enum figé.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------------
-- Organisation et droits
-- ---------------------------------------------------------------------
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  locale text not null default 'fr-FR',
  currency text not null default 'EUR',
  vat_rate numeric(5,4) not null default 0.2,
  rounding numeric(5,2) not null default 0.01,
  timezone text not null default 'Europe/Paris',
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  key text not null,
  label text not null,
  description text,
  can_see_salaries boolean not null default false,
  read_only boolean not null default false,
  unique (org_id, key)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  role_id uuid not null references public.roles on delete cascade,
  module text not null,
  action text not null check (action in ('read','create','update','delete','approve','export')),
  unique (role_id, module, action)
);

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references public.orgs on delete cascade,
  role_id uuid not null references public.roles,
  full_name text not null,
  locale text not null default 'fr-FR',
  employee_id uuid, -- FK ajoutée après employees
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fonctions d'aide RLS (security definer : évite la récursion sur profiles/permissions)
create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.profiles where user_id = auth.uid()
$$;

create or replace function app.current_role_key() returns text
language sql stable security definer set search_path = '' as $$
  select r.key from public.profiles p join public.roles r on r.id = p.role_id where p.user_id = auth.uid()
$$;

create or replace function app.current_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where user_id = auth.uid()
$$;

create or replace function app.has_perm(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles pr
    join public.permissions pe on pe.role_id = pr.role_id
    where pr.user_id = auth.uid() and pe.module = p_module and pe.action = p_action
  )
$$;

grant usage on schema app to authenticated, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------
-- Sites et plan 3D
-- ---------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  key text not null,
  name text not null,
  address text,
  timezone text not null default 'Europe/Paris',
  shape text,
  unique (org_id, key)
);

create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid not null references public.sites on delete cascade,
  version int not null default 1,
  layout jsonb not null default '{}',
  is_active boolean not null default true,
  unique (site_id, version)
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid not null references public.sites on delete cascade,
  key text not null,
  name text not null,
  type text not null,
  polygon jsonb not null default '[]', -- [[x,z],…] en mètres
  capacity int,
  restricted boolean not null default false,
  outdoor boolean not null default false,
  unique (site_id, key)
);

create table public.map_objects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid not null references public.sites on delete cascade,
  zone_id uuid references public.zones on delete set null,
  type text not null,
  kit text not null,
  position jsonb not null default '{"x":0,"y":0,"z":0}',
  rotation real not null default 0,
  scale real not null default 1,
  entity_type text,
  entity_id uuid,
  visual_state text not null default 'idle'
);

-- ---------------------------------------------------------------------
-- Personnes, présence, temps
-- ---------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid references public.sites,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text not null,
  role_key text, -- rôle métier (config) — distinct du rôle applicatif
  department text,
  manager_id uuid references public.employees,
  contract_type text not null default 'CDI',
  work_rate numeric(4,3) not null default 1,
  start_date date,
  skills text[] not null default '{}',
  avatar_color text,
  appearance jsonb not null default '{}',
  home_zone_id uuid references public.zones,
  active boolean not null default true
);
alter table public.profiles add constraint profiles_employee_fk foreign key (employee_id) references public.employees on delete set null;

create table public.employee_salaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  gross_annual numeric(12,2) not null,
  months_count int not null check (months_count in (12, 13)),
  bonus numeric(12,2) not null default 0,
  effective_from date not null,
  effective_to date
);

create table public.badge_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  kind text not null check (kind in ('in','out','break_start','break_end')),
  reader text,
  at timestamptz not null default now()
);
create index on public.badge_events (employee_id, at desc);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  owner_employee_id uuid references public.employees on delete cascade,
  asset_id uuid,
  kind text not null check (kind in ('meeting','client','focus','break','travel','remote','maintenance','other')),
  title text not null,
  client_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  participants uuid[] not null default '{}',
  room_asset_id uuid,
  external_source text,
  external_id text
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  kind text not null check (kind in ('paid','rtt','sick','unpaid','training','other')),
  starts_on date not null,
  ends_on date not null,
  days numeric(4,1) not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.employees,
  comment text
);

-- ---------------------------------------------------------------------
-- RH
-- ---------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  reviewer_id uuid references public.employees,
  review_date date not null,
  objectives jsonb not null default '[]',
  notes text,
  rating int check (rating between 1 and 5)
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  title text not null,
  provider text,
  scheduled_on date,
  status text not null default 'planned' check (status in ('planned','done','expired')),
  expires_on date
);

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  title text not null,
  department text,
  status text not null default 'open' check (status in ('draft','open','closed')),
  description text
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  job_opening_id uuid references public.job_openings on delete set null,
  full_name text not null,
  email text,
  source text,
  score text check (score in ('A','B','C')),
  ai_summary text,
  stage text not null default 'new'
);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  title text not null,
  due_on date,
  done boolean not null default false
);

-- ---------------------------------------------------------------------
-- Commercial
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null,
  industry text,
  product_family text,
  city text,
  country text default 'FR',
  vat_number text,
  payment_terms_days int not null default 30,
  status text not null default 'active' check (status in ('prospect','active','inactive')),
  owner_employee_id uuid references public.employees
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  is_primary boolean not null default false
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  title text not null,
  stage text not null,
  value numeric(14,2) not null default 0,
  probability numeric(4,3) not null default 0,
  expected_close date,
  owner_employee_id uuid references public.employees,
  product_family text
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  sku text not null,
  label text not null,
  unit text not null default 'u',
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  technology text,
  category text,
  unique (org_id, sku)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  client_id uuid not null references public.clients,
  deal_id uuid references public.deals on delete set null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  issue_date date not null default current_date,
  valid_until date,
  total_ht numeric(14,2) not null default 0,
  total_vat numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  notes text,
  accepted_at timestamptz,
  unique (org_id, number)
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  quote_id uuid not null references public.quotes on delete cascade,
  catalog_item_id uuid references public.catalog_items,
  description text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  discount numeric(4,3) not null default 0,
  position int not null default 0
);

-- ---------------------------------------------------------------------
-- Ressources (avant opérations : un OF est affecté à une machine)
-- ---------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid references public.sites,
  zone_id uuid references public.zones on delete set null,
  kind text not null check (kind in ('machine','equipment','workstation','room','vehicle','badge_reader')),
  technology text,
  name text not null,
  code text not null,
  status text not null default 'idle' check (status in ('idle','running','maintenance','down','offline')),
  specs jsonb not null default '{}',
  last_maintenance_on date,
  next_maintenance_on date,
  unique (org_id, code)
);

create table public.asset_bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  asset_id uuid not null references public.assets on delete cascade,
  work_order_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked_by uuid references public.employees
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null,
  category text,
  email text,
  phone text,
  lead_time_days int
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  sku text not null,
  label text not null,
  category text not null, -- filament, resin, powder_polymer, powder_metal, finished_part
  unit text not null,
  quantity numeric(12,3) not null default 0,
  min_quantity numeric(12,3) not null default 0,
  location_zone_id uuid references public.zones on delete set null,
  supplier_id uuid references public.suppliers on delete set null,
  unit_cost numeric(12,2),
  hazardous boolean not null default false,
  unique (org_id, sku)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  supplier_id uuid not null references public.suppliers,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  total numeric(14,2) not null default 0,
  expected_on date,
  lines jsonb not null default '[]'
);

-- ---------------------------------------------------------------------
-- Opérations
-- ---------------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  site_id uuid references public.sites,
  number text not null,
  client_id uuid not null references public.clients,
  quote_id uuid references public.quotes on delete set null,
  title text not null,
  product_family text,
  technology text,
  physical_object text,
  stage text not null,
  stage_progress int not null default 0 check (stage_progress between 0 and 100),
  progress int not null default 0 check (progress between 0 and 100),
  owner_employee_id uuid references public.employees,
  asset_id uuid references public.assets on delete set null,
  zone_id uuid references public.zones on delete set null,
  hours_budget numeric(8,2) not null default 0,
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'active' check (status in ('active','on_hold','done','cancelled')),
  traceability jsonb not null default '{}',
  unique (org_id, number)
);
alter table public.asset_bookings add constraint asset_bookings_wo_fk foreign key (work_order_id) references public.work_orders on delete cascade;

create table public.work_order_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  work_order_id uuid not null references public.work_orders on delete cascade,
  stage text not null,
  entered_at timestamptz not null default now(),
  left_at timestamptz,
  actor_employee_id uuid references public.employees,
  note text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  work_order_id uuid references public.work_orders on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  assignee_employee_id uuid references public.employees,
  due_on date,
  position int not null default 0
);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  work_order_id uuid not null references public.work_orders on delete cascade,
  title text not null,
  items jsonb not null default '[]' -- [{label, done}]
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  work_order_id uuid references public.work_orders on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0),
  billable boolean not null default true,
  note text
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  stock_item_id uuid not null references public.stock_items on delete cascade,
  delta numeric(12,3) not null,
  reason text not null,
  work_order_id uuid references public.work_orders on delete set null,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  client_id uuid not null references public.clients,
  work_order_id uuid references public.work_orders on delete set null,
  quote_id uuid references public.quotes on delete set null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','paid','partially_paid','overdue','cancelled')),
  issue_date date not null default current_date,
  due_date date not null,
  total_ht numeric(14,2) not null default 0,
  total_vat numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  unique (org_id, number)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  description text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  vat_rate numeric(5,4) not null,
  position int not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  amount numeric(14,2) not null,
  paid_on date not null,
  method text not null default 'transfer'
);

create table public.dunning_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  level int not null check (level between 1 and 4),
  sent_at timestamptz not null default now(),
  channel text not null default 'email'
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  label text not null,
  amount numeric(12,2) not null,
  spent_on date not null,
  category text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','reimbursed')),
  approver_id uuid references public.employees
);

create table public.cash_forecast (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  month date not null,
  inflow numeric(14,2) not null default 0,
  outflow numeric(14,2) not null default 0,
  note text,
  unique (org_id, month)
);

-- ---------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  subject text not null,
  channel text not null check (channel in ('email','teams','internal')),
  client_id uuid references public.clients on delete set null,
  work_order_id uuid references public.work_orders on delete set null,
  last_message_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  thread_id uuid not null references public.threads on delete cascade,
  direction text not null check (direction in ('in','out','internal')),
  author text not null,
  body text not null,
  ai_draft boolean not null default false,
  sent_at timestamptz
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  entity_type text,
  entity_id uuid,
  name text not null,
  storage_path text not null,
  version int not null default 1,
  mime text
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz
);

-- ---------------------------------------------------------------------
-- Pilotage et sécurité
-- ---------------------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}',
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);
create index on public.activity_events (org_id, at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Colonnes communes : created_at, updated_at, created_by + trigger updated_at
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'audit_log'
  loop
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists created_by uuid default auth.uid()', t);
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', 'touch_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS : par organisation et par module × action (matrice permissions)
-- ---------------------------------------------------------------------
create table app.table_modules (table_name text primary key, module text not null);
insert into app.table_modules values
  ('sites','map'), ('floor_plans','map'), ('zones','map'), ('map_objects','map'),
  ('employees','people'), ('employee_salaries','salaries'),
  ('badge_events','presence'), ('calendar_events','planning'), ('leave_requests','hr'),
  ('reviews','hr'), ('trainings','hr'), ('job_openings','hr'), ('candidates','hr'), ('onboarding_tasks','hr'),
  ('clients','crm'), ('contacts','crm'), ('deals','crm'), ('catalog_items','crm'), ('quotes','crm'), ('quote_lines','crm'),
  ('work_orders','ops'), ('work_order_stages','ops'), ('tasks','ops'), ('checklists','ops'), ('time_entries','ops'),
  ('assets','resources'), ('asset_bookings','resources'), ('suppliers','resources'), ('stock_items','resources'),
  ('stock_movements','resources'), ('purchase_orders','resources'),
  ('invoices','finance'), ('invoice_lines','finance'), ('payments','finance'), ('dunning_steps','finance'),
  ('expenses','expenses'), ('cash_forecast','finance'),
  ('threads','comms'), ('messages','comms'), ('documents','comms'),
  ('roles','settings'), ('permissions','settings');

do $$
declare r record;
begin
  for r in select * from app.table_modules loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format($p$create policy "org_read" on public.%I for select to authenticated
      using (org_id = app.current_org_id() and app.has_perm(%L, 'read'))$p$, r.table_name, r.module);
    execute format($p$create policy "org_create" on public.%I for insert to authenticated
      with check (org_id = app.current_org_id() and app.has_perm(%L, 'create'))$p$, r.table_name, r.module);
    execute format($p$create policy "org_update" on public.%I for update to authenticated
      using (org_id = app.current_org_id() and app.has_perm(%L, 'update'))
      with check (org_id = app.current_org_id())$p$, r.table_name, r.module);
    execute format($p$create policy "org_delete" on public.%I for delete to authenticated
      using (org_id = app.current_org_id() and app.has_perm(%L, 'delete'))$p$, r.table_name, r.module);
  end loop;
end $$;

-- Self-service : chacun voit et crée ses propres pointages, congés, heures et notes de frais,
-- même sans droit sur le module complet.
create policy "own_read" on public.badge_events for select to authenticated using (employee_id = app.current_employee_id());
create policy "own_create" on public.badge_events for insert to authenticated with check (org_id = app.current_org_id() and employee_id = app.current_employee_id());
create policy "own_read" on public.leave_requests for select to authenticated using (employee_id = app.current_employee_id());
create policy "own_create" on public.leave_requests for insert to authenticated with check (org_id = app.current_org_id() and employee_id = app.current_employee_id() and status = 'pending');
create policy "own_read" on public.time_entries for select to authenticated using (employee_id = app.current_employee_id());
create policy "own_create" on public.time_entries for insert to authenticated with check (org_id = app.current_org_id() and employee_id = app.current_employee_id());
create policy "own_read" on public.expenses for select to authenticated using (employee_id = app.current_employee_id());
create policy "own_create" on public.expenses for insert to authenticated with check (org_id = app.current_org_id() and employee_id = app.current_employee_id() and status = 'pending');
create policy "own_read" on public.employee_salaries for select to authenticated using (employee_id = app.current_employee_id());

-- Organisation : lecture de la sienne, modification par les paramètres
alter table public.orgs enable row level security;
create policy "org_read" on public.orgs for select to authenticated using (id = app.current_org_id());
create policy "org_update" on public.orgs for update to authenticated using (id = app.current_org_id() and app.has_perm('settings','update'));

-- Profils : le sien, ou tous ceux de l'org avec le droit paramètres
alter table public.profiles enable row level security;
create policy "self_or_admin_read" on public.profiles for select to authenticated
  using (user_id = auth.uid() or (org_id = app.current_org_id() and app.has_perm('settings','read')));
create policy "admin_write" on public.profiles for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('settings','update'));
create policy "self_update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role_id = (select role_id from public.profiles where user_id = auth.uid()));

-- Flux d'événements : toute l'org le lit (la map s'y abonne) ; tout membre peut en écrire
alter table public.activity_events enable row level security;
create policy "org_read" on public.activity_events for select to authenticated using (org_id = app.current_org_id());
create policy "org_create" on public.activity_events for insert to authenticated
  with check (org_id = app.current_org_id() and actor = auth.uid());

-- Notifications : les siennes uniquement
alter table public.notifications enable row level security;
create policy "own" on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = app.current_org_id());

-- Audit : lecture par la direction (pilotage), écriture uniquement par trigger
alter table public.audit_log enable row level security;
create policy "pilotage_read" on public.audit_log for select to authenticated
  using (
    org_id = app.current_org_id() and app.has_perm('pilotage','read')
    -- l'audit des salaires contient les montants : réservé à qui peut lire les salaires
    and (table_name <> 'employee_salaries' or app.has_perm('salaries','read'))
  );

-- ---------------------------------------------------------------------
-- Audit des tables sensibles
-- ---------------------------------------------------------------------
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (org_id, table_name, row_id, action, old_data, new_data)
  values (
    coalesce(new.org_id, old.org_id), tg_table_name, coalesce(new.id, old.id), tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_salaries after insert or update or delete on public.employee_salaries for each row execute function app.audit();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function app.audit();
create trigger audit_permissions after insert or update or delete on public.permissions for each row execute function app.audit();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function app.audit();

-- ---------------------------------------------------------------------
-- Présence calculée (RLS appliquée via security_invoker)
-- ---------------------------------------------------------------------
create view public.presence_status with (security_invoker = true) as
with last_badge as (
  select distinct on (b.employee_id) b.employee_id, b.kind, b.at
  from public.badge_events b
  where b.at >= date_trunc('day', now())
  order by b.employee_id, b.at desc
),
current_event as (
  select distinct on (c.owner_employee_id) c.owner_employee_id, c.kind, c.title
  from public.calendar_events c
  where now() between c.starts_at and c.ends_at
  order by c.owner_employee_id, c.starts_at desc
)
select
  e.id as employee_id,
  e.org_id,
  case
    when ce.kind = 'remote' then 'remote'
    when ce.kind = 'travel' then 'travel'
    when lb.kind is null or lb.kind = 'out' then 'absent'
    when lb.kind = 'break_start' then 'on_break'
    when ce.kind in ('meeting','client') then 'in_meeting'
    else 'at_station'
  end as status,
  lb.at as since,
  ce.title as current_activity,
  e.home_zone_id as zone_id
from public.employees e
left join last_badge lb on lb.employee_id = e.id
left join current_event ce on ce.owner_employee_id = e.id
where e.active;

-- ---------------------------------------------------------------------
-- Temps réel : la map s'abonne à ces tables
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.activity_events, public.work_orders, public.assets, public.badge_events,
  public.stock_items, public.map_objects, public.notifications;
