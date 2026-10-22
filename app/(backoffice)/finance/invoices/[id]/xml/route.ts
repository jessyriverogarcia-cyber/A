import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { invoiceFacturX } from "@/lib/pdf/render";

/** XML Factur-X seul (CII, EN 16931), pour un import comptable ou une plateforme de dématérialisation. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "finance")) return new Response("Non autorisé", { status: 401 });
  const { id } = await params;
  const fx = await invoiceFacturX(await createClient(), id);
  if (!fx) return new Response("Facture introuvable", { status: 404 });
  return new Response(fx.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${fx.number}-factur-x.xml"` } });
}
