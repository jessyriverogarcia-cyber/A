import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { averageDailyUse, reorderQuantity } from "@/lib/domain/stock";
import type { Database } from "@/lib/supabase/database.types";
import { nextNumber } from "./crm";

type Db = SupabaseClient<Database>;
export interface PoLine {
  stock_item_id: string;
  sku: string;
  label: string;
  qty: number;
  unit: string;
  unit_cost: number;
}

const PO_PREFIX = "CMD";

/**
 * Réassort en un clic : pour chaque article, quantité calculée (minimum, consommation des
 * 30 derniers jours, délai fournisseur, conditionnement), regroupée en un bon par fournisseur.
 * Un article déjà présent sur un bon non reçu n'est pas recommandé deux fois.
 */
export async function createReorders(db: Db, orgId: string, itemIds: string[]) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: items }, { data: moves }, { data: open }] = await Promise.all([
    db.from("stock_items").select("id, sku, label, unit, quantity, min_quantity, unit_cost, pack_size, supplier_id, suppliers(lead_time_days)").in("id", itemIds),
    db.from("stock_movements").select("stock_item_id, delta, at").in("stock_item_id", itemIds).gte("at", since),
    db.from("purchase_orders").select("id, lines").in("status", ["draft", "sent"]),
  ]);
  const pending = new Set(((open ?? []) as unknown as { lines: PoLine[] }[]).flatMap((p) => p.lines.map((l) => l.stock_item_id)));
  const bySupplier = new Map<string, { lead: number; lines: PoLine[] }>();
  const skipped: string[] = [];

  for (const it of items ?? []) {
    if (!it.supplier_id || pending.has(it.id)) {
      skipped.push(it.label);
      continue;
    }
    const lead = (it.suppliers as unknown as { lead_time_days: number | null } | null)?.lead_time_days ?? 7;
    const use = averageDailyUse((moves ?? []).filter((m) => m.stock_item_id === it.id).map((m) => ({ delta: Number(m.delta), at: m.at })), 30);
    const qty = reorderQuantity({ quantity: Number(it.quantity), min: Number(it.min_quantity), dailyUse: use, leadTimeDays: lead, packSize: Number(it.pack_size) });
    if (qty <= 0) {
      skipped.push(it.label);
      continue;
    }
    const entry = bySupplier.get(it.supplier_id) ?? { lead, lines: [] };
    entry.lead = Math.max(entry.lead, lead);
    entry.lines.push({ stock_item_id: it.id, sku: it.sku, label: it.label, qty, unit: it.unit, unit_cost: Number(it.unit_cost ?? 0) });
    bySupplier.set(it.supplier_id, entry);
  }

  const created: { id: string; number: string }[] = [];
  for (const [supplierId, { lead, lines }] of bySupplier) {
    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.unit_cost, 0) * 100) / 100;
    const { data, error } = await db
      .from("purchase_orders")
      .insert({
        org_id: orgId,
        supplier_id: supplierId,
        number: await nextNumber(db, "purchase_orders", PO_PREFIX),
        status: "draft",
        total,
        expected_on: new Date(Date.now() + lead * 86_400_000).toISOString().slice(0, 10),
        lines: lines as never,
      })
      .select("id, number")
      .single();
    if (error) throw new Error(error.message);
    created.push(data);
  }
  return { created, skipped };
}

export const poTotal = (lines: PoLine[]) => Math.round(lines.reduce((s, l) => s + l.qty * l.unit_cost, 0) * 100) / 100;
