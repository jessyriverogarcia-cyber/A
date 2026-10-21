import { getTranslations } from "next-intl/server";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { ACTIONS, MODULES } from "@/lib/domain/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import { RealtimePanel } from "./RealtimePanel";

export const metadata = { title: "Page technique" };

const TABLES = [
  "sites", "zones", "map_objects", "employees", "employee_salaries", "badge_events", "presence_status",
  "calendar_events", "leave_requests", "time_entries", "candidates", "clients", "contacts", "deals",
  "catalog_items", "quotes", "quote_lines", "work_orders", "work_order_stages", "tasks", "assets",
  "stock_items", "suppliers", "purchase_orders", "invoices", "payments", "expenses", "threads",
  "messages", "notifications", "activity_events", "audit_log", "roles", "permissions",
] as const;

export default async function TechPage() {
  const ctx = await requireUser();
  const t = await getTranslations("tech");
  const supabase = await createClient();

  const counts = await Promise.all(
    TABLES.map(async (table) => {
      const { count, error } = await supabase.from(table as "sites").select("*", { count: "exact", head: true });
      return { table, count: error ? null : (count ?? 0) };
    }),
  );
  const [{ data: wos }, { data: presence }, { data: stock }, { data: invoices }, { data: events }] = await Promise.all([
    supabase.from("work_orders").select("number, title, stage, progress, due_date, clients(name)").order("number").limit(8),
    supabase.from("presence_status").select("status"),
    supabase.from("stock_items").select("sku, label, quantity, min_quantity, unit"),
    supabase.from("invoices").select("number, status, total_ttc, due_date").order("number"),
    supabase.from("activity_events").select("id, type, payload, at").order("at", { ascending: false }).limit(10),
  ]);
  const stageLabel = (id: string) => sectorConfig.workOrder.stages.find((s) => s.id === id)?.label ?? id;
  const presenceCount = (presence ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status ?? "absent"]: (acc[p.status ?? "absent"] ?? 0) + 1 }), {});
  const lowStock = (stock ?? []).filter((s) => Number(s.quantity) < Number(s.min_quantity));

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>{t("session")}</CardTitle>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-muted">Utilisateur : </dt><dd className="inline" data-testid="tech-user">{ctx.full_name}</dd></div>
            <div><dt className="inline text-muted">Organisation : </dt><dd className="inline">{ctx.org.name}</dd></div>
            <div><dt className="inline text-muted">{t("role")} : </dt><dd className="inline" data-testid="tech-role">{ctx.role.label}</dd></div>
            <div><dt className="inline text-muted">Salaires visibles : </dt><dd className="inline">{ctx.role.can_see_salaries ? "oui" : "non"}</dd></div>
            <div><dt className="inline text-muted">Intégrations : </dt><dd className="inline"><Badge tone="warn">mode simulé</Badge></dd></div>
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>{t("permissions")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-left font-medium">Module</th>
                  {ACTIONS.map((a) => <th key={a} className="px-1 font-medium">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="border-t border-border">
                    <td className="py-1">{m}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} className="text-center">
                        {ctx.permissions.includes(`${m}:${a}`) ? <span className="text-ok">●</span> : <span className="text-border">○</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>{t("tables")}</CardTitle>
        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4" data-testid="tech-counts">
          {counts.map(({ table, count }) => (
            <div key={table} className="flex justify-between border-b border-border/60 py-1">
              <code className="text-xs">{table}</code>
              <span className={clsx("text-xs", count ? "font-medium" : "text-muted")}>
                {count === null ? t("denied") : count === 0 ? "0 (RLS ou vide)" : count}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{sectorConfig.workOrder.labelPlural}</CardTitle>
          {wos?.length ? (
            <table className="w-full text-sm">
              <tbody>
                {wos.map((w) => (
                  <tr key={w.number} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-xs text-muted">{w.number}</td>
                    <td className="py-1.5 pr-2">{w.title}<div className="text-xs text-muted">{(w.clients as unknown as { name: string } | null)?.name}</div></td>
                    <td className="py-1.5 pr-2"><Badge tone="accent">{stageLabel(w.stage)}</Badge></td>
                    <td className="py-1.5 text-right text-xs">{w.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-muted">{t("denied")}</p>}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Présence en temps réel</CardTitle>
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(presenceCount).map(([s, n]) => <Badge key={s} tone={s === "at_station" ? "ok" : s === "absent" ? "neutral" : "info"}>{s} · {n}</Badge>)}
            </div>
          </Card>
          <Card>
            <CardTitle>Stock sous le minimum</CardTitle>
            <ul className="space-y-1 text-sm">
              {lowStock.map((s) => <li key={s.sku} className="flex justify-between"><span>{s.label}</span><span className="text-warn">{s.quantity} / {s.min_quantity} {s.unit}</span></li>)}
              {!stock?.length && <li className="text-muted">{t("denied")}</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Factures</CardTitle>
            <ul className="space-y-1 text-sm">
              {(invoices ?? []).map((i) => <li key={i.number} className="flex justify-between"><span className="text-xs">{i.number} · {formatDate(i.due_date)}</span><span>{formatMoney(i.total_ttc)} <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "danger" : "neutral"}>{i.status}</Badge></span></li>)}
              {!invoices?.length && <li className="text-muted">{t("denied")}</li>}
            </ul>
          </Card>
        </div>
      </div>

      <RealtimePanel orgId={ctx.org.id} initial={(events ?? []) as { id: string; type: string; payload: Record<string, unknown>; at: string }[]} />
    </div>
  );
}
