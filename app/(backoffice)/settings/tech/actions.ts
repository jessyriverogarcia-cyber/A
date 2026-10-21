"use server";

import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Lance tout de suite le traitement quotidien pour son organisation (droit « paramètres »). */
export async function runDailyJobsAction() {
  const ctx = await requireUser();
  if (!can(ctx, "settings", "update")) redirect("/settings/tech?err=" + encodeURIComponent("Réservé à la direction."));
  const db = await createClient();
  const { data, error } = await db.rpc("run_daily_jobs");
  if (error) redirect("/settings/tech?err=" + encodeURIComponent(error.message));
  const r = data as Record<string, number>;
  redirect("/settings/tech?ok=" + encodeURIComponent(`Traitement exécuté : ${r.notifications} notification(s) envoyée(s), ${r.factures_en_retard} facture(s) passée(s) en retard, ${r.devis_expires} devis expiré(s).`));
}
