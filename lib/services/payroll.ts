import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessDays } from "@/lib/domain/hr";
import type { Database } from "@/lib/supabase/database.types";
import { badgesByEmployee, hoursPerDay } from "./hr";
import { toReimburse } from "@/lib/domain/expenses";
import { sectorConfig } from "@/config/sector.config";

/**
 * Variables de paie du mois, sans ressaisie : heures depuis la badgeuse, absences depuis les
 * congés validés, salaire de base depuis la fiche (RLS : salaires visibles par la direction et les RH).
 */
export async function payrollVariables(db: SupabaseClient<Database>, month: string) {
  const first = `${month}-01`;
  const lastDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const last = lastDate.toISOString().slice(0, 10);
  const [{ data: emps }, { data: salaries }, { data: leaves }, badges, { data: expenses }] = await Promise.all([
    db.from("employees").select("id, first_name, last_name, job_title, contract_type, weekly_hours, work_rate").eq("active", true).order("last_name"),
    db.from("employee_salaries").select("employee_id, gross_annual, months_count, bonus, effective_from").lte("effective_from", last).order("effective_from"),
    db.from("leave_requests").select("employee_id, kind, starts_on, ends_on").eq("status", "approved").lte("starts_on", last).gte("ends_on", first),
    badgesByEmployee(db, first, last),
    // Frais validés remboursés par la paie (sans ressaisie depuis les notes de frais)
    sectorConfig.expenses.reimbursement === "payroll" ? db.from("expenses").select("employee_id, amount, status").eq("status", "approved") : Promise.resolve({ data: [] }),
  ]);
  const owed = toReimburse((expenses ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
  const workable = businessDays(first, last);
  return (emps ?? []).map((e) => {
    const sal = (salaries ?? []).filter((s) => s.employee_id === e.id).at(-1);
    const absences: Record<string, number> = {};
    for (const l of (leaves ?? []).filter((x) => x.employee_id === e.id)) {
      const d = businessDays(l.starts_on < first ? first : l.starts_on, l.ends_on > last ? last : l.ends_on);
      absences[l.kind] = (absences[l.kind] ?? 0) + d;
    }
    const hours = [...hoursPerDay(badges.get(e.id)).values()].reduce((s, h) => s + h, 0);
    const contractMonthly = Math.round(Number(e.weekly_hours) * Number(e.work_rate) * 52 / 12 * 100) / 100;
    return {
      id: e.id,
      name: `${e.last_name} ${e.first_name}`,
      job: e.job_title,
      contract: e.contract_type,
      baseMonthly: sal ? Math.round((Number(sal.gross_annual) / sal.months_count) * 100) / 100 : null,
      months: sal?.months_count ?? null,
      bonusAnnual: sal ? Number(sal.bonus) : null,
      hours: Math.round(hours * 100) / 100,
      contractMonthly,
      overtime: Math.max(0, Math.round((hours - contractMonthly) * 100) / 100),
      paidLeave: absences.paid ?? 0,
      rtt: absences.rtt ?? 0,
      sick: absences.sick ?? 0,
      other: (absences.unpaid ?? 0) + (absences.training ?? 0) + (absences.other ?? 0),
      expenses: owed.get(e.id) ?? 0,
    };
  }).map((r) => ({ ...r, workable }));
}
