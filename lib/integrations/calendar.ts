import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { accessToken, mailMode } from "./mail";
import type { ProviderId } from "./oauth";

type Db = SupabaseClient<Database>;

export interface SharedEvent {
  title: string;
  start: string; // ISO, ou AAAA-MM-JJ si journée entière
  end: string; // ISO, ou AAAA-MM-JJ du dernier jour inclus
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
}

const nextDay = (d: string) => new Date(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Corps de requête Microsoft Graph (/me/events) et Google Calendar (events.insert). */
export function providerPayload(provider: ProviderId, e: SharedEvent, timeZone: string) {
  if (provider === "microsoft") {
    return e.allDay
      ? { subject: e.title, isAllDay: true, start: { dateTime: `${e.start.slice(0, 10)}T00:00:00`, timeZone }, end: { dateTime: `${nextDay(e.end)}T00:00:00`, timeZone }, location: e.location ? { displayName: e.location } : undefined, body: e.description ? { contentType: "text", content: e.description } : undefined, showAs: "oof" }
      : { subject: e.title, start: { dateTime: new Date(e.start).toISOString().slice(0, 19), timeZone: "UTC" }, end: { dateTime: new Date(e.end).toISOString().slice(0, 19), timeZone: "UTC" }, location: e.location ? { displayName: e.location } : undefined, body: e.description ? { contentType: "text", content: e.description } : undefined };
  }
  return e.allDay
    ? { summary: e.title, start: { date: e.start.slice(0, 10) }, end: { date: nextDay(e.end) }, location: e.location ?? undefined, description: e.description ?? undefined, transparency: "transparent" }
    : { summary: e.title, start: { dateTime: new Date(e.start).toISOString() }, end: { dateTime: new Date(e.end).toISOString() }, location: e.location ?? undefined, description: e.description ?? undefined };
}

/**
 * Publie un événement d'équipe (absence validée, maintenance) dans l'agenda de la boîte connectée.
 * Sans boîte connectée : rien n'est envoyé, l'événement reste dans l'agenda de l'application
 * et dans les flux iCal. Renvoie l'identifiant externe, ou null.
 */
export async function pushSharedEvent(db: Db, e: SharedEvent, timeZone: string): Promise<{ provider: ProviderId; id: string } | null> {
  const m = await mailMode(db);
  if (!m.provider) return null;
  try {
    const token = await accessToken(db, m.provider);
    const url = m.provider === "microsoft" ? "https://graph.microsoft.com/v1.0/me/events" : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(providerPayload(m.provider, e, timeZone)) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { id?: string };
    return j.id ? { provider: m.provider, id: j.id } : null;
  } catch (err) {
    await db.rpc("touch_integration", { p_provider: m.provider, p_ciphertext: null as unknown as string, p_error: `Agenda : ${err instanceof Error ? err.message : "erreur"}` });
    return null;
  }
}
