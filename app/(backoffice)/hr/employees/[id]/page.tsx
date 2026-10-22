import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { leaveBalance, mondayOf, overtime, rttBalance } from "@/lib/domain/hr";
import { badgesByEmployee, hoursPerDay } from "@/lib/services/hr";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Stat } from "@/components/ui/backoffice";
import { LeaveDecision } from "@/components/hr/LeaveDecision";
import { LEAVE_KIND, LEAVE_STATUS, PRESENCE } from "@/components/hr/status";
import { onboardingToggleAction } from "../../actions";

export const metadata = { title: "Fiche employé" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const monday = mondayOf(today);
  const [{ data: e }, { data: presence }, { data: salaries }, badges, { data: hours }] = await Promise.all([
    db.from("employees").select("*, sites(key), zones:home_zone_id(name), manager:manager_id(id, first_name, last_name), leave_requests:leave_requests!leave_requests_employee_id_fkey(id, kind, starts_on, ends_on, days, status), trainings(id, title, status, scheduled_on, expires_on), reviews:reviews!reviews_employee_id_fkey(id, review_date, rating, objectives), onboarding_tasks(id, title, due_on, done)").eq("id", id).maybeSingle(),
    db.from("presence_status").select("status, since, current_activity").eq("employee_id", id).maybeSingle(),
    db.from("employee_salaries").select("gross_annual, months_count, bonus, effective_from").eq("employee_id", id).order("effective_from", { ascending: false }),
    badgesByEmployee(db, monday, today, id),
    db.from("time_entries").select("hours, billable, work_date").eq("employee_id", id).gte("work_date", monday),
  ]);
  if (!e) notFound();
  const leaves = ((e.leave_requests ?? []) as { id: string; kind: string; starts_on: string; ends_on: string; days: number; status: string }[]).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const onLeave = leaves.some((l) => l.status === "approved" && l.starts_on <= today && l.ends_on >= today);
  const st = onLeave ? "leave" : (presence?.status ?? "absent");
  const perDay = hoursPerDay(badges.get(id));
  const weekBadged = [...perDay.values()].reduce((s, h) => s + h, 0);
  const weekLogged = (hours ?? []).reduce((s, h) => s + Number(h.hours), 0);
  const contract = Number(e.weekly_hours) * Number(e.work_rate);
  const balance = leaveBalance({ today, startDate: e.start_date, workRate: Number(e.work_rate), carryover: Number(e.leave_carryover), leaves: leaves.map((l) => ({ ...l, days: Number(l.days) })) });
  const rtt = rttBalance({ today, startDate: e.start_date, regime: e.time_regime as "hours" | "forfait_jours", weeklyHours: Number(e.weekly_hours), workRate: Number(e.work_rate), leaves: leaves.map((l) => ({ ...l, days: Number(l.days) })) }, sectorConfig.payroll.rtt);
  const salary = salaries?.[0];
  const manager = e.manager as unknown as { id: string; first_name: string; last_name: string } | null;
  const trainings = (e.trainings ?? []) as { id: string; title: string; status: string; scheduled_on: string | null; expires_on: string | null }[];
  const reviews = (e.reviews ?? []) as { id: string; review_date: string; rating: number | null; objectives: { label: string; done: boolean }[] }[];
  const onboarding = (e.onboarding_tasks ?? []) as { id: string; title: string; due_on: string | null; done: boolean }[];
  const approve = can(ctx, "hr", "approve");

  return (
    <>
      <PageHeader
        back={{ href: "/hr/employees", label: "Équipe" }}
        title={<span className="flex items-center gap-3">{e.first_name} {e.last_name} <Badge tone={PRESENCE[st]?.tone ?? "neutral"}>{PRESENCE[st]?.label}</Badge></span>}
        subtitle={`${e.job_title} · ${e.department ?? ""} · ${(e.zones as unknown as { name: string } | null)?.name ?? ""}`}
        actions={<Link href={`/map/${(e.sites as unknown as { key: string } | null)?.key ?? sectorConfig.sites[0].id}`} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">Voir sur la Map</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Heures badgées (semaine)" value={`${formatNumber(Math.round(weekBadged * 10) / 10)} h`} hint={`contrat ${formatNumber(contract)} h${overtime(weekBadged, contract) ? ` · +${formatNumber(overtime(weekBadged, contract))} h` : ""}`} />
        <Stat label="Heures saisies sur dossiers" value={`${formatNumber(weekLogged)} h`} hint={weekBadged ? `${Math.round((weekLogged / weekBadged) * 100)} % du temps badgé` : undefined} />
        <Stat label="Congés disponibles" value={`${formatNumber(balance.available)} j`} hint={`${formatNumber(balance.acquired)} acquis · ${formatNumber(balance.taken)} pris`} tone={balance.available >= 0 ? "ok" : "danger"} />
        <Stat label="Ancienneté" value={e.start_date ? `${Math.floor((Date.now() - new Date(e.start_date).getTime()) / (365.25 * 86_400_000))} an(s)` : "—"} hint={e.start_date ? `depuis le ${formatDate(e.start_date)}` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Congés</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {leaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{LEAVE_KIND[l.kind]} · {formatDate(l.starts_on)}{l.ends_on !== l.starts_on && ` → ${formatDate(l.ends_on)}`} <span className="text-muted">· {formatNumber(l.days)} j</span></span>
                  {l.status === "pending" && approve ? <LeaveDecision id={l.id} back={`/hr/employees/${id}`} /> : <Badge tone={LEAVE_STATUS[l.status].tone}>{LEAVE_STATUS[l.status].label}</Badge>}
                </li>
              ))}
              {!leaves.length && <li className="py-2 text-muted">Aucun congé.</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Formations et habilitations</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {trainings.map((t) => (
                <li key={t.id} className="flex justify-between py-2">
                  <span>{t.title} <span className="text-muted">· {t.status === "planned" ? `prévue le ${t.scheduled_on ? formatDate(t.scheduled_on) : "—"}` : "obtenue"}</span></span>
                  {t.expires_on && <Badge tone={t.expires_on < today ? "danger" : t.expires_on <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10) ? "warn" : "ok"}>expire le {formatDate(t.expires_on)}</Badge>}
                </li>
              ))}
              {!trainings.length && <li className="py-2 text-muted">Aucune formation.</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Entretiens</CardTitle>
            <ul className="space-y-2 text-sm">
              {reviews.map((r) => (
                <li key={r.id}>
                  <p className="font-medium">{formatDate(r.review_date)} {r.rating && <span className="text-warn">{"★".repeat(r.rating)}</span>} {r.review_date > today && <Badge tone="info">à venir</Badge>}</p>
                  <ul className="text-xs text-muted">{r.objectives.map((o, i) => <li key={i}>{o.done ? "✓" : "○"} {o.label}</li>)}</ul>
                </li>
              ))}
              {!reviews.length && <li className="text-muted">Aucun entretien.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Contrat</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Type</dt><dd>{e.contract_type}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Temps de travail</dt><dd>{Math.round(Number(e.work_rate) * 100)} % · {e.time_regime === "forfait_jours" ? `forfait ${sectorConfig.payroll.rtt.forfaitDays} j` : `${formatNumber(contract)} h/sem.`}</dd></div>
              <div className="flex justify-between" data-testid="employee-rtt"><dt className="text-muted">RTT {today.slice(0, 4)}</dt><dd>{rtt.annual ? `${formatNumber(rtt.available)} j dispo. · ${formatNumber(rtt.acquired)} acquis / ${formatNumber(rtt.annual)}` : "aucun"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Responsable</dt><dd>{manager ? <Link href={`/hr/employees/${manager.id}`} className="hover:text-accent">{manager.first_name} {manager.last_name}</Link> : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">E-mail</dt><dd className="truncate">{e.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Compétences</dt><dd className="text-right">{e.skills.join(", ") || "—"}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Rémunération</CardTitle>
            {salary ? (
              <dl className="space-y-1.5 text-sm" data-testid="salary">
                <div className="flex justify-between"><dt className="text-muted">Brut annuel</dt><dd className="font-medium">{formatMoney(salary.gross_annual)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Versement</dt><dd>{salary.months_count} mois · {formatMoney(Number(salary.gross_annual) / salary.months_count)} brut/mois</dd></div>
                {Number(salary.bonus) > 0 && <div className="flex justify-between"><dt className="text-muted">Prime</dt><dd>{formatMoney(salary.bonus)}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">Depuis</dt><dd>{formatDate(salary.effective_from)}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-muted" data-testid="salary-hidden">Réservé à la direction et aux RH.</p>
            )}
          </Card>
          {onboarding.length > 0 && (
            <Card>
              <CardTitle>Parcours d&apos;intégration</CardTitle>
              <ul className="space-y-1 text-sm">
                {onboarding.map((t) => (
                  <li key={t.id}>
                    <form action={onboardingToggleAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <button disabled={!can(ctx, "hr", "update")} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-surface-2">
                        <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${t.done ? "border-ok bg-ok text-white" : "border-border"}`}>{t.done && "✓"}</span>
                        <span className={t.done ? "text-muted line-through" : ""}>{t.title}</span>
                        {!t.done && t.due_on && <span className={`ml-auto text-xs ${t.due_on < today ? "text-danger" : "text-muted"}`}>{formatDate(t.due_on)}</span>}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
