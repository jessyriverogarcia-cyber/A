import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { QuoteDocument, type QuotePdfData } from "./QuoteDocument";
import { sectorConfig } from "@/config/sector.config";
import { buildCiiXml, type FxInvoice } from "@/lib/domain/facturx";
import { embedFacturX } from "./facturx";

type Db = SupabaseClient<Database>;
const cfg = sectorConfig;

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
/** Données de la facture électronique (CII) — mêmes chiffres que le PDF, issus de la base. */
export async function invoiceFacturX(db: Db, id: string): Promise<{ number: string; xml: string } | null> {
  const { data: inv } = await db
    .from("invoices")
    .select("number, kind, status, issue_date, due_date, notes, paid_amount, clients(name, address, city, country, vat_number), work_orders(number), quotes(number), invoice_lines(description, quantity, unit_price, discount, vat_rate, position)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) return null;
  const c = cfg.company;
  const client = inv.clients as unknown as { name: string; address: string | null; city: string | null; country: string | null; vat_number: string | null };
  const fx: FxInvoice = {
    number: inv.number,
    kind: inv.kind as FxInvoice["kind"],
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    currency: c.currency,
    seller: { name: c.name, address: c.legal.address, country: c.country, vatNumber: c.legal.vatNumber, siren: c.legal.siren },
    buyer: { name: client.name, address: client.address ?? client.city, country: client.country ?? "FR", vatNumber: client.vat_number },
    lines: ((inv.invoice_lines ?? []) as { description: string; quantity: number; unit_price: number; discount: number; vat_rate: number; position: number }[])
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Math.round(Number(l.unit_price) * (1 - Number(l.discount)) * 100) / 100, vatRate: Number(l.vat_rate) })),
    paidAmount: inv.kind === "credit_note" ? 0 : Number(inv.paid_amount),
    iban: c.legal.iban,
    note: inv.notes,
    orderReference: (inv.quotes as unknown as { number: string } | null)?.number ?? (inv.work_orders as unknown as { number: string } | null)?.number ?? null,
  };
  return { number: inv.number, xml: buildCiiXml(fx) };
}

export async function renderInvoicePdf(db: Db, id: string): Promise<{ name: string; data: Buffer } | null> {
  const { data: inv } = await db
    .from("invoices")
    .select("number, kind, status, issue_date, due_date, notes, total_ht, total_vat, total_ttc, paid_amount, clients(name, city, vat_number, address), contacts(first_name, last_name, email), work_orders(number, title), invoice_lines(description, quantity, unit_price, discount, position)")
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
  const pdf = await renderToBuffer(<QuoteDocument q={data} />);
  // Brouillon : pas de facture électronique tant qu'elle n'est pas émise.
  const fx = inv.status !== "draft" ? await invoiceFacturX(db, id) : null;
  return { name: `${inv.number}.pdf`, data: fx ? await embedFacturX(pdf, fx.xml, `Facture ${inv.number}`) : pdf };
}
