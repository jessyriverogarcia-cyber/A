import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { formatDocumentNumber } from "@/lib/domain/quote";
import { nextStage, overallProgress } from "@/lib/domain/workOrder";
import { todayIso } from "@/lib/domain/kpis";
import { acceptQuote } from "@/lib/services/crm";
import { moveStage, qualityDecision, shipWorkOrder, type OpsCtx } from "@/lib/services/ops";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Moteur du scénario de démo : chaque événement live de la fiche secteur écrit de VRAIES
 * lignes (OF, machines, stock, badges…) puis un activity_event. La Map et le back-office
 * réagissent via Realtime, exactement comme pour une action humaine.
 */

type Ctx = { db: SupabaseClient; orgId: string; siteId: string; actor: string };
export type ScenarioResult = { ok: true; summary: string } | { ok: false; reason: string };

const stages = sectorConfig.workOrder.stages;
const ops = (c: Ctx): OpsCtx => ({ db: c.db as SupabaseClient<Database>, orgId: c.orgId, actor: c.actor });
const stageZone = (stageId: string) => stages.find((s) => s.id === stageId)?.zoneId ?? null;
const pick = <T>(rows: T[]): T | undefined => rows[Math.floor(Math.random() * rows.length)];

async function zoneId(c: Ctx, key: string | null): Promise<string | null> {
  if (!key) return null;
  const { data } = await c.db.from("zones").select("id").eq("org_id", c.orgId).eq("key", key).maybeSingle();
  return data?.id ?? null;
}

async function emit(c: Ctx, type: string, entity_type: string, entity_id: string, payload: Record<string, unknown>) {
  const { error } = await c.db
    .from("activity_events")
    .insert({ org_id: c.orgId, type, entity_type, entity_id, actor: c.actor, payload: { site_id: c.siteId, ...payload } });
  if (error) throw new Error(error.message);
}

async function nextNumber(c: Ctx, table: "work_orders" | "quotes", prefix: string) {
  const { count } = await c.db.from(table).select("id", { count: "exact", head: true }).eq("org_id", c.orgId);
  return formatDocumentNumber(prefix, new Date().getFullYear(), (count ?? 0) + 1 + Math.floor(Math.random() * 3));
}

async function createWorkOrder(c: Ctx, client: { id: string; name: string; product_family: string | null }, title: string, quoteId: string | null) {
  const family = sectorConfig.productFamilies.find((f) => f.id === client.product_family) ?? sectorConfig.productFamilies[0];
  const zone = await zoneId(c, stageZone(stages[0].id));
  const due = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: wo, error } = await c.db
    .from("work_orders")
    .insert({
      org_id: c.orgId,
      site_id: c.siteId,
      number: await nextNumber(c, "work_orders", sectorConfig.workOrder.shortCode),
      client_id: client.id,
      quote_id: quoteId,
      title,
      product_family: family.id,
      technology: family.technologies[0],
      physical_object: title,
      stage: stages[0].id,
      stage_progress: 10,
      progress: overallProgress(stages, stages[0].id, 10),
      zone_id: zone,
      hours_budget: 24,
      due_date: due,
    })
    .select("id, number")
    .single();
  if (error) throw new Error(error.message);
  await c.db.from("work_order_stages").insert({ org_id: c.orgId, work_order_id: wo.id, stage: stages[0].id });
  return wo;
}

const handlers: Record<string, (c: Ctx) => Promise<ScenarioResult>> = {
  async new_order(c) {
    const { data: clients } = await c.db.from("clients").select("id, name, product_family").eq("org_id", c.orgId).eq("status", "active");
    const client = pick(clients ?? []);
    if (!client) return { ok: false, reason: "Aucun client actif." };
    const family = sectorConfig.productFamilies.find((f) => f.id === client.product_family);
    const wo = await createWorkOrder(c, client, `${family?.label ?? "Commande"} — nouvelle demande`, null);
    await emit(c, "work_order.created", "work_order", wo.id, { number: wo.number, client: client.name });
    return { ok: true, summary: `${wo.number} créé pour ${client.name}` };
  },

  async quote_signed(c) {
    const { data: quotes } = await c.db.from("quotes").select("id, number, clients(name)").eq("org_id", c.orgId).eq("status", "sent");
    const q = pick(quotes ?? []);
    if (!q) return { ok: false, reason: "Aucun devis envoyé en attente de signature." };
    // Même chemin que le bouton « Accepté » du back-office : zéro double saisie.
    const wo = await acceptQuote(c.db as SupabaseClient<Database>, q.id);
    return { ok: true, summary: `Devis ${q.number} signé → ${wo.number}` };
  },

  async print_done(c) {
    const { data: wos } = await c.db.from("work_orders").select("id, number").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("stage", "printing").eq("status", "active").not("asset_id", "is", null);
    const wo = pick(wos ?? []);
    if (!wo) return { ok: false, reason: "Aucune impression en cours sur ce site." };
    const next = nextStage(stages, "printing")!.id;
    const r = await moveStage(ops(c), wo.id, next);
    return r.ok ? { ok: true, summary: `${wo.number} terminé` } : { ok: false, reason: r.reason };
  },
  async qc_result(c) {
    const { data: wos } = await c.db.from("work_orders").select("id, number").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("stage", "quality").eq("status", "active");
    const wo = pick(wos ?? []);
    if (!wo) return { ok: false, reason: "Aucune pièce en contrôle qualité sur ce site." };
    const accepted = Math.random() < 0.7;
    const r = await qualityDecision(ops(c), wo.id, accepted, accepted ? null : "Écart dimensionnel hors tolérance — reprise en post-traitement");
    return r.ok ? { ok: true, summary: `CQ ${accepted ? "validé" : "rejeté"} pour ${wo.number}` } : { ok: false, reason: r.reason };
  },
  async shipment_left(c) {
    const { data: wos } = await c.db.from("work_orders").select("id, number").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("stage", stages.at(-1)!.id).eq("status", "active");
    const wo = pick(wos ?? []);
    if (!wo) return { ok: false, reason: "Rien n'attend d'expédition sur ce site." };
    const r = await shipWorkOrder(ops(c), wo.id);
    return r.ok ? { ok: true, summary: `${wo.number} expédié (${r.mode})` } : { ok: false, reason: r.reason };
  },
  async low_stock(c) {
    const { data: items } = await c.db.from("stock_items").select("id, sku, label, quantity, min_quantity, unit").eq("org_id", c.orgId).gt("min_quantity", 0);
    const candidates = (items ?? []).filter((s) => Number(s.quantity) >= Number(s.min_quantity));
    const item = pick(candidates.length ? candidates : items ?? []);
    if (!item) return { ok: false, reason: "Aucun article suivi en stock." };
    const target = Math.max(0, Math.round(Number(item.min_quantity) * 0.6 * 10) / 10);
    const delta = target - Number(item.quantity);
    await c.db.from("stock_items").update({ quantity: target }).eq("id", item.id);
    await c.db.from("stock_movements").insert({ org_id: c.orgId, stock_item_id: item.id, delta, reason: "consommation OF" });
    await emit(c, "stock.low", "stock_item", item.id, { sku: item.sku, label: item.label, matiere: item.label, quantity: target, unit: item.unit });
    return { ok: true, summary: `Stock bas : ${item.label}` };
  },

  async machine_down(c) {
    const { data: down } = await c.db.from("assets").select("id, code, name").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("status", "down");
    const repaired = pick(down ?? []);
    if (repaired) {
      // Deuxième passage : la machine en panne est réparée (cycle complet pour la démo).
      await c.db.from("assets").update({ status: "running", last_maintenance_on: todayIso(sectorConfig.company.timezone) }).eq("id", repaired.id);
      await emit(c, "asset.repaired", "asset", repaired.id, { machine: repaired.code, code: repaired.code });
      return { ok: true, summary: `${repaired.code} réparée` };
    }
    const { data: running } = await c.db.from("assets").select("id, code").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("kind", "machine").eq("status", "running");
    const m = pick(running ?? []);
    if (!m) return { ok: false, reason: "Aucune machine en production sur ce site." };
    await c.db.from("assets").update({ status: "down" }).eq("id", m.id);
    await emit(c, "asset.down", "asset", m.id, { machine: m.code, code: m.code });
    return { ok: true, summary: `${m.code} en panne` };
  },

  async badge_in(c) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [{ data: emps }, { data: badges }, { data: leaves }] = await Promise.all([
      c.db.from("employees").select("id, first_name, last_name, home_zone_id").eq("org_id", c.orgId).eq("site_id", c.siteId).eq("active", true),
      c.db.from("badge_events").select("employee_id, kind, at").eq("org_id", c.orgId).gte("at", since.toISOString()).order("at"),
      c.db.from("leave_requests").select("employee_id").eq("org_id", c.orgId).eq("status", "approved").lte("starts_on", todayIso(sectorConfig.company.timezone)).gte("ends_on", todayIso(sectorConfig.company.timezone)),
    ]);
    const last = new Map<string, string>();
    for (const b of badges ?? []) last.set(b.employee_id, b.kind);
    const onLeave = new Set((leaves ?? []).map((l) => l.employee_id));
    const back = (emps ?? []).filter((e) => last.get(e.id) === "break_start");
    const arriving = (emps ?? []).filter((e) => (!last.has(e.id) || last.get(e.id) === "out") && !onLeave.has(e.id));
    const out = (emps ?? []).filter((e) => last.get(e.id) === "in" || last.get(e.id) === "break_end");
    // Alterne arrivées, retours de pause et départs en pause pour que la scène vive.
    const [kind, e] = arriving.length
      ? (["in", pick(arriving)] as const)
      : back.length
        ? (["break_end", pick(back)] as const)
        : (["break_start", pick(out)] as const);
    if (!e) return { ok: false, reason: "Personne à badger sur ce site." };
    await c.db.from("badge_events").insert({ org_id: c.orgId, employee_id: e.id, kind, reader: "BADGE-ACC" });
    const personne = `${e.first_name} ${e.last_name}`;
    await emit(c, kind === "break_start" ? "badge.break_start" : "badge.in", "employee", e.id, { personne, name: personne, kind });
    return { ok: true, summary: `${personne} : ${kind}` };
  },
};

export async function runScenarioEvent(c: Ctx, eventId: string): Promise<ScenarioResult> {
  const handler = handlers[eventId];
  if (!handler) return { ok: false, reason: `Événement inconnu : ${eventId}` };
  return handler(c);
}
