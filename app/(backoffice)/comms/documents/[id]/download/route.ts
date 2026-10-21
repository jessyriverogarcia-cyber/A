import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Téléchargement : lien signé de courte durée (le bucket est privé, la RLS vérifie l'organisation). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const db = await createClient();
  const { data: doc } = await db.from("documents").select("name, storage_path").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Document introuvable", { status: 404 });
  const { data, error } = await db.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data) return new NextResponse("Accès refusé", { status: 403 });
  return NextResponse.redirect(data.signedUrl);
}
