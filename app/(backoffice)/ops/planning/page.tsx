import Link from "next/link";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { ASSET_STATUS_LABEL, STATUS_COLOR } from "@/lib/map/theme";
import { PageHeader, Select } from "@/components/ui/backoffice";

export const metadata = { title: "Planning machines" };

const DAYS = 7;

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAYS * 86_400_000);
  const [{ data: machines }, { data: bookings }, { data: sites }] = await Promise.all([
    db.from("assets").select("id, code, name, status, technology, site_id, next_maintenance_on").eq("kind", "machine").order("code"),
    db
      .from("asset_bookings")
      .select("id, asset_id, starts_at, ends_at, work_orders(id, number, title, priority)")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    db.from("sites").select("id, key, name"),
  ]);
  const site = sites?.find((s) => s.key === sp.site);
  const rows = (machines ?? []).filter((m) => !site || m.site_id === site.id);
  const span = end.getTime() - start.getTime();
  const pos = (d: string) => Math.max(0, Math.min(100, ((new Date(d).getTime() - start.getTime()) / span) * 100));
  const nowPct = pos(new Date().toISOString());
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const dayFmt = new Intl.DateTimeFormat(sectorConfig.company.locale, { weekday: "short", day: "numeric", month: "short", timeZone: sectorConfig.company.timezone });
  const load = (id: string) =>
    (bookings ?? []).filter((b) => b.asset_id === id).reduce((s, b) => s + (Math.min(new Date(b.ends_at).getTime(), end.getTime()) - Math.max(new Date(b.starts_at).getTime(), start.getTime())), 0) / span;

  return (
    <>
      <PageHeader
        title="Planning machines"
        subtitle={`${DAYS} prochains jours · réservations créées depuis les ${sectorConfig.workOrder.labelPlural.toLowerCase()}`}
        actions={
          <form className="flex gap-2">
            <Select name="site" defaultValue={sp.site ?? ""}>
              <option value="">Tous les sites</option>
              {(sites ?? []).map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
            </Select>
            <button className="rounded-lg border border-border bg-surface-2 px-4 text-sm">OK</button>
          </form>
        }
      />
      <div className="overflow-x-auto rounded-card border border-border bg-surface" data-testid="planning">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-[220px_1fr] border-b border-border text-xs text-muted">
            <div className="px-3 py-2">Machine · charge</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${DAYS}, 1fr)` }}>
              {days.map((d) => <div key={d.toISOString()} className="border-l border-border px-2 py-2 capitalize">{dayFmt.format(d)}</div>)}
            </div>
          </div>
          {rows.map((m) => {
            const l = load(m.id);
            const maint = m.next_maintenance_on && m.next_maintenance_on < end.toISOString().slice(0, 10) && m.next_maintenance_on >= start.toISOString().slice(0, 10);
            return (
              <div key={m.id} className="grid grid-cols-[220px_1fr] border-b border-border last:border-0">
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[m.status] }} title={ASSET_STATUS_LABEL[m.status]} />
                  <div className="min-w-0">
                    <p className="font-medium">{m.code}</p>
                    <p className="truncate text-xs text-muted">{Math.round(l * 100)} % réservé</p>
                  </div>
                </div>
                <div className="relative h-14">
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${DAYS}, 1fr)` }}>
                    {days.map((d) => <div key={d.toISOString()} className="border-l border-border" />)}
                  </div>
                  {(m.status === "down" || m.status === "maintenance") && (
                    <div className="absolute inset-y-2 left-0 flex items-center rounded-r-md bg-[repeating-linear-gradient(45deg,var(--danger)_0_6px,transparent_6px_12px)] px-2 text-xs font-medium text-danger opacity-60" style={{ width: `${nowPct}%` }} />
                  )}
                  {maint && (
                    <div className="absolute inset-y-1 w-[3px] bg-warn" style={{ left: `${pos(m.next_maintenance_on!)}%` }} title={`Maintenance prévue le ${m.next_maintenance_on}`} />
                  )}
                  {(bookings ?? [])
                    .filter((b) => b.asset_id === m.id)
                    .map((b) => {
                      const wo = b.work_orders as unknown as { id: string; number: string; title: string; priority: string } | null;
                      const left = pos(b.starts_at);
                      const width = Math.max(1.5, pos(b.ends_at) - left);
                      return (
                        <Link
                          key={b.id}
                          href={wo ? `/ops/work-orders/${wo.id}` : "#"}
                          title={wo ? `${wo.number} — ${wo.title}` : "Réservation"}
                          className={clsx("absolute inset-y-2.5 truncate rounded-md px-2 py-1 text-xs font-medium text-white shadow-sm hover:brightness-110", wo?.priority === "urgent" ? "bg-danger" : wo?.priority === "high" ? "bg-warn" : "bg-accent")}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          {wo?.number ?? "Réservé"}
                        </Link>
                      );
                    })}
                  <div className="absolute inset-y-0 w-px bg-info" style={{ left: `${nowPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Trait bleu : maintenant · trait orange : maintenance prévue · hachures : machine arrêtée.</p>
    </>
  );
}
