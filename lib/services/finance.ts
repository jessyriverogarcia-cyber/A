import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { computeQuoteTotals } from "@/lib/domain/quote";
import { fromCents, toCents } from "@/lib/domain/money";
import { depositLine, finalInvoiceLines, type SourceLine } from "@/lib/domain/invoice";
import type { Database } from "@/lib/supabase/database.types";
import { nextNumber } from "./crm";

type Db = SupabaseClient<Database>;
const cfg = sectorConfig;

export function invoiceTotals(lines: SourceLine[]) {
  const t = computeQuoteTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: toCents(l.unit_price), unitCost: 0, discount: l.discount })),
    cfg.company.vatRate,
    cfg.company.rounding,
  );
  return { total_ht: fromCents(t.net), total_vat: fromCents(t.vat), total_ttc: fromCents(t.gross) };
}

/** Remplace les lignes d'une facture brouillon et recalcule ses totaux (toujours côté serveur). */
export async function saveInvoiceLines(db: Db, orgId: string, invoiceId: string, lines: SourceLine[]) {
  await db.from("invoice_lines").delete().eq("invoice_id", invoiceId);
  if (lines.length) {
    const { error } = await db.from("invoice_lines").insert(
      lines.map((l, i) => ({ org_id: orgId, invoice_id: invoiceId, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount: l.discount, catalog_item_id: l.catalog_item_id ?? null, vat_rate: cfg.company.vatRate, position: i })),
    );
    if (error) throw new Error(error.message);
  }
  const { error } = await db.from("invoices").update(invoiceTotals(lines)).eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

/**
 * Facture d'un dossier, sans ressaisie : « final » reprend les lignes du devis moins les
 * acomptes déjà facturés ; « deposit » facture un pourcentage du devis.
 */
export async function createInvoiceFromWorkOrder(db: Db, orgId: string, woId: string, kind: "final" | "deposit", ratio = 0.3) {
  const { data: wo } = await db
    .from("work_orders")
    .select("id, number, client_id, quote_id, quotes(number, total_ht, contact_id, quote_lines(description, quantity, unit_price, discount, catalog_item_id, position)), invoices(id, number, kind, status, total_ht)")
    .eq("id", woId)
    .single();
  if (!wo) throw new Error("Dossier introuvable.");
  const quote = wo.quotes as unknown as { number: string; total_ht: number; contact_id: string | null; quote_lines: (SourceLine & { position: number })[] } | null;
  const existing = ((wo.invoices ?? []) as { id: string; number: string; kind: string; status: string; total_ht: number }[]).filter((i) => i.status !== "cancelled");
  if (kind === "final" && existing.some((i) => i.kind === "invoice")) throw new Error("Ce dossier a déjà une facture finale.");

  let lines: SourceLine[];
  if (kind === "deposit") {
    if (!quote) throw new Error("Pas de devis : impossible de calculer un acompte.");
    lines = [depositLine(quote.number, Number(quote.total_ht), ratio)];
  } else {
    const quoteLines = (quote?.quote_lines ?? [])
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount: Number(l.discount), catalog_item_id: l.catalog_item_id }));
    if (!quoteLines.length) {
      // Dossier sans devis : on facture les heures facturables saisies.
      const { data: hours } = await db.from("time_entries").select("hours").eq("work_order_id", woId).eq("billable", true);
      const total = (hours ?? []).reduce((s, h) => s + Number(h.hours), 0);
      quoteLines.push({ description: `Main-d'œuvre — ${wo.number}`, quantity: total, unit_price: cfg.crm.defaultHourlyRate, discount: 0, catalog_item_id: null });
    }
    const deposits = existing.filter((i) => i.kind === "deposit").map((i) => ({ number: i.number, amount: Number(i.total_ht) }));
    lines = finalInvoiceLines(quoteLines, deposits);
  }

  const today = new Date();
  const { data: terms } = await db.from("clients").select("payment_terms_days").eq("id", wo.client_id).single();
  const due = new Date(today.getTime() + (terms?.payment_terms_days ?? cfg.crm.paymentTermsDays) * 86_400_000);
  const { data: inv, error } = await db
    .from("invoices")
    .insert({
      org_id: orgId,
      client_id: wo.client_id,
      work_order_id: wo.id,
      quote_id: wo.quote_id,
      contact_id: quote?.contact_id ?? null,
      kind: kind === "deposit" ? "deposit" : "invoice",
      number: await nextNumber(db, "invoices", cfg.crm.invoicePrefix),
      status: "draft",
      issue_date: today.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
    })
    .select("id, number")
    .single();
  if (error) throw new Error(error.message);
  await saveInvoiceLines(db, orgId, inv.id, lines);
  return inv;
}
