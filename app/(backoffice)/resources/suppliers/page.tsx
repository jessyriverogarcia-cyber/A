import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { todayIso } from "@/lib/domain/kpis";
import { supplierPerformance } from "@/lib/domain/purchasing";
import { formatMoney, formatPercent } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, LinkButton, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { STOCK_CATEGORIES } from "@/components/resources/status";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const [{ data: suppliers }, { data: pos }] = await Promise.all([
    db.from("suppliers").select("id, name, category, contact_name, email, lead_time_days, active").order("active", { ascending: false }).order("name"),
    db.from("purchase_orders").select("supplier_id, status, expected_on, received_at, total"),
  ]);
  return (
    <>
      <PageHeader title="Fournisseurs" subtitle="Délais, taux de service et commandes en cours, calculés depuis les commandes." actions={can(ctx, "resources", "create") ? <LinkButton href="/resources/suppliers/new">Nouveau fournisseur</LinkButton> : undefined} />
      <Flash ok={sp.ok} err={sp.err} />
      <Table head={["Fournisseur", "Catégorie", "Contact", "Délai", "À l'heure", "En cours", ""]} empty={!suppliers?.length && <EmptyState title="Aucun fournisseur" />}>
        {(suppliers ?? []).map((s) => {
          const perf = supplierPerformance((pos ?? []).filter((p) => p.supplier_id === s.id).map((p) => ({ ...p, total: Number(p.total) })), today);
          return (
            <tr key={s.id} className={s.active ? "" : "opacity-60"} data-testid="supplier-row">
              <Td><Link href={`/resources/suppliers/${s.id}`} className="font-medium hover:text-accent">{s.name}</Link></Td>
              <Td className="text-muted">{STOCK_CATEGORIES[s.category ?? ""] ?? s.category ?? "—"}</Td>
              <Td className="text-muted">{s.contact_name ?? s.email ?? "—"}</Td>
              <Td className="tabular-nums">{s.lead_time_days ?? "—"} j</Td>
              <Td className="tabular-nums">{perf.onTimeRate === null ? <span className="text-muted">—</span> : <span className={perf.onTimeRate >= 0.9 ? "text-ok" : perf.onTimeRate >= 0.7 ? "text-warn" : "text-danger"}>{formatPercent(perf.onTimeRate)}</span>}</Td>
              <Td className="tabular-nums">{perf.open ? `${perf.open} · ${formatMoney(perf.openValue)}` : "—"}{perf.lateOpen > 0 && <Badge tone="danger" className="ml-2">{perf.lateOpen} en retard</Badge>}</Td>
              <Td>{!s.active && <Badge>archivé</Badge>}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
