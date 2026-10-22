import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

/** PDF de la facture (ou de l'acompte, de l'avoir), avec les mentions légales françaises. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "finance")) return new Response("Non autorisé", { status: 401 });
  const { id } = await params;
  const pdf = await renderInvoicePdf(await createClient(), id);
  if (!pdf) return new Response("Facture introuvable", { status: 404 });
  return new Response(new Uint8Array(pdf.data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.name}"` } });
}
