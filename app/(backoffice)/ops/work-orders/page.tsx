import Link from "next/link";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";

export const metadata = { title: "Ordres de fabrication" };

const stages = sectorConfig.workOrder.stages;
const PRIORITY: Record<string, { label: string; tone: "neutral" | "info" | "warn" | "danger" }> = {
  low: { label: "Basse", tone: "neutral" },
  normal: { label: "Normale", tone: "info" },
  high: { label: "Haute", tone: "warn" },
  urgent: { label: "Urgente", tone: "danger" },
};

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const db = await createClient();
  let query = db
    .from("work_orders")
    .select("id, number, title, stage, status, progress, due_date, priority, product_family, site_id, clients(name), assets(code), employees(first_name, last_name), sites(key, name)")
    .order("due_date", { ascending: true, nullsFirst: false });
  query = sp.status === "done" ? query.eq("status", "done") : query.eq("status", "active");
  if (sp.site) query = query.eq("sites.key", sp.site);
  if (sp.family) query = query.eq("product_family", sp.family);
  const { data } = await query;
  const wos = (data ?? []).filter((w) => !sp.site || (w.sites as unknown as { key: string } | null)?.key === sp.site);
  const today = todayIso(sectorConfig.company.timezone);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...sp, ...patch } as Record<string, string>);
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/ops/work-orders?${p}`;
  };

  const card = (w: (typeof wos)[number]) => {
    const late = w.status === "active" && w.due_date && w.due_date < today;
    return (
      <Link key={w.id} href={`/ops/work-orders/${w.id}`} data-testid={`wo-card-${w.number}`} className="block rounded-lg border border-border bg-surface p-3 text-sm shadow-sm hover:border-accent">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{w.number}</span>
          {w.priority !== "normal" && <Badge tone={PRIORITY[w.priority].tone}>{PRIORITY[w.priority].label}</Badge>}
        </div>
        <p className="mt-0.5 leading-snug font-medium">{w.title}</p>
        <p className="text-xs text-muted">{(w.clients as unknown as { name: string } | null)?.name}</p>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent" style={{ width: `${w.progress}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="text-muted">{(w.assets as unknown as { code: string } | null)?.code ?? (w.sites as unknown as { name: string } | null)?.name}</span>
          {w.due_date && <span className={late ? "font-medium text-danger" : "text-muted"}>{formatDate(w.due_date)}</span>}
        </div>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={sectorConfig.workOrder.labelPlural}
        subtitle={`${wos.length} ${sp.status === "done" ? "livrés" : "en cours"} · les nouveaux dossiers naissent de l'acceptation d'un devis`}
        actions={
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm">
            {(["board", "list"] as const).map((v) => (
              <Link key={v} href={href({ view: v === "board" ? undefined : v })} className={clsx("rounded-md px-3 py-1", view === v ? "bg-surface shadow-sm" : "text-muted")}>
                {v === "board" ? "Tableau" : "Liste"}
              </Link>
            ))}
          </div>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <form className="mb-4 flex flex-wrap gap-2">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <Select name="site" defaultValue={sp.site ?? ""} className="max-w-56">
          <option value="">Tous les sites</option>
          {sectorConfig.sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select name="family" defaultValue={sp.family ?? ""} className="max-w-56">
          <option value="">Toutes les familles</option>
          {sectorConfig.productFamilies.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="max-w-40">
          <option value="">En cours</option>
          <option value="done">Livrés</option>
        </Select>
        <button className="rounded-lg border border-border bg-surface-2 px-4 text-sm">Filtrer</button>
      </form>

      {view === "board" && sp.status !== "done" ? (
        <div className="flex items-start gap-3 overflow-x-auto pb-4" data-testid="wo-board">
          {stages.map((s) => {
            const col = wos.filter((w) => w.stage === s.id);
            return (
              <section key={s.id} className="flex min-h-40 w-64 shrink-0 flex-col rounded-card border border-border bg-surface-2/50">
                <header className="flex items-center justify-between border-b border-border px-3 py-2.5 text-sm font-semibold" style={{ borderTop: `3px solid ${s.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                  {s.label}
                  <span className="rounded-full bg-surface px-2 text-xs text-muted">{col.length}</span>
                </header>
                <div className="space-y-2 p-2">{col.map(card)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <Table head={["N°", "Objet", "Client", "Étape", "Avancement", "Machine", "Échéance", "Priorité"]} empty={!wos.length && <EmptyState title="Aucun dossier" />}>
          {wos.map((w) => {
            const late = w.status === "active" && w.due_date && w.due_date < today;
            return (
              <tr key={w.id} className="hover:bg-surface-2/60">
                <Td><Link href={`/ops/work-orders/${w.id}`} className="font-medium hover:text-accent">{w.number}</Link></Td>
                <Td className="max-w-72 truncate">{w.title}</Td>
                <Td className="text-muted">{(w.clients as unknown as { name: string } | null)?.name}</Td>
                <Td><Badge tone="accent">{w.status === "done" ? "Livré" : stages.find((s) => s.id === w.stage)?.label}</Badge></Td>
                <Td className="tabular-nums">{w.progress} %</Td>
                <Td className="text-muted">{(w.assets as unknown as { code: string } | null)?.code ?? "—"}</Td>
                <Td className={late ? "font-medium text-danger" : "text-muted"}>{w.due_date ? formatDate(w.due_date) : "—"}</Td>
                <Td><Badge tone={PRIORITY[w.priority].tone}>{PRIORITY[w.priority].label}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
