"use server";

import { z } from "zod";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { runScenarioEvent, type ScenarioResult } from "@/lib/map/scenario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Déclenche un événement live du scénario de démo (écritures réelles en base). */
export async function triggerLiveEvent(siteKey: string, eventId: string): Promise<ScenarioResult> {
  const ctx = await requireUser();
  // Le scénario écrit des événements fictifs avec la clé service : réservé au mode démo.
  if (!isDemoMode()) return { ok: false, reason: "Scénario de démonstration désactivé hors mode démo." };
  if (!sectorConfig.liveEvents.some((e) => e.id === eventId)) return { ok: false, reason: "Événement inconnu." };

  // Le moteur de démo écrit avec la clé service : il touche plusieurs modules (CRM, stock, RH)
  // que le rôle connecté n'a pas forcément le droit de modifier. L'acteur reste tracé.
  const db = createAdminClient();
  const { data: site } = await db.from("sites").select("id").eq("org_id", ctx.org.id).eq("key", siteKey).single();
  if (!site) return { ok: false, reason: "Site introuvable." };
  try {
    return await runScenarioEvent({ db, orgId: ctx.org.id, siteId: site.id, actor: ctx.user_id }, eventId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

const layoutSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      position: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
      rotation: z.number().finite(),
    }),
  )
  .max(500);

/** Enregistre les déplacements du mode édition du plan (RLS : droit map:update). */
export async function saveLayout(changes: unknown): Promise<{ ok: boolean; saved: number; reason?: string }> {
  const ctx = await requireUser();
  if (!can(ctx, "map", "update")) return { ok: false, saved: 0, reason: "Droits insuffisants." };
  const parsed = layoutSchema.safeParse(changes);
  if (!parsed.success) return { ok: false, saved: 0, reason: "Données invalides." };

  const supabase = await createClient();
  let saved = 0;
  for (const c of parsed.data) {
    const { error, count } = await supabase
      .from("map_objects")
      .update({ position: c.position, rotation: c.rotation }, { count: "exact" })
      .eq("id", c.id);
    if (error) return { ok: false, saved, reason: error.message };
    saved += count ?? 0;
  }
  if (saved) {
    await supabase.from("activity_events").insert({
      org_id: ctx.org.id,
      type: "floor_plan.updated",
      entity_type: "floor_plan",
      payload: { objects: saved, name: ctx.full_name },
      actor: ctx.user_id,
    });
  }
  return { ok: true, saved };
}
