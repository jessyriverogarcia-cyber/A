"use server";

import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { sectorConfig } from "@/config/sector.config";
import { zonedToIso } from "@/lib/domain/hr";
import { createClient } from "@/lib/supabase/server";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const KINDS = ["meeting", "client", "focus", "travel", "remote", "other"];

/** Nouvel événement dans son agenda (RLS « own_create ») ; les invités le voient aussi. */
export async function createEventAction(form: FormData) {
  const ctx = await requireUser();
  const back = str(form.get("back")) ?? "/planning";
  if (!ctx.employee_id) redirect(`${back}?err=${q("Compte non rattaché à un salarié.")}`);
  const title = str(form.get("title"));
  const day = str(form.get("day"));
  const from = str(form.get("from")) ?? "09:00";
  const to = str(form.get("to")) ?? "10:00";
  const kind = KINDS.includes(String(form.get("kind"))) ? String(form.get("kind")) : "meeting";
  if (!title || !day || to <= from) redirect(`${back}?err=${q("Titre, date et horaires (fin après début) obligatoires.")}`);
  const tz = sectorConfig.company.timezone;
  const participants = form.getAll("participants").map(String).filter((p) => p && p !== ctx.employee_id);
  const db = await createClient();
  const { error } = await db.from("calendar_events").insert({
    org_id: ctx.org.id,
    owner_employee_id: ctx.employee_id,
    kind,
    title,
    starts_at: zonedToIso(day, from, tz),
    ends_at: zonedToIso(day, to, tz),
    participants,
    location: str(form.get("location")),
    client_id: str(form.get("client_id")),
    notes: str(form.get("notes")),
  });
  if (error) redirect(`${back}?err=${q(error.message)}`);
  for (const p of participants) await db.rpc("notify_employee", { p_employee: p, p_title: `${ctx.full_name} vous invite : ${title}`, p_body: `${day.split("-").reverse().join("/")} ${from}–${to}`, p_link: `/planning?w=${day}` });
  redirect(`/planning?w=${day}&ok=${q(participants.length ? `Événement créé, ${participants.length} invité(s) prévenu(s).` : "Événement créé.")}`);
}

export async function deleteEventAction(form: FormData) {
  await requireUser();
  const db = await createClient();
  await db.from("calendar_events").delete().eq("id", String(form.get("event_id")));
  redirect(`/planning?w=${str(form.get("w")) ?? ""}&ok=${q("Événement supprimé.")}`);
}

/** Nouveau lien d'abonnement iCal : l'ancien cesse de fonctionner ; seule l'empreinte est stockée. */
export async function regenerateFeedAction() {
  const ctx = await requireUser();
  const token = randomBytes(24).toString("base64url");
  const db = await createClient();
  const { error } = await db.from("calendar_feeds").upsert({ user_id: ctx.user_id, org_id: ctx.org.id, token_hash: createHash("sha256").update(token).digest("hex"), created_at: new Date().toISOString() });
  if (error) redirect(`/planning?err=${q(error.message)}`);
  redirect(`/planning?feed=${token}`);
}
