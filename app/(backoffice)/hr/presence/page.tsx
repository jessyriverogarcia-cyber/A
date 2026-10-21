import Link from "next/link";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { badgeAnomaly, mondayOf, overtime } from "@/lib/domain/hr";
import { badgesByEmployee, daysBetweenIso, hoursPerDay } from "@/lib/services/hr";
import { formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/primitives";
import { Flash, PageHeader } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { fixBadgeAction } from "../actions";

export const metadata = { title: "Présences" };

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(sectorConfig.company.locale, { weekday: "short", day: "numeric" });

export default async function PresencePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const monday = sp.week ?? mondayOf(today);
  const days = daysBetweenIso(monday, new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10));
  const prev = new Date(new Date(`${monday}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const next = new Date(new Date(`${monday}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: emps }, { data: leaves }, badges] = await Promise.all([
    db.from("employees").select("id, first_name, last_name, weekly_hours, work_rate").eq("active", true).order("last_name"),
    db.from("leave_requests").select("employee_id, starts_on, ends_on, kind").eq("status", "approved").lte("starts_on", days.at(-1)!).gte("ends_on", monday),
    badgesByEmployee(db, monday, days.at(-1)!),
  ]);
  const fix = can(ctx, "presence", "create");
  const exportOk = can(ctx, "presence", "export");

  return (
    <>
      <PageHeader
        title="Présences"
        subtitle="Heures calculées depuis la badgeuse (pauses déduites) — zéro saisie manuelle."
        actions={
          <>
            <Link href={`/hr/presence?week=${prev}`} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">← Semaine précédente</Link>
            {monday < mondayOf(today) && <Link href={`/hr/presence?week=${next}`} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">Semaine suivante →</Link>}
            {exportOk && <a href={`/hr/payroll/export?kind=timesheet&week=${monday}`} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white" data-testid="export-timesheet">Export CSV</a>}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="overflow-x-auto rounded-card border border-border bg-surface" data-testid="presence-grid">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Personne</th>
              {days.map((d) => <th key={d} className={clsx("px-2 py-2 text-center font-medium capitalize", d === today && "text-accent")}>{dayLabel(d)}</th>)}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Contrat</th>
              <th className="px-3 py-2 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(emps ?? []).map((e) => {
              const evs = badges.get(e.id) ?? [];
              const perDay = hoursPerDay(evs);
              const total = [...perDay.values()].reduce((s, h) => s + h, 0);
              const contract = Number(e.weekly_hours) * Number(e.work_rate);
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2"><Link href={`/hr/employees/${e.id}`} className="hover:text-accent">{e.first_name} {e.last_name}</Link></td>
                  {days.map((d) => {
                    const kinds = evs.filter((x) => x.day === d).map((x) => x.kind);
                    const anomaly = d < today ? badgeAnomaly(kinds) : null;
                    const leave = (leaves ?? []).find((l) => l.employee_id === e.id && l.starts_on <= d && l.ends_on >= d);
                    const h = perDay.get(d);
                    return (
                      <td key={d} className={clsx("px-2 py-2 text-center tabular-nums", anomaly && "bg-danger/10")}>
                        {leave ? <span className="text-xs text-warn">congé</span> : h ? formatNumber(Math.round(h * 10) / 10) : <span className="text-border">—</span>}
                        {anomaly && fix && (
                          <form action={fixBadgeAction} className="mt-1 flex items-center justify-center gap-1" data-testid={`fix-${e.first_name}`}>
                            <input type="hidden" name="employee_id" value={e.id} />
                            <input type="hidden" name="day" value={d} />
                            <input type="hidden" name="kind" value={anomaly === "open_break" ? "break_end" : anomaly === "no_in" ? "in" : "out"} />
                            <Input type="time" name="time" defaultValue={anomaly === "no_in" ? "08:00" : "17:00"} className="w-20 px-1 py-0.5 text-xs" aria-label="Heure corrigée" />
                            <SubmitButton className="px-1.5 py-0.5 text-xs">OK</SubmitButton>
                          </form>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatNumber(Math.round(total * 10) / 10)} h</td>
                  <td className="px-3 py-2 text-right text-muted tabular-nums">{formatNumber(contract)} h</td>
                  <td className={clsx("px-3 py-2 text-right tabular-nums", overtime(total, contract) ? "text-warn" : "text-muted")}>{overtime(total, contract) ? `+${formatNumber(overtime(total, contract))}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Case rouge : oubli de pointage — saisissez l&apos;heure réelle, la correction est tracée (lecteur « CORRECTION »).</p>
    </>
  );
}
