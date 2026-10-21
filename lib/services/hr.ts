import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { hoursByDay } from "@/lib/domain/hr";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;
const tz = sectorConfig.company.timezone;
export const localDay = (at: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(at));

/** Pointages d'une période, regroupés par employé et par jour local (fuseau de l'organisation). */
export async function badgesByEmployee(db: Db, fromDay: string, toDay: string, employeeId?: string) {
  const from = new Date(`${fromDay}T00:00:00Z`).getTime() - 14 * 3_600_000; // marge de fuseau
  const to = new Date(`${toDay}T23:59:59Z`).getTime() + 14 * 3_600_000;
  let q = db.from("badge_events").select("employee_id, kind, at").gte("at", new Date(from).toISOString()).lte("at", new Date(to).toISOString()).order("at");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  const map = new Map<string, { kind: "in" | "out" | "break_start" | "break_end"; at: Date; day: string }[]>();
  for (const b of data ?? []) {
    const day = localDay(b.at);
    if (day < fromDay || day > toDay) continue;
    map.set(b.employee_id, [...(map.get(b.employee_id) ?? []), { kind: b.kind as "in", at: new Date(b.at), day }]);
  }
  return map;
}

export function hoursPerDay(events: { kind: "in" | "out" | "break_start" | "break_end"; at: Date; day: string }[] | undefined) {
  return hoursByDay(events ?? [], new Date(), localDay(new Date()));
}

export function daysBetweenIso(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
