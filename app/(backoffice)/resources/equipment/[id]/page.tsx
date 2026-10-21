import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { maintenanceState } from "@/lib/domain/stock";
import { formatDate } from "@/lib/format";
import { ASSET_STATUS_LABEL, STATUS_COLOR } from "@/lib/map/theme";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { assetStatusAction, maintenanceDoneAction, scheduleMaintenanceAction } from "../../actions";

export const metadata = { title: "Équipement" };

const time = (d: string) => new Date(d).toLocaleString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, dateStyle: "short", timeStyle: "short" });

export default async function EquipmentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const [{ data: a }, { data: events }, { data: wo }] = await Promise.all([
    db.from("assets").select("*, zones(name), sites(key, name)").eq("id", id).maybeSingle(),
    db.from("activity_events").select("id, type, payload, at").eq("entity_id", id).order("at", { ascending: false }).limit(15),
    db.from("work_orders").select("id, number, title, stage_progress").eq("asset_id", id).eq("status", "active").maybeSingle(),
  ]);
  if (!a) notFound();
  const today = todayIso(sectorConfig.company.timezone);
  const m = maintenanceState(a.next_maintenance_on, today);
  const write = can(ctx, "resources", "update");
  const site = a.sites as unknown as { key: string; name: string } | null;
  const specs = Object.entries((a.specs ?? {}) as Record<string, unknown>).filter(([k]) => k !== "visual");
  const statusForm = (status: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary", testId?: string) => (
    <form action={assetStatusAction}>
      <input type="hidden" name="asset_id" value={a.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} testId={testId}>{label}</SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/resources/equipment", label: "Équipements" }}
        title={<span className="flex items-center gap-3">{a.code} · {a.name} <span className="flex items-center gap-1.5 text-sm font-normal" data-testid="asset-status"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />{ASSET_STATUS_LABEL[a.status]}</span></span>}
        subtitle={`${site?.name ?? ""} · ${(a.zones as unknown as { name: string } | null)?.name ?? ""}`}
        actions={site && <Link href={`/map/${site.key}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Voir sur la Map →</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {write && (
            <Card>
              <CardTitle>État</CardTitle>
              <div className="flex flex-wrap gap-2">
                {a.status !== "down" && statusForm("down", "⚠ Déclarer une panne", "danger", "asset-down")}
                {(a.status === "down" || a.status === "maintenance") && statusForm(wo ? "running" : "idle", "✓ Remettre en service", "primary", "asset-repair")}
                {a.status !== "maintenance" && statusForm("maintenance", "Mettre en maintenance")}
                {a.status === "idle" && wo && statusForm("running", "Lancer la production")}
              </div>
              <p className="mt-2 text-xs text-muted">Chaque changement d&apos;état apparaît en direct sur la Map (lampe d&apos;état, halo, notification).</p>
            </Card>
          )}
          <Card>
            <CardTitle>Historique</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex justify-between py-1.5">
                  <span>{e.type === "asset.down" ? "Panne déclarée" : e.type === "asset.repaired" ? ((e.payload as { maintenance?: boolean }).maintenance ? "Maintenance effectuée" : "Remise en service") : e.type === "asset.maintenance" ? "Maintenance" : "Changement d'état"}</span>
                  <span className="text-xs text-muted">{time(e.at)}</span>
                </li>
              ))}
              {!events?.length && <li className="py-1.5 text-muted">Aucun événement.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Maintenance préventive</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Dernière</dt><dd>{a.last_maintenance_on ? formatDate(a.last_maintenance_on) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Prochaine</dt><dd>{a.next_maintenance_on ? <Badge tone={m === "overdue" ? "danger" : m === "due_soon" ? "warn" : "ok"} data-testid="next-maintenance">{formatDate(a.next_maintenance_on)}</Badge> : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Périodicité</dt><dd>{a.maintenance_interval_days} jours</dd></div>
            </dl>
            {write && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <form action={maintenanceDoneAction}>
                  <input type="hidden" name="asset_id" value={a.id} />
                  <SubmitButton testId="maintenance-done">✓ Maintenance effectuée aujourd&apos;hui</SubmitButton>
                </form>
                <form action={scheduleMaintenanceAction} className="flex items-end gap-2">
                  <input type="hidden" name="asset_id" value={a.id} />
                  <Field label="Planifier le" className="w-40"><Input type="date" name="date" min={today} /></Field>
                  <SubmitButton variant="secondary">Planifier</SubmitButton>
                </form>
              </div>
            )}
          </Card>
          {wo && (
            <Card>
              <CardTitle>Dossier en cours</CardTitle>
              <Link href={`/ops/work-orders/${wo.id}`} className="text-sm font-medium hover:text-accent">{wo.number} · {wo.title}</Link>
            </Card>
          )}
          {specs.length > 0 && (
            <Card>
              <CardTitle>Caractéristiques</CardTitle>
              <dl className="space-y-1 text-sm">{specs.map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted capitalize">{k}</dt><dd>{String(v)}</dd></div>)}</dl>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
