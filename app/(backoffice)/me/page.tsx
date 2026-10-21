import { sectorConfig } from "@/config/sector.config";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { presenceFromBadges } from "@/lib/domain/presence";
import { leaveBalance, mondayOf, overtime } from "@/lib/domain/hr";
import { badgesByEmployee, daysBetweenIso, hoursPerDay } from "@/lib/services/hr";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { EmptyState, Field, Flash, PageHeader, Select, Stat } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEAVE_KIND, LEAVE_STATUS } from "@/components/hr/status";
import { cancelLeaveAction, requestLeaveAction, selfBadgeAction } from "../hr/actions";

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

  const [{ data: me }, { data: leaves }, badges] = await Promise.all([
    db.from("employees").select("first_name, last_name, job_title, start_date, work_rate, weekly_hours, leave_carryover").eq("id", ctx.employee_id).single(),
    db.from("leave_requests").select("id, kind, starts_on, ends_on, days, status, rejection_reason").eq("employee_id", ctx.employee_id).order("starts_on", { ascending: false }),
    badgesByEmployee(db, monday, today, ctx.employee_id),
  ]);
  const mine = badges.get(ctx.employee_id) ?? [];
  const todayEvents = mine.filter((b) => b.day === today);
  const state = presenceFromBadges(todayEvents);
  const perDay = hoursPerDay(mine);
  const weekHours = [...perDay.values()].reduce((s, h) => s + h, 0);
  const balance = leaveBalance({ today, startDate: me?.start_date ?? null, workRate: Number(me?.work_rate ?? 1), carryover: Number(me?.leave_carryover ?? 0), leaves: (leaves ?? []).map((l) => ({ ...l, days: Number(l.days) })) });
  const contract = Number(me?.weekly_hours ?? 35) * Number(me?.work_rate ?? 1);
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
        <Stat label="Demandes en attente" value={(leaves ?? []).filter((l) => l.status === "pending").length} />
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
            <Select name="kind" defaultValue="paid">
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
      </div>
    </div>
  );
}
