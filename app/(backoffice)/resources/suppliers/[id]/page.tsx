import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { todayIso } from "@/lib/domain/kpis";
import { supplierPerformance } from "@/lib/domain/purchasing";
import { stockLevel } from "@/lib/domain/stock";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Stat } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SupplierFields } from "@/components/resources/SupplierFields";
import { PO_STATUS, STOCK_CATEGORIES } from "@/components/resources/status";
import { archiveSupplierAction, deleteSupplierAction, updateSupplierAction } from "../../actions";

export const metadata = { title: "Fournisseur" };

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const [{ data: s }, { data: pos }, { data: items }, { data: threads }] = await Promise.all([
    db.from("suppliers").select("*").eq("id", id).maybeSingle(),
    db.from("purchase_orders").select("id, number, status, total, expected_on, sent_at, received_at").eq("supplier_id", id).order("number", { ascending: false }),
    db.from("stock_items").select("id, sku, label, quantity, min_quantity, unit").eq("supplier_id", id).order("label"),
    db.from("threads").select("id, subject, last_message_at").eq("supplier_id", id).order("last_message_at", { ascending: false }).limit(5),
  ]);
  if (!s) notFound();
  const perf = supplierPerformance((pos ?? []).map((p) => ({ ...p, total: Number(p.total) })), today);
  const write = can(ctx, "resources", "update");

  return (
    <>
      <PageHeader
        back={{ href: "/resources/suppliers", label: "Fournisseurs" }}
        title={<span className="flex items-center gap-3">{s.name} {!s.active && <Badge>archivé</Badge>}</span>}
        subtitle={STOCK_CATEGORIES[s.category ?? ""] ?? s.category ?? undefined}
        actions={
          write && (
            <>
              <form action={archiveSupplierAction}>
                <input type="hidden" name="supplier_id" value={s.id} />
                <input type="hidden" name="active" value={String(!s.active)} />
                <SubmitButton variant="secondary" testId="supplier-archive">{s.active ? "Archiver" : "Réactiver"}</SubmitButton>
              </form>
              {can(ctx, "resources", "delete") && !pos?.length && (
                <form action={deleteSupplierAction}>
                  <input type="hidden" name="supplier_id" value={s.id} />
                  <SubmitButton variant="danger" confirm={`Supprimer ${s.name} ?`}>Supprimer</SubmitButton>
                </form>
              )}
            </>
          )
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Commandes" value={perf.orders} />
        <Stat label="Livrées à l'heure" value={perf.onTimeRate === null ? "—" : formatPercent(perf.onTimeRate)} tone={perf.onTimeRate === null ? "neutral" : perf.onTimeRate >= 0.9 ? "ok" : "warn"} hint={perf.averageDelay ? `retard moyen ${formatNumber(perf.averageDelay)} j` : undefined} />
        <Stat label="En cours" value={formatMoney(perf.openValue)} hint={`${perf.open} commande(s)${perf.lateOpen ? ` · ${perf.lateOpen} en retard` : ""}`} tone={perf.lateOpen ? "danger" : "neutral"} />
        <Stat label="Délai annoncé" value={`${s.lead_time_days ?? "—"} j`} hint={`paiement à ${s.payment_terms_days} j`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardTitle>Fiche</CardTitle>
          <form action={updateSupplierAction} className="space-y-4">
            <input type="hidden" name="supplier_id" value={s.id} />
            <SupplierFields s={s} categories={STOCK_CATEGORIES} disabled={!write} />
            {write && <SubmitButton testId="supplier-save">Enregistrer</SubmitButton>}
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Commandes</CardTitle>
            <ul className="space-y-1.5 text-sm">
              {(pos ?? []).slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link href={`/resources/purchase-orders/${p.id}`} className="hover:text-accent">{p.number} <span className="text-xs text-muted">· {formatMoney(p.total)}</span></Link>
                  <span className="flex items-center gap-1">
                    {p.expected_on && <span className="text-xs text-muted">{formatDate(p.expected_on)}</span>}
                    <Badge tone={PO_STATUS[p.status]?.tone ?? "neutral"}>{PO_STATUS[p.status]?.label ?? p.status}</Badge>
                  </span>
                </li>
              ))}
              {!pos?.length && <li className="text-muted">Aucune commande.</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Articles fournis</CardTitle>
            <ul className="space-y-1.5 text-sm">
              {(items ?? []).map((i) => (
                <li key={i.id} className="flex justify-between">
                  <Link href={`/resources/stock/${i.id}`} className="hover:text-accent">{i.label}</Link>
                  <span className={stockLevel(Number(i.quantity), Number(i.min_quantity)) === "ok" ? "text-muted" : "text-warn"}>{formatNumber(i.quantity)} {i.unit}</span>
                </li>
              ))}
              {!items?.length && <li className="text-muted">Aucun article rattaché.</li>}
            </ul>
          </Card>
          {!!threads?.length && (
            <Card>
              <CardTitle>Échanges</CardTitle>
              <ul className="space-y-1.5 text-sm">
                {threads.map((t) => <li key={t.id}><Link href={`/comms/threads/${t.id}`} className="hover:text-accent">{t.subject}</Link></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
