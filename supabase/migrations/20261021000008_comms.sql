-- =====================================================================
-- Communication : lu / non lu, fil interne entre collègues, stockage des documents.
-- =====================================================================

alter table public.threads
  add column if not exists read_at timestamptz,
  add column if not exists created_by_employee uuid references public.employees on delete set null,
  add column if not exists assigned_employee uuid references public.employees on delete set null;

alter table public.notifications add column if not exists created_at timestamptz not null default now();

alter table public.documents
  add column if not exists size_bytes bigint,
  add column if not exists uploaded_by text,
  add column if not exists created_at timestamptz not null default now();

-- Dernier message entrant non lu : la boîte « à répondre ».
create or replace view public.thread_overview with (security_invoker = true) as
select
  t.id, t.org_id, t.subject, t.channel, t.client_id, t.supplier_id, t.work_order_id, t.assigned_employee, t.created_by_employee, t.last_message_at, t.read_at,
  (select m.direction from public.messages m where m.thread_id = t.id and m.sent_at is not null order by m.sent_at desc limit 1) as last_direction,
  (select m.body from public.messages m where m.thread_id = t.id and m.sent_at is not null order by m.sent_at desc limit 1) as last_body,
  (select count(*) from public.messages m where m.thread_id = t.id and m.sent_at is null and m.ai_draft) as drafts,
  (select max(m.sent_at) from public.messages m where m.thread_id = t.id and m.direction = 'in') as last_inbound_at
from public.threads t;

-- Notifier un collègue (la RLS de notifications ne laisse écrire que pour soi) : même organisation uniquement.
create or replace function public.notify_employee(p_employee uuid, p_title text, p_body text, p_link text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.notifications (org_id, user_id, title, body, link)
  select p.org_id, p.user_id, p_title, p_body, p_link
  from public.profiles p
  where p.employee_id = p_employee and p.org_id = app.current_org_id();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.notify_employee(uuid, text, text, text) from public, anon;
grant execute on function public.notify_employee(uuid, text, text, text) to authenticated;

-- Stockage privé : chaque organisation écrit dans son dossier <org_id>/…
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do nothing;

create policy "documents_read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = app.current_org_id()::text and app.has_perm('comms', 'read'));
create policy "documents_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = app.current_org_id()::text and app.has_perm('comms', 'create'));
create policy "documents_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = app.current_org_id()::text and app.has_perm('comms', 'delete'));

alter publication supabase_realtime add table public.messages, public.threads;

-- Un brouillon non envoyé se remplace ou s'écarte avec le droit d'écrire (pas besoin du droit de suppression).
create policy "drafts_delete" on public.messages for delete to authenticated
  using (org_id = app.current_org_id() and sent_at is null and app.has_perm('comms', 'create'));
