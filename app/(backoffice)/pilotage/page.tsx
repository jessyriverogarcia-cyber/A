import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { directionDashboard } from "@/lib/services/pilotage";
import { variation, type AlertLevel } from "@/lib/domain/pilotage";
import { formatMoney, formatPercent } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/primitives";
import { PageHeader, Stat } from "@/components/ui/backoffice";
import { BarChart } from "@/components/charts/BarChart";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const metadata = { title: "Pilotage" };

const monthFmt = new Intl.DateTimeFormat(sectorConfig.company.locale, { month: "short", timeZone: "UTC" });
const monthLabel = (m: string) => monthFmt.format(new Date(`${m}-15T00:00:00Z`)).replace(".", "");
const LEVEL: Record<AlertLevel, { label: string; icon: string; cls: string }> = {
  critical: { label: "Critique", icon: "⛔", cls: "border-danger/40 bg-danger/10 text-danger" },
  serious: { label: "Important", icon: "▲", cls: "border-warn/40 bg-warn/10 text-warn" },
  warning: { label: "À surveiller", icon: "●", cls: "border-border bg-surface-2 text-muted" },
};
const pct = (r: number | null) => (r === null ? "—" : formatPercent(r));

export default async function PilotagePage() {
  const ctx = await requireUser();
  const db = await createClient();
  const d = await directionDashboard(db, ctx);
  const rev = d.finance?.revenue ?? [];
  const cur = rev.at(-1)?.value ?? 0;
  const prev = rev.at(-2)?.value ?? 0;
  const change = variation(cur, prev);
  const ytd = rev.filter((r) => r.month.startsWith(d.today.slice(0, 4))).reduce((t, r) => t + r.value, 0);

  return (
    <>
      <LiveRefresh orgId={ctx.org.id} tables={["work_orders", "invoices", "assets"]} />
      <PageHeader title="Tableau de bord direction" subtitle="Calculé à l'instant depuis les modules : aucune donnée ressaisie. Cliquez un chiffre pour le détail." />

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted">Décisions à prendre</h2>
        <ul className="space-y-2" data-testid="alerts">
          {d.alerts.slice(0, 8).map((a, i) => (
            <li key={i}>
              <Link href={a.href} className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-2.5 hover:bg-surface-2/60">
                <span className={clsx("inline-flex w-28 shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", LEVEL[a.level].cls)}>
                  <span aria-hidden>{LEVEL[a.level].icon}</span>
                  {LEVEL[a.level].label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.detail}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{a.module} →</span>
              </Link>
            </li>
          ))}
          {!d.alerts.length && <li className="rounded-card border border-border bg-surface px-4 py-4 text-sm text-muted">Rien à arbitrer aujourd&apos;hui ✓</li>}
        </ul>
        {d.alerts.length > 8 && <p className="mt-2 text-xs text-muted">+ {d.alerts.length - 8} autre(s) point(s) de vigilance.</p>}
      </section>

      {d.finance && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="finance-stats">
            <Link href="/finance/invoices"><Stat label="CA facturé ce mois (HT)" value={formatMoney(cur)} hint={change === null ? "pas de base le mois dernier" : `${change >= 0 ? "+" : ""}${formatPercent(change)} vs mois précédent`} tone="accent" /></Link>
            <Stat label={`CA ${d.today.slice(0, 4)} (HT)`} value={formatMoney(ytd)} hint="depuis le 1er janvier" />
            <Link href="/finance"><Stat label="Encours clients (TTC)" value={formatMoney(d.finance.receivables.open)} hint={`dont ${formatMoney(d.finance.receivables.overdue)} échus`} tone={d.finance.receivables.overdue ? "warn" : "ok"} /></Link>
            <Stat label="Délai moyen de paiement" value={d.finance.dso === null ? "—" : `${d.finance.dso} j`} hint={`conditions : ${sectorConfig.crm.paymentTermsDays} j`} tone={d.finance.dso !== null && d.finance.dso > sectorConfig.crm.paymentTermsDays ? "warn" : "ok"} />
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Chiffre d&apos;affaires facturé HT — 12 mois</CardTitle>
              <BarChart testId="chart-revenue" title="Chiffre d'affaires facturé hors taxes par mois" series={[{ name: "CA HT", color: "--series-1" }]} data={rev.map((r) => ({ label: monthLabel(r.month), values: [r.value] }))} highlight={rev.length - 1} />
            </Card>
            <Card>
              <CardTitle>Trésorerie prévisionnelle — 6 mois</CardTitle>
              <BarChart
                testId="chart-cash"
                title="Encaissements et décaissements prévus par mois"
                series={[{ name: "Encaissements", color: "--series-1" }, { name: "Décaissements", color: "--series-2" }]}
                data={d.finance.cash.map((c) => ({ label: monthLabel(c.month), values: [c.inflow, c.outflow], note: `Solde du mois ${formatMoney(c.net)} · cumulé ${formatMoney(c.balance)}` }))}
              />
              <p className="mt-1 text-xs text-muted">Variation cumulée sur 6 mois : <span className={clsx("font-medium", (d.finance.cash.at(-1)?.balance ?? 0) < 0 ? "text-danger" : "text-text")}>{formatMoney(d.finance.cash.at(-1)?.balance ?? 0)}</span> · solde bancaire non connecté (mode simulé).</p>
            </Card>
          </div>
        </>
      )}

      {d.crm && (
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid grid-cols-2 gap-3 self-start" data-testid="crm-stats">
            <Link href="/crm/pipeline"><Stat label="Pipeline pondéré" value={formatMoney(d.crm.pipeline.weighted)} hint={`${formatMoney(d.crm.pipeline.total)} en valeur brute`} tone="accent" /></Link>
            <Stat label="Carnet de commandes (HT)" value={formatMoney(d.crm.backlog)} hint="devis acceptés restant à facturer" />
            <Link href="/crm/quotes"><Stat label="Transformation des devis" value={pct(d.crm.conversion.rate)} hint={`${d.crm.conversion.accepted} acceptés sur ${d.crm.conversion.decided} tranchés (12 mois)`} /></Link>
            <Stat label="Marge prévisionnelle" value={pct(d.crm.margin.rate)} hint={`${formatMoney(d.crm.margin.margin)} sur devis acceptés`} tone={d.crm.margin.rate !== null && d.crm.margin.rate < 0.3 ? "warn" : "ok"} />
          </div>
          <Card>
            <CardTitle>Pipeline par étape</CardTitle>
            <ul className="space-y-2.5">
              {d.crm.pipeline.byStage.map((s) => {
                const max = Math.max(...d.crm!.pipeline.byStage.map((x) => x.value), 1);
                return (
                  <li key={s.id} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{s.label} <span className="text-xs text-muted">· {s.count} affaire(s)</span></span>
                      <span className="tabular-nums">{formatMoney(s.value)} <span className="text-xs text-muted">pondéré {formatMoney(Math.round(s.weighted))}</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: "var(--series-1)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ops-stats">
        <Link href="/ops/work-orders"><Stat label="Dossiers en cours" value={d.ops.active} hint={`${d.ops.late} en retard · ${d.ops.overruns} hors budget d'heures`} /></Link>
        <Stat label="Délais respectés" value={pct(d.ops.onTime)} tone={d.ops.onTime === null ? "neutral" : d.ops.onTime >= 0.95 ? "ok" : d.ops.onTime >= 0.85 ? "warn" : "danger"} hint="objectif 95 %" />
        <Link href="/resources/equipment"><Stat label="Machines en production" value={`${d.ops.running}/${d.ops.machines}`} hint={d.ops.down ? `${d.ops.down} en panne` : "aucune panne"} tone={d.ops.down ? "danger" : "ok"} /></Link>
        <Stat label="Contrôles qualité (30 j)" value={d.ops.qcTotal ? pct((d.ops.qcTotal - d.ops.qcRejected) / d.ops.qcTotal) : "—"} hint={`${d.ops.qcRejected} rejet(s) sur ${d.ops.qcTotal}`} tone={d.ops.qcRejected ? "warn" : "ok"} />
        <Link href="/resources/stock"><Stat label="Valeur du stock" value={formatMoney(d.resources.stockValue)} hint={`${d.resources.low} article(s) sous le minimum`} tone={d.resources.low ? "warn" : "ok"} /></Link>
        <Link href="/hr/presence"><Stat label="Équipe présente" value={`${d.team.present}/${d.team.headcount}`} hint={d.team.pendingLeaves ? `${d.team.pendingLeaves} congé(s) à valider` : "aucun congé en attente"} /></Link>
      </div>
    </>
  );
}
