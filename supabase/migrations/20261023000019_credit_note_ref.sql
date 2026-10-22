-- Avoir : facture d'origine (exigée dans la facture électronique, règle BR-FR-CO-05).
alter table public.invoices add column if not exists corrects_invoice_id uuid references public.invoices on delete set null;
