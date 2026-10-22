-- Durcissement signalé par l'analyseur de sécurité Supabase :
-- ces fonctions n'étaient accordées qu'aux comptes connectés, mais le droit d'exécution
-- par défaut (public) les laissait appelables sans connexion (sans effet : tout y est filtré
-- par l'organisation de l'utilisateur, nulle pour un visiteur anonyme).
revoke execute on function public.next_document_number(text, text) from public, anon;
revoke execute on function public.refresh_overdue_invoices() from public, anon;

-- Chemin de recherche figé pour la fonction de trigger commune.
alter function app.touch_updated_at() set search_path = '';
