import { renderToBuffer } from "@react-pdf/renderer";
import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuoteDocument, type QuotePdfData } from "@/lib/pdf/QuoteDocument";

export const runtime = "nodejs";

/** PDF de la facture (ou de l'acompte, de l'avoir), avec les mentions légales françaises. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "finance")) return new Response("Non autorisé", { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const { data: inv } = await db
    .from("invoices")
    .select("number, kind, issue_date, due_date, notes, total_ht, total_vat, total_ttc, paid_amount, clients(name, city, vat_number, address), contacts(first_name, last_name, email), work_orders(number, title), invoice_lines(description, quantity, unit_price, discount, position)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) return new Response("Facture introuvable", { status: 404 });
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
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number}.pdf"` } });
}
