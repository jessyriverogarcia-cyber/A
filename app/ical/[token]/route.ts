import { createClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { buildIcs, type IcsEvent } from "@/lib/domain/ics";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const LEAVE: Record<string, string> = { paid: "Congés payés", rtt: "RTT", sick: "Arrêt maladie", unpaid: "Congé sans solde", training: "Formation", other: "Absence" };

/**
 * Flux iCal personnel, lu sans session par l'application d'agenda : le jeton (non devinable,
 * stocké sous forme d'empreinte) donne accès aux seuls événements de son titulaire.
 */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[\w-]{20,64}$/.test(clean)) return new Response("Introuvable", { status: 404 });
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await db.rpc("calendar_feed", { p_token: clean });
  if (!data) return new Response("Introuvable", { status: 404 });
  const feed = data as { name: string; events: { id: string; title: string; starts_at: string; ends_at: string; location: string | null; notes: string | null; created_at: string }[]; leaves: { id: string; kind: string; starts_on: string; ends_on: string }[] };
  const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost").hostname;
  const events: IcsEvent[] = [
    ...feed.events.map((e) => ({ uid: `${e.id}@${host}`, title: e.title, start: e.starts_at, end: e.ends_at, location: e.location, description: e.notes, updatedAt: e.created_at })),
    ...feed.leaves.map((l) => ({ uid: `leave-${l.id}@${host}`, title: LEAVE[l.kind] ?? "Absence", start: l.starts_on, end: l.ends_on, allDay: true })),
  ];
  return new Response(buildIcs(`${sectorConfig.company.name} — ${feed.name}`, events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="agenda.ics"' },
  });
}
