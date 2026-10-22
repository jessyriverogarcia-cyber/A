import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Justificatif : lien signé de 60 s (RLS du stockage : le salarié ou la comptabilité). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const db = await createClient();
  const { data: e } = await db.from("expenses").select("receipt_path, receipt_name").eq("id", id).maybeSingle();
  if (!e?.receipt_path) return new NextResponse("Justificatif introuvable", { status: 404 });
  const { data, error } = await db.storage.from("documents").createSignedUrl(e.receipt_path, 60, { download: e.receipt_name ?? undefined });
  if (error || !data) return new NextResponse("Accès refusé", { status: 403 });
  return NextResponse.redirect(data.signedUrl);
}
