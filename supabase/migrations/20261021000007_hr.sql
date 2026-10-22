-- RH : durée contractuelle, solde de congés reporté, motif de refus.
alter table public.employees
  add column if not exists weekly_hours numeric(4,1) not null default 35,
  add column if not exists leave_carryover numeric(4,1) not null default 0;

alter table public.leave_requests
  add column if not exists decided_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.candidates
  add column if not exists phone text,
  add column if not exists notes text;

alter publication supabase_realtime add table public.leave_requests;
