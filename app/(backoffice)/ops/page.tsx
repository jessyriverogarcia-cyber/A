import Link from "next/link";
import { redirect } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeKpis, todayIso } from "@/lib/domain/kpis";
import { budgetAlert } from "@/lib/domain/workOrder";
import { formatDate } from "@/lib/format";
import { ASSET_STATUS_LABEL } from "@/lib/map/theme";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, LinkButton, PageHeader, Stat } from "@/components/ui/backoffice";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const metadata = { title: "Production" };

const stages = sectorConfig.workOrder.stages;
const label = (id: string) => stages.find((s) => s.id === id)?.label ?? id;

export default async function OpsHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Lien profond depuis la Map ou le Commercial : /ops?wo=<id>
  if (sp.wo) redirect(`/ops/work-orders/${sp.wo}`);
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);

  const [{ data: wos }, { data: assets }, { data: hours }] = await Promise.all([
    db.from("work_orders").select("id, number, title, stage, status, progress, due_date, priority, hours_budget, asset_id, clients(name)").neq("status", "cancelled"),
    db.from("assets").select("id, code, name, status, kind, next_maintenance_on").eq("kind", "machine"),
    db.from("time_entries").select("work_order_id, hours"),
  ]);
  const active = (wos ?? []).filter((w) => w.status === "active");
  const spent = new Map<string, number>();
  for (const h of hours ?? []) if (h.work_order_id) spent.set(h.work_order_id, (spent.get(h.work_order_id) ?? 0) + Number(h.hours));

  const late = active.filter((w) => w.due_date && w.due_date < today);
  const dueSoon = active.filter((w) => w.due_date && w.due_date >= today && w.due_date <= new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const toQc = active.filter((w) => w.stage === "quality");
  const toShip = active.filter((w) => w.stage === stages.at(-1)!.id);
  const readyToPrint = active.filter((w) => w.stage === "slicing" || (w.stage === "printing" && !w.asset_id));
  const overBudget = active.filter((w) => budgetAlert(spent.get(w.id) ?? 0, Number(w.hours_budget)) !== "ok");
  const machinesDown = (assets ?? []).filter((a) => a.status === "down" || a.status === "maintenance");
  const kpis = computeKpis({ machines: assets ?? [], orders: active, today });
  const doneMonth = (wos ?? []).filter((w) => w.status === "done").length;

  const tile = (title: string, rows: React.ReactNode[], tone: "danger" | "warn" | "info" | "accent" = "accent") => (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <CardTitle className="mb-0">{title}</CardTitle>
        <Badge tone={rows.length ? tone : "neutral"}>{rows.length}</Badge>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">{rows.length ? rows : <li className="px-4 py-4 text-sm text-muted">Rien à signaler ✓</li>}</ul>
    </Card>
  );
  const woRow = (w: (typeof active)[number], right: React.ReactNode) => (
    <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <Link href={`/ops/work-orders/${w.id}`} className="font-medium hover:text-accent">
          {w.number} · {(w.clients as unknown as { name: string } | null)?.name}
        </Link>
        <p className="truncate text-xs text-muted">{w.title} · {label(w.stage)}</p>
      </div>
      {right}
    </li>
  );

  return (
    <>
      <LiveRefresh orgId={ctx.org.id} tables={["work_orders", "assets"]} />
      <PageHeader
        title="Production"
        subtitle={`${ctx.full_name.split(" ")[0]}, voici l'état de l'atelier.`}
        actions={
          <>
            <LinkButton href="/ops/planning" variant="secondary">Planning machines</LinkButton>
            <LinkButton href={`/map/${sectorConfig.sites[0].id}`}>Voir sur la Map →</LinkButton>
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Machines en production" value={`${kpis.machines_active.value ?? 0} %`} hint={kpis.machines_active.detail} tone={(kpis.machines_active.value ?? 0) >= 75 ? "ok" : "warn"} />
        <Stat label={`${sectorConfig.workOrder.labelPlural} en cours`} value={active.length} hint={`${doneMonth} livrés au total`} />
        <Stat label="Délais respectés" value={`${kpis.on_time_rate.value ?? 100} %`} hint={`${late.length} en retard`} tone={late.length ? "danger" : "ok"} />
        <Stat label="Budget d'heures dépassé ou proche" value={overBudget.length} tone={overBudget.length ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" data-testid="ops-tiles">
        {tile("En retard", late.map((w) => woRow(w, <Badge tone="danger">{formatDate(w.due_date!)}</Badge>)), "danger")}
        {tile("Contrôle qualité en attente", toQc.map((w) => woRow(w, <Badge tone="info">à contrôler</Badge>)), "info")}
        {tile(
          "Machines arrêtées",
          machinesDown.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium">{a.code} · {a.name}</span>
              <Badge tone={a.status === "down" ? "danger" : "warn"}>{ASSET_STATUS_LABEL[a.status]}</Badge>
            </li>
          )),
          "danger",
        )}
        {tile("À lancer en impression", readyToPrint.map((w) => woRow(w, <Badge tone="accent">{w.stage === "printing" ? "sans machine" : "prêt"}</Badge>)))}
        {tile("À expédier", toShip.map((w) => woRow(w, <Badge tone="info">à expédier</Badge>)), "info")}
        {tile("Échéance sous 3 jours", dueSoon.map((w) => woRow(w, <span className="text-xs text-muted">{formatDate(w.due_date!)}</span>)), "warn")}
        {tile(
          "Budget d'heures",
          overBudget.map((w) => {
            const s = spent.get(w.id) ?? 0;
            const lvl = budgetAlert(s, Number(w.hours_budget));
            return woRow(w, <Badge tone={lvl === "exceeded" ? "danger" : "warn"}>{Math.round(s)} / {Number(w.hours_budget)} h</Badge>);
          }),
          "warn",
        )}
      </div>
    </>
  );
}
