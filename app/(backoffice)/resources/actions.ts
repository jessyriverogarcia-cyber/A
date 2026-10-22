"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import type { Action } from "@/lib/domain/permissions";
import { addDays } from "@/lib/domain/stock";
import { todayIso } from "@/lib/domain/kpis";
import { sectorConfig } from "@/config/sector.config";
import { getMailProvider } from "@/lib/integrations/mail";
import { pushSharedEvent } from "@/lib/integrations/calendar";
import { zonedToIso } from "@/lib/domain/hr";
import { createReorders, poTotal, type PoLine } from "@/lib/services/resources";
import { createClient } from "@/lib/supabase/server";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function guard(action: Action) {
  const ctx = await requireUser();
  if (!can(ctx, "resources", action)) throw new Error("Droits insuffisants sur les Ressources.");
  return { ctx, db: await createClient() };
}

async function emit(db: Awaited<ReturnType<typeof createClient>>, orgId: string, actor: string, type: string, entity_type: string, entity_id: string, payload: Record<string, unknown>) {
  await db.from("activity_events").insert({ org_id: orgId, type, entity_type, entity_id, actor, payload: payload as never });
}

// --- Réassort et commandes fournisseurs -----------------------------------------

export async function reorderAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const ids = form.getAll("item_id").map(String).filter(Boolean);
  const back = str(form.get("back")) ?? "/resources";
  if (!ids.length) redirect(`${back}?err=${q("Aucun article sélectionné.")}`);
  let result: Awaited<ReturnType<typeof createReorders>>;
  try {
    result = await createReorders(db, ctx.org.id, ids);
  } catch (e) {
    redirect(`${back}?err=${q(e instanceof Error ? e.message : "Erreur")}`);
  }
  if (result.created.length === 1) redirect(`/resources/purchase-orders/${result.created[0].id}?ok=${q("Bon de commande pré-rempli : vérifiez les quantités puis envoyez-le.")}`);
  const msg = result.created.length
    ? `${result.created.length} bons de commande créés (${result.created.map((c) => c.number).join(", ")}).`
    : "Rien à commander (déjà en commande ou stock suffisant).";
  redirect(`/resources/purchase-orders?ok=${q(msg + (result.skipped.length ? ` Ignorés : ${result.skipped.join(", ")}.` : ""))}`);
}

const linesSchema = z.array(z.object({ stock_item_id: z.string().uuid(), sku: z.string(), label: z.string(), qty: z.number().positive(), unit: z.string(), unit_cost: z.number().min(0) }));

export async function updatePoLinesAction(form: FormData) {
  const { db } = await guard("update");
  const id = String(form.get("po_id"));
  const { data: po } = await db.from("purchase_orders").select("status, lines").eq("id", id).single();
  if (po?.status !== "draft") redirect(`/resources/purchase-orders/${id}?err=${q("Seul un brouillon est modifiable.")}`);
  const lines = (po.lines as unknown as PoLine[])
    .map((l) => ({ ...l, qty: Number(form.get(`qty_${l.stock_item_id}`) ?? l.qty) }))
    .filter((l) => l.qty > 0);
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success) redirect(`/resources/purchase-orders/${id}?err=${q("Quantités invalides.")}`);
  await db.from("purchase_orders").update({ lines: parsed.data as never, total: poTotal(parsed.data), expected_on: str(form.get("expected_on")), notes: str(form.get("notes")) }).eq("id", id);
  redirect(`/resources/purchase-orders/${id}?ok=${q("Commande mise à jour.")}`);
}

export async function sendPoAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("po_id"));
  const { data: po } = await db.from("purchase_orders").select("number, status, supplier_id, suppliers(email)").eq("id", id).single();
  if (!po || po.status !== "draft") redirect(`/resources/purchase-orders/${id}?err=${q("Commande déjà envoyée.")}`);
  const res = await (await getMailProvider(db, ctx.org.id)).send({
    to: (po.suppliers as unknown as { email: string | null } | null)?.email ?? null,
    subject: String(form.get("subject")),
    body: String(form.get("body")),
    supplierId: po.supplier_id,
    author: ctx.full_name,
  });
  if (!res.ok) redirect(`/resources/purchase-orders/${id}?err=${q(res.reason ?? "Échec de l'envoi")}`);
  await db.from("purchase_orders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  await emit(db, ctx.org.id, ctx.user_id, "purchase_order.sent", "purchase_order", id, { number: po.number });
  redirect(`/resources/purchase-orders/${id}?ok=${q(`Commande envoyée au fournisseur${res.simulated ? " (simulation)" : ""}.`)}`);
}

/** Réception totale (« tout le reste ») ou partielle (quantités saisies par ligne). */
export async function receivePoAction(form: FormData) {
  const { db } = await guard("update");
  const id = String(form.get("po_id"));
  const partial = form.get("mode") === "partial";
  const qty: Record<string, number> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("recv_")) qty[k.slice(5)] = Number(String(v).replace(",", ".")) || 0;
  const { data, error } = await db.rpc("receive_purchase_order_lines", { p_po: id, p_qty: (partial ? qty : null) as never, p_note: str(form.get("note")) ?? undefined });
  if (error) redirect(`/resources/purchase-orders/${id}?err=${q(error.message)}`);
  const r = data as { received: boolean; lines: number; status: string };
  if (!r.received) redirect(`/resources/purchase-orders/${id}?err=${q("Rien à réceptionner : saisissez au moins une quantité reçue.")}`);
  redirect(`/resources/purchase-orders/${id}?ok=${q(r.status === "received" ? `Commande soldée : ${r.lines} article(s) remis en stock — les rayonnages de la Map se remplissent.` : `Réception partielle enregistrée (${r.lines} article(s)). Le reliquat reste attendu.`)}`);
}

export async function cancelPoAction(form: FormData) {
  const { db } = await guard("update");
  const id = String(form.get("po_id"));
  await db.from("purchase_orders").update({ status: "cancelled" }).eq("id", id).in("status", ["draft", "sent", "partially_received"]);
  redirect(`/resources/purchase-orders/${id}?ok=${q("Commande annulée.")}`);
}

// --- Mouvements de stock -------------------------------------------------------------

export async function stockMovementAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("item_id"));
  const kind = String(form.get("kind"));
  const qty = Number(form.get("qty"));
  if (!(qty >= 0) || (kind !== "inventory" && qty === 0)) redirect(`/resources/stock/${id}?err=${q("Quantité invalide.")}`);
  const { data: item } = await db.from("stock_items").select("quantity, min_quantity, label, sku, unit").eq("id", id).single();
  if (!item) redirect(`/resources/stock?err=${q("Article introuvable.")}`);
  const current = Number(item.quantity);
  const delta = kind === "in" ? qty : kind === "out" ? -qty : qty - current;
  const next = Math.max(0, current + delta);
  const reason = str(form.get("reason")) ?? (kind === "in" ? "entrée manuelle" : kind === "out" ? "sortie manuelle" : "inventaire");
  await db.from("stock_items").update({ quantity: next }).eq("id", id);
  await db.from("stock_movements").insert({ org_id: ctx.org.id, stock_item_id: id, delta, reason, work_order_id: str(form.get("wo_id")) });
  // Le passage sous le minimum déclenche l'alerte (Map, fil d'activité, tuile « à faire »).
  if (current >= Number(item.min_quantity) && next < Number(item.min_quantity)) {
    await emit(db, ctx.org.id, ctx.user_id, "stock.low", "stock_item", id, { sku: item.sku, label: item.label, matiere: item.label, quantity: next, unit: item.unit });
  }
  redirect(`/resources/stock/${id}?ok=${q(`Stock mis à jour : ${next} ${item.unit}.`)}`);
}

// --- Équipements -------------------------------------------------------------------------

export async function assetStatusAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("asset_id"));
  const status = String(form.get("status"));
  if (!["idle", "running", "maintenance", "down", "offline"].includes(status)) redirect(`/resources/equipment/${id}`);
  const { data: a } = await db.from("assets").select("code, status").eq("id", id).single();
  await db.from("assets").update({ status }).eq("id", id);
  if (a && a.status !== status) {
    const type = status === "down" ? "asset.down" : a.status === "down" || a.status === "maintenance" ? "asset.repaired" : "asset.status";
    await emit(db, ctx.org.id, ctx.user_id, type, "asset", id, { machine: a.code, code: a.code, status });
  }
  redirect(`/resources/equipment/${id}?ok=${q("État mis à jour — visible sur la Map.")}`);
}

export async function maintenanceDoneAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("asset_id"));
  const { data: a } = await db.from("assets").select("code, status, maintenance_interval_days").eq("id", id).single();
  if (!a) redirect(`/resources/equipment?err=${q("Équipement introuvable.")}`);
  const today = todayIso(sectorConfig.company.timezone);
  await db.from("assets").update({ last_maintenance_on: today, next_maintenance_on: addDays(today, a.maintenance_interval_days), status: a.status === "maintenance" || a.status === "down" ? "idle" : a.status }).eq("id", id);
  await emit(db, ctx.org.id, ctx.user_id, "asset.repaired", "asset", id, { machine: a.code, code: a.code, maintenance: true });
  redirect(`/resources/equipment/${id}?ok=${q(`Maintenance enregistrée — prochaine dans ${a.maintenance_interval_days} jours.`)}`);
}

export async function scheduleMaintenanceAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("asset_id"));
  const date = str(form.get("date"));
  if (!date) redirect(`/resources/equipment/${id}?err=${q("Date requise.")}`);
  const { data: a } = await db.from("assets").select("code, name").eq("id", id).single();
  await db.from("assets").update({ next_maintenance_on: date }).eq("id", id);
  const tz = sectorConfig.company.timezone;
  const ev = { title: `Maintenance ${a?.code ?? ""} — ${a?.name ?? ""}`, start: zonedToIso(date, "07:00", tz), end: zonedToIso(date, "12:00", tz) };
  const pushed = await pushSharedEvent(db, ev, tz);
  await db.from("calendar_events").insert({ org_id: ctx.org.id, asset_id: id, kind: "maintenance", title: ev.title, starts_at: ev.start, ends_at: ev.end, external_source: pushed?.provider ?? null, external_id: pushed?.id ?? null, synced_at: pushed ? new Date().toISOString() : null });
  redirect(`/resources/equipment/${id}?ok=${q("Maintenance planifiée et ajoutée au planning.")}`);
}

// --- Fournisseurs ------------------------------------------------------------------

const Supplier = z.object({
  name: z.string().trim().min(2, "Nom obligatoire"),
  category: z.string().trim().nullable(),
  contact_name: z.string().trim().nullable(),
  email: z.string().trim().email("E-mail invalide").nullable(),
  phone: z.string().trim().nullable(),
  address: z.string().trim().nullable(),
  vat_number: z.string().trim().nullable(),
  siret: z.string().trim().regex(/^\d{14}$/, "SIRET : 14 chiffres").nullable(),
  lead_time_days: z.coerce.number().int().min(0).max(365).nullable(),
  payment_terms_days: z.coerce.number().int().min(0).max(120),
  notes: z.string().trim().nullable(),
});

function supplierFrom(form: FormData) {
  const v = (k: string) => {
    const x = str(form.get(k));
    return k === "siret" && x ? x.replace(/\s/g, "") : x;
  };
  return Supplier.safeParse({
    name: v("name") ?? "", category: v("category"), contact_name: v("contact_name"), email: v("email"), phone: v("phone"), address: v("address"),
    vat_number: v("vat_number"), siret: v("siret"), lead_time_days: v("lead_time_days"), payment_terms_days: v("payment_terms_days") ?? 30, notes: v("notes"),
  });
}

export async function createSupplierAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const p = supplierFrom(form);
  if (!p.success) redirect(`/resources/suppliers/new?err=${q(p.error.issues[0].message)}`);
  const { data, error } = await db.from("suppliers").insert({ org_id: ctx.org.id, ...p.data }).select("id").single();
  if (error) redirect(`/resources/suppliers/new?err=${q(error.message)}`);
  redirect(`/resources/suppliers/${data.id}?ok=${q("Fournisseur créé.")}`);
}

export async function updateSupplierAction(form: FormData) {
  const { db } = await guard("update");
  const id = String(form.get("supplier_id"));
  const p = supplierFrom(form);
  if (!p.success) redirect(`/resources/suppliers/${id}?err=${q(p.error.issues[0].message)}`);
  const { error } = await db.from("suppliers").update(p.data).eq("id", id);
  if (error) redirect(`/resources/suppliers/${id}?err=${q(error.message)}`);
  redirect(`/resources/suppliers/${id}?ok=${q("Fiche fournisseur enregistrée.")}`);
}

/** Un fournisseur qui a des commandes s'archive (l'historique reste) ; sinon il peut être supprimé. */
export async function archiveSupplierAction(form: FormData) {
  const { db } = await guard("update");
  const id = String(form.get("supplier_id"));
  const active = form.get("active") === "true";
  await db.from("suppliers").update({ active }).eq("id", id);
  redirect(`/resources/suppliers/${id}?ok=${q(active ? "Fournisseur réactivé." : "Fournisseur archivé : il n'est plus proposé au réassort.")}`);
}

export async function deleteSupplierAction(form: FormData) {
  const { db } = await guard("delete");
  const id = String(form.get("supplier_id"));
  const { count } = await db.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id);
  if (count) redirect(`/resources/suppliers/${id}?err=${q("Ce fournisseur a des commandes : archivez-le plutôt.")}`);
  await db.from("stock_items").update({ supplier_id: null }).eq("supplier_id", id);
  const { error } = await db.from("suppliers").delete().eq("id", id);
  if (error) redirect(`/resources/suppliers/${id}?err=${q(error.message)}`);
  redirect(`/resources/suppliers?ok=${q("Fournisseur supprimé.")}`);
}
