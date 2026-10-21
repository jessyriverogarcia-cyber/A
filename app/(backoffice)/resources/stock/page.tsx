import Link from "next/link";
import clsx from "clsx";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatNumber } from "@/lib/format";
import { stockLevel } from "@/lib/domain/stock";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { StockGauge } from "@/components/resources/StockGauge";
import { reorderAction } from "../actions";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const metadata = { title: "Stock" };

const CATEGORIES: Record<string, string> = { filament: "Filaments", resin: "Résines", powder_polymer: "Poudres polymère", powder_metal: "Poudres métal", gas: "Gaz", finished_part: "Pièces finies" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  let query = db.from("stock_items").select("id, sku, label, category, unit, quantity, min_quantity, unit_cost, hazardous, suppliers(name), zones(name)").order("category").order("label");
  if (sp.category) query = query.eq("category", sp.category);
  const { data: items } = await query;
  const rows = (items ?? []).filter((i) => !sp.low || Number(i.quantity) < Number(i.min_quantity));
  const create = can(ctx, "resources", "create");

  return (
    <>
      <LiveRefresh orgId={ctx.org.id} tables={["stock_items"]} />
      <PageHeader title="Stock" subtitle={`${rows.length} articles · cochez des articles puis « Commander » pour un réassort pré-rempli`} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 flex flex-wrap gap-1">
        {[["", "Tous"], ...Object.entries(CATEGORIES)].map(([k, v]) => (
          <Link key={k} href={k ? `/resources/stock?category=${k}` : "/resources/stock"} className={clsx("rounded-full px-3 py-1 text-xs", (sp.category ?? "") === k && !sp.low ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-text")}>{v}</Link>
        ))}
        <Link href="/resources/stock?low=1" className={clsx("rounded-full px-3 py-1 text-xs", sp.low ? "bg-warn text-white" : "bg-surface-2 text-muted hover:text-text")}>Sous le minimum</Link>
      </div>
      <form action={reorderAction}>
        <input type="hidden" name="back" value="/resources/stock" />
        <Table head={[create ? "" : null, "Article", "Catégorie", "Emplacement", "Niveau", "Quantité", "Valeur", "Fournisseur"].filter((h) => h !== null)} empty={!rows.length && <EmptyState title="Aucun article" />}>
          {rows.map((i) => {
            const lvl = stockLevel(Number(i.quantity), Number(i.min_quantity));
            return (
              <tr key={i.id} className="hover:bg-surface-2/60">
                {create && <Td className="w-8"><input type="checkbox" name="item_id" value={i.id} defaultChecked={lvl !== "ok"} aria-label={`Sélectionner ${i.label}`} /></Td>}
                <Td>
                  <Link href={`/resources/stock/${i.id}`} className="font-medium hover:text-accent">{i.label}</Link>
                  <p className="text-xs text-muted">{i.sku}{i.hazardous && " · ⚠ dangereux"}</p>
                </Td>
                <Td className="text-muted">{CATEGORIES[i.category] ?? i.category}</Td>
                <Td className="text-muted">{(i.zones as unknown as { name: string } | null)?.name ?? "—"}</Td>
                <Td className="w-40"><StockGauge quantity={Number(i.quantity)} min={Number(i.min_quantity)} /></Td>
                <Td className={clsx("text-right whitespace-nowrap tabular-nums", lvl !== "ok" && "font-medium text-warn")}>
                  {formatNumber(i.quantity)} / {formatNumber(i.min_quantity)} {i.unit}
                </Td>
                <Td className="text-right tabular-nums">{formatMoney(Number(i.quantity) * Number(i.unit_cost ?? 0))}</Td>
                <Td className="text-muted">{(i.suppliers as unknown as { name: string } | null)?.name ?? <Badge>aucun</Badge>}</Td>
              </tr>
            );
          })}
        </Table>
        {create && <div className="mt-3"><SubmitButton testId="reorder-selected">Commander la sélection</SubmitButton></div>}
      </form>
    </>
  );
}
