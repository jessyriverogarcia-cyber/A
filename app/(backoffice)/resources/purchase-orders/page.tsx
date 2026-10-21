import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { PO_STATUS } from "@/components/resources/status";

export const metadata = { title: "Commandes fournisseurs" };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const { data: pos } = await db.from("purchase_orders").select("id, number, status, total, expected_on, lines, sent_at, received_at, suppliers(name)").order("number", { ascending: false });
  return (
    <>
      <PageHeader title="Commandes fournisseurs" subtitle="Créées en un clic depuis les articles sous le minimum." />
      <Flash ok={sp.ok} err={sp.err} />
      <Table head={["N°", "Fournisseur", "Articles", "Total HT", "Livraison prévue", "Statut"]} empty={!pos?.length && <EmptyState title="Aucune commande" hint="Commandez depuis l'onglet Stock ou « À faire aujourd'hui »." />}>
        {(pos ?? []).map((p) => {
          const lines = p.lines as unknown as { label: string }[];
          const late = p.status === "sent" && p.expected_on && p.expected_on < today;
          return (
            <tr key={p.id} className="hover:bg-surface-2/60">
              <Td><Link href={`/resources/purchase-orders/${p.id}`} className="font-medium hover:text-accent">{p.number}</Link></Td>
              <Td>{(p.suppliers as unknown as { name: string } | null)?.name}</Td>
              <Td className="max-w-72 truncate text-muted">{lines.map((l) => l.label).join(", ")}</Td>
              <Td className="text-right tabular-nums">{formatMoney(p.total)}</Td>
              <Td className={late ? "font-medium text-danger" : "text-muted"}>{p.expected_on ? formatDate(p.expected_on) : "—"}</Td>
              <Td><Badge tone={PO_STATUS[p.status]?.tone ?? "neutral"}>{PO_STATUS[p.status]?.label ?? p.status}</Badge></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
