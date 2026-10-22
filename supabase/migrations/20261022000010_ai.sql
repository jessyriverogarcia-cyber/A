-- =====================================================================
-- Assistant IA : conversations privées par utilisateur, historique complet des échanges
-- (blocs de contenu de l'API conservés tels quels pour rejouer la conversation).
-- =====================================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs on delete cascade,
  conversation_id uuid not null references public.ai_conversations on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,           -- blocs de contenu de l'API (texte, appels d'outils, résultats)
  text text,                        -- texte lisible, pour l'affichage
  tools text[] not null default '{}',
  model text,
  simulated boolean not null default false,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index ai_messages_conv on public.ai_messages (conversation_id, id);
create index ai_conversations_user on public.ai_conversations (user_id, updated_at desc);

-- Chacun ne voit que ses conversations (et seulement avec le droit « ai:read »).
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
create policy "own" on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and org_id = app.current_org_id() and app.has_perm('ai', 'read'))
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.has_perm('ai', 'read'));
create policy "own" on public.ai_messages for all to authenticated
  using (org_id = app.current_org_id() and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (org_id = app.current_org_id() and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
