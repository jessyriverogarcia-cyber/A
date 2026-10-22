import { sectorConfig } from "@/config/sector.config";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { presenceFromBadges } from "@/lib/domain/presence";
import { leaveBalance, mondayOf, overtime, rttBalance } from "@/lib/domain/hr";
import { badgesByEmployee, daysBetweenIso, hoursPerDay } from "@/lib/services/hr";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { EmptyState, Field, Flash, PageHeader, Select, Stat } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEAVE_KIND, LEAVE_STATUS } from "@/components/hr/status";
import { cancelLeaveAction, requestLeaveAction, selfBadgeAction } from "../hr/actions";
import { withdrawExpenseAction } from "../finance/expenses/actions";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { EXPENSE_STATUS } from "@/components/expenses/status";
import { categoryOf, policyWarnings, WARNING_LABEL } from "@/lib/domain/expenses";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Mon espace" };

const time = (d: Date | string) => new Date(d).toLocaleTimeString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(sectorConfig.company.locale, { weekday: "short", day: "numeric" });

export default async function MePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  if (!ctx.employee_id) return <div className="p-8"><EmptyState title="Compte non rattaché à un employé" /></div>;
  const today = todayIso(sectorConfig.company.timezone);
  const monday = mondayOf(today);
  const week = daysBetweenIso(monday, new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10));

  const [{ data: me }, { data: leaves }, badges, { data: expenses }, { data: wos }] = await Promise.all([
    db.from("employees").select("first_name, last_name, job_title, start_date, work_rate, weekly_hours, leave_carryover, time_regime").eq("id", ctx.employee_id).single(),
    db.from("leave_requests").select("id, kind, starts_on, ends_on, days, status, rejection_reason").eq("employee_id", ctx.employee_id).order("starts_on", { ascending: false }),
    badgesByEmployee(db, monday, today, ctx.employee_id),
    db.from("expenses").select("id, label, category, amount, km, spent_on, status, receipt_path, rejection_reason, work_order_id, billable").eq("employee_id", ctx.employee_id).order("spent_on", { ascending: false }).limit(20),
    db.from("work_orders").select("id, number, title").eq("status", "active").order("number"),
  ]);
  const policy = sectorConfig.expenses;
  const owed = (expenses ?? []).filter((e) => e.status === "approved").reduce((t, e) => t + Number(e.amount), 0);
  const mine = badges.get(ctx.employee_id) ?? [];
  const todayEvents = mine.filter((b) => b.day === today);
  const state = presenceFromBadges(todayEvents);
  const perDay = hoursPerDay(mine);
  const weekHours = [...perDay.values()].reduce((s, h) => s + h, 0);
  const balance = leaveBalance({ today, startDate: me?.start_date ?? null, workRate: Number(me?.work_rate ?? 1), carryover: Number(me?.leave_carryover ?? 0), leaves: (leaves ?? []).map((l) => ({ ...l, days: Number(l.days) })) });
  const contract = Number(me?.weekly_hours ?? 35) * Number(me?.work_rate ?? 1);
  const rtt = rttBalance({ today, startDate: me?.start_date ?? null, regime: (me?.time_regime ?? "hours") as "hours" | "forfait_jours", weeklyHours: Number(me?.weekly_hours ?? 35), workRate: Number(me?.work_rate ?? 1), leaves: (leaves ?? []).map((l) => ({ ...l, days: Number(l.days) })) }, sectorConfig.payroll.rtt);
  const badge = (kind: string, label: string, variant: "primary" | "secondary" = "primary") => (
    <form action={selfBadgeAction}>
      <input type="hidden" name="kind" value={kind} />
      <SubmitButton variant={variant} testId={`badge-${kind}`}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <PageHeader title={`Mon espace — ${me?.first_name}`} subtitle={me?.job_title} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aujourd'hui" value={state === "present" ? "Au poste" : state === "on_break" ? "En pause" : "Pas pointé"} tone={state === "present" ? "ok" : state === "on_break" ? "accent" : "neutral"} hint={todayEvents.length ? `depuis ${time(todayEvents.at(-1)!.at)}` : undefined} />
        <Stat label="Heures cette semaine" value={`${formatNumber(Math.round(weekHours * 10) / 10)} h`} hint={`contrat ${formatNumber(contract)} h${overtime(weekHours, contract) ? ` · +${formatNumber(overtime(weekHours, contract))} h sup.` : ""}`} />
        <Stat label="Congés disponibles" value={`${formatNumber(balance.available)} j`} hint={`${formatNumber(balance.acquired)} acquis · ${formatNumber(balance.taken)} pris · ${formatNumber(balance.pending)} en attente`} tone={balance.available > 0 ? "ok" : "warn"} />
        <Stat label="RTT disponibles" value={rtt.annual ? `${formatNumber(rtt.available)} j` : "—"} hint={rtt.annual ? `${formatNumber(rtt.acquired)} acquis sur ${formatNumber(rtt.annual)} cette année · ${formatNumber(rtt.taken)} pris` : "pas de RTT pour votre horaire"} tone={rtt.available > 0 ? "ok" : "neutral"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Badgeuse</CardTitle>
          <div className="flex flex-wrap gap-2" data-testid="self-badge">
            {state === "absent" && badge("in", "▶ Arrivée")}
            {state === "present" && <>{badge("break_start", "☕ Pause", "secondary")}{badge("out", "■ Départ", "secondary")}</>}
            {state === "on_break" && badge("break_end", "▶ Reprise")}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {todayEvents.map((b, i) => (
              <li key={i} className="flex justify-between"><span className="text-muted">{{ in: "Arrivée", out: "Départ", break_start: "Pause", break_end: "Reprise" }[b.kind]}</span><span className="tabular-nums">{time(b.at)}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Même effet que la badgeuse physique : la Map vous fait entrer, partir en pause ou sortir.</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Ma semaine</CardTitle>
          <div className="grid grid-cols-7 gap-2 text-center text-sm">
            {week.map((d) => {
              const h = perDay.get(d) ?? 0;
              return (
                <div key={d} className={`rounded-lg p-2 ${d === today ? "bg-accent/10 ring-1 ring-accent" : "bg-surface-2"}`}>
                  <p className="text-xs text-muted capitalize">{dayLabel(d)}</p>
                  <p className="mt-1 font-semibold tabular-nums">{h ? `${formatNumber(Math.round(h * 10) / 10)} h` : "—"}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle>Demander un congé</CardTitle>
          <form action={requestLeaveAction} className="space-y-2">
            <input type="hidden" name="back" value="/me" />
            <Select name="kind" defaultValue="paid" data-testid="leave-kind">
              {Object.entries(LEAVE_KIND).filter(([k]) => k !== "sick").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Du"><Input type="date" name="starts_on" min={today} required data-testid="leave-start" /></Field>
              <Field label="Au"><Input type="date" name="ends_on" min={today} data-testid="leave-end" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="half" /> demi-journée (un seul jour)</label>
            <Input name="comment" placeholder="Commentaire (facultatif)" />
            <SubmitButton testId="leave-submit">Envoyer la demande</SubmitButton>
            <p className="text-xs text-muted">Jours ouvrés calculés automatiquement (week-ends et jours fériés exclus).</p>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Mes demandes</CardTitle>
          <ul className="divide-y divide-border text-sm" data-testid="my-leaves">
            {(leaves ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span>{LEAVE_KIND[l.kind]} · {formatDate(l.starts_on)}{l.ends_on !== l.starts_on && ` → ${formatDate(l.ends_on)}`} <span className="text-muted">· {formatNumber(l.days)} j</span>{l.rejection_reason && <span className="text-xs text-danger"> · {l.rejection_reason}</span>}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={LEAVE_STATUS[l.status].tone}>{LEAVE_STATUS[l.status].label}</Badge>
                  {l.status === "pending" && (
                    <form action={cancelLeaveAction}>
                      <input type="hidden" name="leave_id" value={l.id} />
                      <button className="text-xs text-muted hover:text-danger">Annuler</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
            {!leaves?.length && <li className="py-2 text-muted">Aucune demande.</li>}
          </ul>
        </Card>

        <Card>
          <CardTitle>Nouvelle note de frais</CardTitle>
          <ExpenseForm
            categories={policy.categories.map((c) => ({ id: c.id, label: c.label, mileage: c.mileage, ceiling: c.ceiling }))}
            rate={policy.mileageRatePerKm}
            rateLabel={policy.mileageRateLabel}
            today={today}
            workOrders={(wos ?? []).map((w) => ({ id: w.id, label: `${w.number} — ${w.title}` }))}
          />
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <CardTitle className="mb-0">Mes notes de frais</CardTitle>
            {owed > 0 && <span className="text-sm">À rembourser : <span className="font-medium">{formatMoney(owed)}</span> {policy.reimbursement === "payroll" ? "sur la prochaine paie" : "par virement"}</span>}
          </div>
          <ul className="divide-y divide-border text-sm" data-testid="my-expenses">
            {(expenses ?? []).map((e) => {
              const warns = e.status === "pending" ? policyWarnings(policy, { category: e.category ?? "", amount: Number(e.amount), spent_on: e.spent_on, receipt: !!e.receipt_path }, today) : [];
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{e.label}</span>
                    <span className="text-xs text-muted">
                      {categoryOf(policy, e.category)?.label ?? e.category} · {formatDate(e.spent_on)}{e.km ? ` · ${formatNumber(Number(e.km))} km` : ""}{e.billable ? " · refacturable" : ""}
                      {e.receipt_path && <> · <a href={`/finance/expenses/${e.id}/receipt`} className="text-accent">justificatif</a></>}
                      {warns.length > 0 && <span className="text-warn"> · {warns.map((w) => WARNING_LABEL[w]).join(", ")}</span>}
                      {e.rejection_reason && <span className="text-danger"> · {e.rejection_reason}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{formatMoney(e.amount)}</span>
                    <Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge>
                    {e.status === "pending" && (
                      <form action={withdrawExpenseAction}>
                        <input type="hidden" name="expense_id" value={e.id} />
                        <button className="text-xs text-muted hover:text-danger">Retirer</button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
            {!expenses?.length && <li className="py-2 text-muted">Aucune note de frais.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
