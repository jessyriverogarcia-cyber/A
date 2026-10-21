import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Client service (contourne la RLS) — uniquement côté serveur, pour le moteur de démo et les tâches planifiées. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
