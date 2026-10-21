import Link from "next/link";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { effectiveStatus } from "@/lib/domain/invoice";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { INVOICE_KIND, INVOICE_STATUS } from "@/components/finance/status";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const { data } = await db.from("invoices").select("id, number, kind, status, issue_date, due_date, total_ht, total_ttc, paid_amount, clients(name), work_orders(number)").order("number", { ascending: false });
  const rows = (data ?? [])
    .map((i) => ({ ...i, eff: effectiveStatus({ status: i.status, due_date: i.due_date, paid_amount: Number(i.paid_amount), total_ttc: Number(i.total_ttc) }, today) }))
    .filter((i) => !sp.status || i.eff === sp.status);
  const filters = ["", "draft", "sent", "partially_paid", "overdue", "paid"];

  return (
    <>
      <PageHeader title="Factures" subtitle="Les factures se créent depuis un dossier livré (onglet « À faire aujourd'hui ») ou depuis la fiche du dossier." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 flex flex-wrap gap-1">
        {filters.map((s) => (
          <Link key={s} href={s ? `/finance/invoices?status=${s}` : "/finance/invoices"} className={clsx("rounded-full px-3 py-1 text-xs", (sp.status ?? "") === s ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {s ? INVOICE_STATUS[s].label : "Toutes"}
          </Link>
        ))}
      </div>
      <Table head={["N°", "Type", "Client", "Dossier", "Date", "Échéance", "TTC", "Reste dû", "Statut"]} empty={!rows.length && <EmptyState title="Aucune facture" />}>
        {rows.map((i) => {
          const st = INVOICE_STATUS[i.eff];
          const remaining = Number(i.total_ttc) - Number(i.paid_amount);
          return (
            <tr key={i.id} className="hover:bg-surface-2/60">
              <Td><Link href={`/finance/invoices/${i.id}`} className="font-medium hover:text-accent">{i.number}</Link></Td>
              <Td className="text-muted">{INVOICE_KIND[i.kind]}</Td>
              <Td>{(i.clients as unknown as { name: string } | null)?.name}</Td>
              <Td className="text-muted">{(i.work_orders as unknown as { number: string } | null)?.number ?? "—"}</Td>
              <Td className="text-muted">{formatDate(i.issue_date)}</Td>
              <Td className={i.eff === "overdue" ? "font-medium text-danger" : "text-muted"}>{formatDate(i.due_date)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(i.total_ttc)}</Td>
              <Td className="text-right tabular-nums">{i.eff === "paid" || i.status === "draft" ? "—" : formatMoney(remaining)}</Td>
              <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
