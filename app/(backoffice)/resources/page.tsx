import Link from "next/link";
import { redirect } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { maintenanceState } from "@/lib/domain/stock";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { ASSET_STATUS_LABEL } from "@/lib/map/theme";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Stat } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { StockGauge } from "@/components/resources/StockGauge";
import { reorderAction } from "./actions";

export const metadata = { title: "Ressources & stock" };

export default async function ResourcesHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Liens profonds depuis la Map
  if (sp.stock) redirect(`/resources/stock/${sp.stock}`);
  if (sp.asset) redirect(`/resources/equipment/${sp.asset}`);
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);

  const [{ data: items }, { data: pos }, { data: assets }] = await Promise.all([
    db.from("stock_items").select("id, sku, label, category, unit, quantity, min_quantity, unit_cost, hazardous, suppliers(name)").order("label"),
    db.from("purchase_orders").select("id, number, status, total, expected_on, lines, suppliers(name)").in("status", ["draft", "sent", "partially_received"]).order("expected_on"),
    db.from("assets").select("id, code, name, kind, status, next_maintenance_on").in("kind", ["machine", "equipment"]).order("code"),
  ]);
  const onOrder = new Set((pos ?? []).flatMap((p) => (p.lines as unknown as { stock_item_id?: string }[]).map((l) => l.stock_item_id)));
  const low = (items ?? []).filter((i) => Number(i.quantity) < Number(i.min_quantity));
  const toOrder = low.filter((i) => !onOrder.has(i.id));
  const incoming = (pos ?? []).filter((p) => p.status === "sent" || p.status === "partially_received");
  const drafts = (pos ?? []).filter((p) => p.status === "draft");
  const down = (assets ?? []).filter((a) => a.status === "down");
  const maint = (assets ?? []).filter((a) => ["overdue", "due_soon"].includes(maintenanceState(a.next_maintenance_on, today)));
  const stockValue = (items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost ?? 0), 0);
  const create = can(ctx, "resources", "create");

  const tile = (title: string, count: number, children: React.ReactNode, tone: "danger" | "warn" | "info" | "accent" = "accent", action?: React.ReactNode) => (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <CardTitle className="mb-0">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {action}
          <Badge tone={count ? tone : "neutral"}>{count}</Badge>
        </div>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">{count ? children : <li className="px-4 py-4 text-sm text-muted">Rien à signaler ✓</li>}</ul>
    </Card>
  );

  return (
    <>
      <PageHeader title="Ressources & stock" subtitle="Matières, commandes fournisseurs et maintenance du parc machines." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Articles sous le minimum" value={low.length} hint={`${toOrder.length} pas encore commandés`} tone={toOrder.length ? "warn" : "ok"} />
        <Stat label="Commandes en route" value={incoming.length} hint={formatMoney(incoming.reduce((s, p) => s + Number(p.total), 0))} />
        <Stat label="Machines en panne" value={down.length} tone={down.length ? "danger" : "ok"} />
        <Stat label="Valeur du stock" value={formatMoney(stockValue)} hint="au coût d'achat" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-testid="resources-tiles">
        <form action={reorderAction} className="contents">
          <input type="hidden" name="back" value="/resources" />
          {tile(
            "Stock à réapprovisionner",
            toOrder.length,
            toOrder.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {create && <input type="checkbox" name="item_id" value={i.id} defaultChecked aria-label={`Commander ${i.label}`} />}
                <div className="min-w-0 flex-1">
                  <Link href={`/resources/stock/${i.id}`} className="font-medium hover:text-accent">
                    {i.label} {i.hazardous && <span title="Matière dangereuse">⚠</span>}
                  </Link>
                  <StockGauge quantity={Number(i.quantity)} min={Number(i.min_quantity)} className="mt-1" />
                </div>
                <span className="text-xs whitespace-nowrap text-warn">
                  {formatNumber(i.quantity)} / {formatNumber(i.min_quantity)} {i.unit}
                </span>
              </li>
            )),
            "warn",
            create && toOrder.length > 0 && <SubmitButton testId="reorder-all" className="px-3 py-1 text-xs">Commander la sélection</SubmitButton>,
          )}
        </form>
        {tile(
          "Commandes à réceptionner",
          incoming.length,
          incoming.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/resources/purchase-orders/${p.id}`} className="font-medium hover:text-accent">
                {p.number} · {(p.suppliers as unknown as { name: string } | null)?.name}
              </Link>
              <span className={`text-xs ${p.expected_on && p.expected_on < today ? "text-danger" : "text-muted"}`}>prévue le {p.expected_on ? formatDate(p.expected_on) : "—"}</span>
            </li>
          )),
          "info",
        )}
        {tile(
          "Maintenances dues",
          maint.length,
          maint.map((a) => {
            const st = maintenanceState(a.next_maintenance_on, today);
            return (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/resources/equipment/${a.id}`} className="font-medium hover:text-accent">{a.code} · {a.name}</Link>
                <Badge tone={st === "overdue" ? "danger" : "warn"}>{st === "overdue" ? "en retard" : "bientôt"} · {formatDate(a.next_maintenance_on!)}</Badge>
              </li>
            );
          }),
          "warn",
        )}
        {tile(
          "Pannes et bons à envoyer",
          down.length + drafts.length,
          <>
            {down.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/resources/equipment/${a.id}`} className="font-medium hover:text-accent">{a.code} · {a.name}</Link>
                <Badge tone="danger">{ASSET_STATUS_LABEL[a.status]}</Badge>
              </li>
            ))}
            {drafts.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/resources/purchase-orders/${p.id}`} className="font-medium hover:text-accent">{p.number} · {(p.suppliers as unknown as { name: string } | null)?.name}</Link>
                <Badge tone="neutral">brouillon à envoyer</Badge>
              </li>
            ))}
          </>,
          "danger",
        )}
      </div>
    </>
  );
}
