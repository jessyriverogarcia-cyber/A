"use server";

import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function disconnectAction(form: FormData) {
  const ctx = await requireUser();
  if (!can(ctx, "settings", "update")) redirect("/settings/integrations?err=" + encodeURIComponent("Réservé à la direction."));
  const provider = String(form.get("provider"));
  const db = await createClient();
  const { error } = await db.rpc("remove_integration", { p_provider: provider });
  if (error) redirect("/settings/integrations?err=" + encodeURIComponent(error.message));
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "integration.disconnected", entity_type: "integration", actor: ctx.user_id, payload: { provider } });
  redirect("/settings/integrations?ok=" + encodeURIComponent("Boîte déconnectée : retour à l'envoi simulé."));
}
