import Link from "next/link";
import { redirect } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { badgeAnomaly } from "@/lib/domain/hr";
import { badgesByEmployee } from "@/lib/services/hr";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Stat } from "@/components/ui/backoffice";
import { LeaveDecision } from "@/components/hr/LeaveDecision";
import { CANDIDATE_STAGES, LEAVE_KIND } from "@/components/hr/status";

export const metadata = { title: "RH" };

export default async function HrHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (sp.employee) redirect(`/hr/employees/${sp.employee}`); // lien profond depuis la Map
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: pending }, { data: presence }, { data: onLeave }, { data: trainings }, { data: candidates }, { data: onboarding }, { data: employees }, badges] = await Promise.all([
    db.from("leave_requests").select("id, kind, starts_on, ends_on, days, comment, employees:employees!leave_requests_employee_id_fkey(first_name, last_name)").eq("status", "pending").order("starts_on"),
    db.from("presence_status").select("employee_id, status"),
    db.from("leave_requests").select("employee_id").eq("status", "approved").lte("starts_on", today).gte("ends_on", today),
    db.from("trainings").select("id, title, expires_on, employees(id, first_name, last_name)").not("expires_on", "is", null).lte("expires_on", in60).order("expires_on"),
    db.from("candidates").select("id, full_name, score, stage, job_openings(title)").in("stage", ["new", "screening"]).order("score"),
    db.from("onboarding_tasks").select("id, title, due_on, employees(id, first_name, last_name)").eq("done", false).lte("due_on", today),
    db.from("employees").select("id, first_name, last_name").eq("active", true),
    badgesByEmployee(db, weekAgo, today),
  ]);
  const leaveSet = new Set((onLeave ?? []).map((l) => l.employee_id));
  const counts = { at_station: 0, on_break: 0, absent: 0, leave: leaveSet.size };
  for (const p of presence ?? []) {
    if (leaveSet.has(p.employee_id!)) continue;
    if (p.status === "at_station" || p.status === "in_meeting") counts.at_station++;
    else if (p.status === "on_break") counts.on_break++;
    else counts.absent++;
  }
  const name = (id: string) => (employees ?? []).find((e) => e.id === id);
  // Oublis de pointage des jours passés de la semaine
  const anomalies: { employee: string; day: string; kind: string }[] = [];
  for (const [emp, evs] of badges) {
    const days = new Map<string, string[]>();
    for (const e of evs) if (e.day < today) days.set(e.day, [...(days.get(e.day) ?? []), e.kind]);
    for (const [day, kinds] of days) {
      const a = badgeAnomaly(kinds);
      if (a) anomalies.push({ employee: emp, day, kind: a });
    }
  }
  const approve = can(ctx, "hr", "approve");

  const tile = (title: string, count: number, children: React.ReactNode, tone: "danger" | "warn" | "info" | "accent" = "accent", href?: string) => (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <CardTitle className="mb-0">{href ? <Link href={href} className="hover:text-accent">{title}</Link> : title}</CardTitle>
        <Badge tone={count ? tone : "neutral"}>{count}</Badge>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">{count ? children : <li className="px-4 py-4 text-sm text-muted">Rien à traiter ✓</li>}</ul>
    </Card>
  );

  return (
    <>
      <PageHeader title="Ressources humaines" subtitle="Présences du jour, demandes à traiter, échéances." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Au poste" value={counts.at_station} tone="ok" hint={`sur ${(employees ?? []).length} personnes`} />
        <Stat label="En pause" value={counts.on_break} />
        <Stat label="En congé" value={counts.leave} />
        <Stat label="Absents / non pointés" value={counts.absent} tone={counts.absent ? "warn" : "ok"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2" data-testid="hr-tiles">
        {tile(
          "Congés à valider",
          (pending ?? []).length,
          (pending ?? []).map((l) => {
            const e = l.employees as unknown as { first_name: string; last_name: string };
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.first_name} {e.last_name}</p>
                  <p className="text-xs text-muted">{LEAVE_KIND[l.kind]} · {formatDate(l.starts_on)}{l.ends_on !== l.starts_on && ` → ${formatDate(l.ends_on)}`} · {formatNumber(l.days)} j{l.comment ? ` · « ${l.comment} »` : ""}</p>
                </div>
                {approve && <LeaveDecision id={l.id} back="/hr" testId={`leave-${e.first_name}`} />}
              </li>
            );
          }),
          "warn",
          "/hr/leaves",
        )}
        {tile(
          "Oublis de pointage (7 jours)",
          anomalies.length,
          anomalies.map((a) => (
            <li key={a.employee + a.day} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{name(a.employee)?.first_name} {name(a.employee)?.last_name} · <span className="text-muted">{formatDate(a.day)}</span></span>
              <Link href="/hr/presence" className="text-xs text-accent">{a.kind === "missing_out" ? "sortie manquante" : a.kind === "open_break" ? "pause non clôturée" : "entrée manquante"} →</Link>
            </li>
          )),
          "danger",
          "/hr/presence",
        )}
        {tile(
          "Habilitations et formations qui expirent (60 j)",
          (trainings ?? []).length,
          (trainings ?? []).map((t) => {
            const e = t.employees as unknown as { id: string; first_name: string; last_name: string };
            return (
              <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/hr/employees/${e.id}`} className="hover:text-accent">{e.first_name} {e.last_name} · <span className="text-muted">{t.title}</span></Link>
                <Badge tone={t.expires_on! < today ? "danger" : "warn"}>{formatDate(t.expires_on!)}</Badge>
              </li>
            );
          }),
          "warn",
        )}
        {tile(
          "Candidatures à traiter",
          (candidates ?? []).length,
          (candidates ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href="/hr/recruitment" className="hover:text-accent">{c.full_name} · <span className="text-muted">{(c.job_openings as unknown as { title: string } | null)?.title}</span></Link>
              <span className="flex items-center gap-1">
                <Badge tone={c.score === "A" ? "ok" : c.score === "B" ? "info" : "neutral"}>{c.score}</Badge>
                <Badge>{CANDIDATE_STAGES.find((s) => s.id === c.stage)?.label}</Badge>
              </span>
            </li>
          )),
          "info",
          "/hr/recruitment",
        )}
        {tile(
          "Intégration : tâches en retard",
          (onboarding ?? []).length,
          (onboarding ?? []).map((t) => {
            const e = t.employees as unknown as { id: string; first_name: string; last_name: string };
            return (
              <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/hr/employees/${e.id}`} className="hover:text-accent">{e.first_name} {e.last_name} · <span className="text-muted">{t.title}</span></Link>
                <span className="text-xs text-danger">{formatDate(t.due_on!)}</span>
              </li>
            );
          }),
          "danger",
        )}
      </div>
    </>
  );
}
