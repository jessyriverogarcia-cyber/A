import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { overallProgress, transitionStage } from "@/lib/domain/workOrder";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;
export interface OpsCtx {
  db: Db;
  orgId: string;
  actor: string;
  actorEmployeeId?: string | null;
}

const stages = sectorConfig.workOrder.stages;
const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id;
const zoneTypeOf = (key: string | null | undefined) =>
  sectorConfig.sites.flatMap((s) => [...s.zones, ...s.outdoor]).find((z) => z.id === key)?.type ?? null;

interface WoRow {
  id: string;
  number: string;
  stage: string;
  site_id: string | null;
  zone_id: string | null;
  asset_id: string | null;
  title: string;
  traceability: unknown;
}

/**
 * Zone d'un dossier pour une étape, toujours dans le site du dossier :
 * la zone prévue par la fiche si elle existe sur ce site, sinon une zone du même type,
 * sinon (appareil à expédier) la piste ou l'eau, sinon la zone actuelle.
 */
async function zoneForStage(c: OpsCtx, wo: WoRow, stageId: string): Promise<string | null> {
  if (!wo.site_id) return wo.zone_id;
  const { data: zones } = await c.db.from("zones").select("id, key, type").eq("site_id", wo.site_id);
  const list = zones ?? [];
  const planned = stages.find((s) => s.id === stageId)?.zoneId;
  const exact = list.find((z) => z.key === planned);
  if (exact) return exact.id;
  const type = zoneTypeOf(planned);
  const sameType = type ? list.find((z) => z.type === type) : undefined;
  if (sameType) return sameType.id;
  const model = (wo.traceability as { model?: { type: string } } | null)?.model;
  if (stageId === stages.at(-1)?.id && model) {
    const out = list.find((z) => z.type === (model.type === "flying_wing" ? "water" : "runway"));
    if (out) return out.id;
  }
  return wo.zone_id;
}

async function emit(c: OpsCtx, type: string, entityId: string, payload: Record<string, unknown>) {
  await c.db.from("activity_events").insert({ org_id: c.orgId, type, entity_type: "work_order", entity_id: entityId, actor: c.actor, payload: payload as never });
}

export type MoveResult = { ok: true; from: string; to: string } | { ok: false; reason: string };

/**
 * Change l'étape d'un dossier : règle du domaine (pas de saut), historique horodaté,
 * zone sur la Map, machine libérée en sortie d'impression, événement live.
 */
export async function moveStage(c: OpsCtx, woId: string, to: string, opts: { note?: string; assetId?: string | null; event?: { type: string; payload: Record<string, unknown> } } = {}): Promise<MoveResult> {
  const { data: wo } = await c.db.from("work_orders").select("id, number, stage, site_id, zone_id, asset_id, title, traceability, assets(code)").eq("id", woId).single();
  if (!wo) return { ok: false, reason: "Dossier introuvable." };
  const t = transitionStage(stages, wo.stage, to);
  if (!t.ok) {
    return {
      ok: false,
      reason: t.reason === "skip_not_allowed" ? "On ne peut pas sauter d'étape." : t.reason === "already_last" ? "Le dossier est déjà à cette étape." : "Étape inconnue.",
    };
  }
  const now = new Date().toISOString();
  const leavingPrint = wo.stage === "printing" && to !== "printing";
  const machine = (wo.assets as unknown as { code: string } | null)?.code;
  const zone = await zoneForStage(c, wo, to);

  await c.db.from("work_order_stages").update({ left_at: now }).eq("work_order_id", wo.id).is("left_at", null);
  await c.db.from("work_order_stages").insert({ org_id: c.orgId, work_order_id: wo.id, stage: to, entered_at: now, actor_employee_id: c.actorEmployeeId ?? null, note: opts.note ?? null });

  const assetId = to === "printing" ? (opts.assetId ?? wo.asset_id) : leavingPrint ? null : wo.asset_id;
  const { error } = await c.db
    .from("work_orders")
    .update({ stage: to, stage_progress: 5, progress: overallProgress(stages, to, 5), zone_id: zone, asset_id: assetId, status: "active" })
    .eq("id", wo.id);
  if (error) return { ok: false, reason: error.message };

  if (leavingPrint && wo.asset_id) await c.db.from("assets").update({ status: "idle" }).eq("id", wo.asset_id);
  if (to === "printing" && assetId) await c.db.from("assets").update({ status: "running" }).eq("id", assetId);

  const base = { number: wo.number, of: wo.number, from: wo.stage, to, stage: stageLabel(to), site_id: wo.site_id };
  if (opts.event) await emit(c, opts.event.type, wo.id, { ...base, ...opts.event.payload });
  else if (leavingPrint) await emit(c, "work_order.stage.printing_done", wo.id, { ...base, piece: wo.title, machine, asset_id: wo.asset_id });
  else await emit(c, "work_order.stage", wo.id, base);
  return { ok: true, from: wo.stage, to };
}

/** Décision du contrôle qualité : validé → étape suivante, rejeté → retour en post-traitement (ou étape précédente). */
export async function qualityDecision(c: OpsCtx, woId: string, accepted: boolean, reason?: string | null): Promise<MoveResult> {
  const qIdx = stages.findIndex((s) => s.id === "quality");
  if (qIdx < 0) return { ok: false, reason: "La fiche secteur n'a pas d'étape « quality »." };
  const to = accepted ? stages[qIdx + 1]?.id : stages[qIdx - 1]?.id;
  if (!to) return { ok: false, reason: "Aucune étape après le contrôle." };
  return moveStage(c, woId, to, {
    note: accepted ? "CQ validé" : `CQ rejeté : ${reason ?? "non conforme"}`,
    event: { type: "work_order.qc", payload: { result: accepted ? "validé" : "rejeté", reason: accepted ? null : reason } },
  });
}

/** Clôture à l'expédition : dossier terminé, événement « expédition partie » (camion, jet ou hydravion sur la Map). */
export async function shipWorkOrder(c: OpsCtx, woId: string) {
  const { data: wo } = await c.db.from("work_orders").select("id, number, stage, site_id, traceability, clients(name)").eq("id", woId).single();
  if (!wo) return { ok: false as const, reason: "Dossier introuvable." };
  if (wo.stage !== stages.at(-1)?.id) return { ok: false as const, reason: `Le dossier doit être à l'étape « ${stages.at(-1)?.label} ».` };
  const model = (wo.traceability as { model?: { type: string } } | null)?.model;
  const mode = model?.type === "flying_wing" ? "seaplane" : model?.type === "oblique_jet" ? "jet" : "truck";
  const now = new Date().toISOString();
  await c.db.from("work_orders").update({ status: "done", progress: 100, stage_progress: 100 }).eq("id", wo.id);
  await c.db.from("work_order_stages").update({ left_at: now }).eq("work_order_id", wo.id).is("left_at", null);
  await c.db.from("activity_events").insert({
    org_id: c.orgId,
    type: "shipment.departed",
    entity_type: "work_order",
    entity_id: wo.id,
    actor: c.actor,
    payload: { number: wo.number, of: wo.number, client: (wo.clients as unknown as { name: string } | null)?.name, mode, site_id: wo.site_id },
  });
  return { ok: true as const, mode };
}

export async function setStageProgress(c: OpsCtx, woId: string, stageProgress: number) {
  const { data: wo } = await c.db.from("work_orders").select("stage").eq("id", woId).single();
  if (!wo) return;
  const p = Math.max(0, Math.min(100, Math.round(stageProgress)));
  await c.db.from("work_orders").update({ stage_progress: p, progress: overallProgress(stages, wo.stage, p) }).eq("id", woId);
}
