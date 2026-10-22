import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { renderQuotePdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

/** PDF du devis, généré à la demande avec les droits (RLS) de l'utilisateur. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "crm")) return new Response("Non autorisé", { status: 401 });
  const { id } = await params;
  const pdf = await renderQuotePdf(await createClient(), id);
  if (!pdf) return new Response("Devis introuvable", { status: 404 });
  return new Response(new Uint8Array(pdf.data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.name}"` } });
}
