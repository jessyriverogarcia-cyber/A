import { renderToBuffer } from "@react-pdf/renderer";
import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuoteDocument, type QuotePdfData } from "@/lib/pdf/QuoteDocument";

export const runtime = "nodejs";

/** PDF du devis, généré à la demande avec les droits (RLS) de l'utilisateur. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "crm")) return new Response("Non autorisé", { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const { data: q } = await db
    .from("quotes")
    .select("number, issue_date, valid_until, notes, total_ht, total_vat, total_ttc, clients(name, city, vat_number, address), contacts(first_name, last_name, email), deals(title), quote_lines(description, quantity, unit_price, discount, position, catalog_items(unit))")
    .eq("id", id)
    .maybeSingle();
  if (!q) return new Response("Devis introuvable", { status: 404 });

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
  const pdf = await renderToBuffer(<QuoteDocument q={data} />);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.number}.pdf"` },
  });
}
