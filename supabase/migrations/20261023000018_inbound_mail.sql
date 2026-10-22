-- E-mails entrants relevés dans la boîte connectée : dédoublonnage par identifiant du fournisseur,
-- curseur de dernière relève.
alter table public.messages add column if not exists external_id text;
create unique index if not exists messages_external on public.messages (org_id, external_id) where external_id is not null;
alter table public.integration_accounts add column if not exists inbox_synced_at timestamptz;
grant select (inbox_synced_at) on public.integration_accounts to authenticated;
