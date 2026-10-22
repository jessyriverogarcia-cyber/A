import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { averageDailyUse, daysOfCover, reorderQuantity, stockLevel } from "@/lib/domain/stock";
import { formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { StockGauge } from "@/components/resources/StockGauge";
import { reorderAction, stockMovementAction } from "../../actions";

export const metadata = { title: "Article" };

const time = (d: string) => new Date(d).toLocaleString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, dateStyle: "short", timeStyle: "short" });

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const [{ data: it }, { data: moves }, { data: wos }] = await Promise.all([
    db.from("stock_items").select("*, suppliers(name, email, lead_time_days), zones(name, key)").eq("id", id).maybeSingle(),
    db.from("stock_movements").select("id, delta, reason, at, work_orders(number)").eq("stock_item_id", id).order("at", { ascending: false }).limit(30),
    db.from("work_orders").select("id, number, title").eq("status", "active").order("number"),
  ]);
  if (!it) notFound();
  const supplier = it.suppliers as unknown as { name: string; email: string | null; lead_time_days: number | null } | null;
  const zone = it.zones as unknown as { name: string; key: string } | null;
  const qty = Number(it.quantity);
  const min = Number(it.min_quantity);
  const use = averageDailyUse((moves ?? []).map((m) => ({ delta: Number(m.delta), at: m.at })), 30);
  const cover = daysOfCover(qty, use);
  const suggested = reorderQuantity({ quantity: qty, min, dailyUse: use, leadTimeDays: supplier?.lead_time_days ?? 7, packSize: Number(it.pack_size) });
  const lvl = stockLevel(qty, min);
  const write = can(ctx, "resources", "update");
  const create = can(ctx, "resources", "create");
  const site = sectorConfig.sites.find((s) => [...s.zones, ...s.outdoor].some((z) => z.id === zone?.key));

  return (
    <>
      <PageHeader
        back={{ href: "/resources/stock", label: "Stock" }}
        title={<span className="flex items-center gap-3">{it.label} <Badge tone={lvl === "ok" ? "ok" : lvl === "low" ? "warn" : "danger"} data-testid="stock-level">{lvl === "ok" ? "OK" : lvl === "low" ? "Sous le minimum" : "Rupture"}</Badge></span>}
        subtitle={`${it.sku} · ${zone?.name ?? "sans emplacement"}${it.hazardous ? " · matière dangereuse" : ""}`}
        actions={
          <>
            {site && <a href={`/map/${site.id}`} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">Voir sur la Map</a>}
            {create && suggested > 0 && (
              <form action={reorderAction}>
                <input type="hidden" name="item_id" value={it.id} />
                <input type="hidden" name="back" value={`/resources/stock/${it.id}`} />
                <SubmitButton testId="reorder-item">Commander {formatNumber(suggested)} {it.unit}</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-2 flex items-end justify-between">
              <p className="text-3xl font-semibold tabular-nums" data-testid="stock-qty">{formatNumber(qty)} <span className="text-base font-normal text-muted">{it.unit}</span></p>
              <p className="text-sm text-muted">minimum {formatNumber(min)} {it.unit}</p>
            </div>
            <StockGauge quantity={qty} min={min} className="h-3" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Conso. moyenne</dt><dd>{formatNumber(Math.round(use * 10) / 10)} {it.unit}/j</dd></div>
              <div><dt className="text-xs text-muted">Couverture</dt><dd>{cover === null ? "—" : `${cover} jours`}</dd></div>
              <div><dt className="text-xs text-muted">Coût unitaire</dt><dd>{it.unit_cost ? formatMoney(it.unit_cost) : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Valeur</dt><dd>{formatMoney(qty * Number(it.unit_cost ?? 0))}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Mouvements</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {(moves ?? []).map((m) => (
                <li key={m.id} className="flex justify-between py-1.5">
                  <span>{m.reason}{(m.work_orders as unknown as { number: string } | null) && <span className="text-muted"> · {(m.work_orders as unknown as { number: string }).number}</span>} <span className="text-xs text-muted">· {time(m.at)}</span></span>
                  <span className={`tabular-nums ${Number(m.delta) < 0 ? "text-danger" : "text-ok"}`}>{Number(m.delta) > 0 ? "+" : ""}{formatNumber(m.delta)} {it.unit}</span>
                </li>
              ))}
              {!moves?.length && <li className="py-1.5 text-muted">Aucun mouvement.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          {write && (
            <Card>
              <CardTitle>Mouvement de stock</CardTitle>
              <form action={stockMovementAction} className="space-y-2">
                <input type="hidden" name="item_id" value={it.id} />
                <Select name="kind" defaultValue="out" data-testid="move-kind">
                  <option value="out">Sortie (consommation)</option>
                  <option value="in">Entrée</option>
                  <option value="inventory">Inventaire (quantité comptée)</option>
                </Select>
                <Field label={`Quantité (${it.unit})`}><Input type="number" name="qty" step="any" min={0} required data-testid="move-qty" /></Field>
                <Field label="Dossier (sortie)">
                  <Select name="wo_id" defaultValue="">
                    <option value="">—</option>
                    {(wos ?? []).map((w) => <option key={w.id} value={w.id}>{w.number} · {w.title}</option>)}
                  </Select>
                </Field>
                <Field label="Motif"><Input name="reason" placeholder="consommation OF, casse, péremption…" /></Field>
                <SubmitButton testId="move-submit">Enregistrer</SubmitButton>
              </form>
            </Card>
          )}
          <Card>
            <CardTitle>Fournisseur</CardTitle>
            {supplier ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Nom</dt><dd>{supplier.name}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Délai</dt><dd>{supplier.lead_time_days ?? "—"} j</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Conditionnement</dt><dd>{formatNumber(it.pack_size)} {it.unit}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Réassort conseillé</dt><dd className="font-medium">{suggested ? `${formatNumber(suggested)} ${it.unit}` : "aucun"}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-muted">Pas de fournisseur associé.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
