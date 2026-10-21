import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { QuoteDocument, type QuotePdfData } from "./QuoteDocument";

type Db = SupabaseClient<Database>;

/** PDF d'un devis, calculé à la demande avec les droits (RLS) du client Supabase passé. */
export async function renderQuotePdf(db: Db, id: string): Promise<{ name: string; data: Buffer } | null> {
  const { data: q } = await db
    .from("quotes")
    .select("number, issue_date, valid_until, notes, total_ht, total_vat, total_ttc, clients(name, city, vat_number, address), contacts(first_name, last_name, email), deals(title), quote_lines(description, quantity, unit_price, discount, position, catalog_items(unit))")
    .eq("id", id)
    .maybeSingle();
  if (!q) return null;

  const data: QuotePdfData = {
    number: q.number,
    issue_date: q.issue_date,
    valid_until: q.valid_until,
    notes: q.notes,
    title: (q.deals as unknown as { title: string } | null)?.title ?? `Devis ${q.number}`,
    total_ht: Number(q.total_ht),
    total_vat: Number(q.total_vat),
    total_ttc: Number(q.total_ttc),
    client: q.clients as unknown as QuotePdfData["client"],
    contact: q.contacts as unknown as QuotePdfData["contact"],
    lines: ((q.quote_lines ?? []) as unknown as { description: string; quantity: number; unit_price: number; discount: number; position: number; catalog_items: { unit: string } | null }[])
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount: Number(l.discount), unit: l.catalog_items?.unit })),
  };
  return { name: `${q.number}.pdf`, data: await renderToBuffer(<QuoteDocument q={data} />) };
}

/** PDF d'une facture, d'un acompte ou d'un avoir, avec les mentions légales françaises. */
export async function renderInvoicePdf(db: Db, id: string): Promise<{ name: string; data: Buffer } | null> {
  const { data: inv } = await db
    .from("invoices")
    .select("number, kind, issue_date, due_date, notes, total_ht, total_vat, total_ttc, paid_amount, clients(name, city, vat_number, address), contacts(first_name, last_name, email), work_orders(number, title), invoice_lines(description, quantity, unit_price, discount, position)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) return null;
  const wo = inv.work_orders as unknown as { number: string; title: string } | null;
  const data: QuotePdfData = {
    docType: inv.kind === "deposit" ? "deposit" : inv.kind === "credit_note" ? "credit_note" : "invoice",
    number: inv.number,
    issue_date: inv.issue_date,
    valid_until: null,
    due_date: inv.due_date,
    paid_amount: Number(inv.paid_amount),
    notes: inv.notes,
    title: wo ? `${wo.number} — ${wo.title}` : `Facture ${inv.number}`,
    total_ht: Number(inv.total_ht),
    total_vat: Number(inv.total_vat),
    total_ttc: Number(inv.total_ttc),
    client: inv.clients as unknown as QuotePdfData["client"],
    contact: inv.contacts as unknown as QuotePdfData["contact"],
    lines: ((inv.invoice_lines ?? []) as { description: string; quantity: number; unit_price: number; discount: number; position: number }[])
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount: Number(l.discount) })),
  };
  return { name: `${inv.number}.pdf`, data: await renderToBuffer(<QuoteDocument q={data} />) };
}
