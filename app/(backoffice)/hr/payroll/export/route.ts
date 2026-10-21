import { sectorConfig } from "@/config/sector.config";
import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mondayOf } from "@/lib/domain/hr";
import { todayIso } from "@/lib/domain/kpis";
import { payrollVariables } from "@/lib/services/payroll";
import { badgesByEmployee, daysBetweenIso, hoursPerDay } from "@/lib/services/hr";

const csv = (rows: (string | number | null)[][]) =>
  "﻿" + rows.map((r) => r.map((v) => (v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`)).join(";")).join("\r\n");

/** Exports CSV (séparateur « ; », décimales « , », compatible Excel FR) : feuille de temps, variables de paie. */
export async function GET(req: Request) {
  const ctx = await getUserContext();
  if (!ctx) return new Response("Non autorisé", { status: 401 });
  const url = new URL(req.url);
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);

  if (url.searchParams.get("kind") === "payroll") {
    if (!can(ctx, "salaries", "export")) return new Response("Réservé à la direction et aux RH", { status: 403 });
    const month = url.searchParams.get("month") ?? today.slice(0, 7);
    const rows = await payrollVariables(db, month);
    const body = csv([
      ["Salarié", "Poste", "Contrat", "Base brute mensuelle", "Nb mois", "Heures badgées", "Heures contrat", "Heures sup.", "CP (j)", "RTT (j)", "Maladie (j)", "Autres absences (j)", "Frais à rembourser (€)"],
      ...rows.map((r) => [r.name, r.job, r.contract, r.baseMonthly, r.months, r.hours, r.contractMonthly, r.overtime, r.paidLeave, r.rtt, r.sick, r.other, r.expenses]),
    ]);
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="variables-paie-${month}.csv"` } });
  }

  if (!can(ctx, "presence", "export")) return new Response("Non autorisé", { status: 403 });
  const monday = url.searchParams.get("week") ?? mondayOf(today);
  const days = daysBetweenIso(monday, new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10));
  const [{ data: emps }, badges] = await Promise.all([db.from("employees").select("id, first_name, last_name").eq("active", true).order("last_name"), badgesByEmployee(db, monday, days.at(-1)!)]);
  const body = csv([
    ["Salarié", ...days, "Total"],
    ...(emps ?? []).map((e) => {
      const per = hoursPerDay(badges.get(e.id));
      const vals = days.map((d) => Math.round((per.get(d) ?? 0) * 100) / 100);
      return [`${e.last_name} ${e.first_name}`, ...vals, Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100];
    }),
  ]);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="feuille-de-temps-${monday}.csv"` } });
}
