import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { QUOTE_STATUS } from "@/components/crm/status";

export const metadata = { title: "Devis" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  let query = db.from("quotes").select("id, number, status, issue_date, valid_until, total_ht, total_cost, followups, clients(name), deals(title)").order("number", { ascending: false });
  if (sp.status) query = query.eq("status", sp.status);
  const { data: quotes } = await query;
  const statuses = ["", "draft", "sent", "accepted", "rejected"];

  return (
    <>
      <PageHeader title="Devis" subtitle="Créez un devis depuis la fiche client ou une affaire du pipeline." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 flex flex-wrap gap-1">
        {statuses.map((s) => (
          <Link key={s} href={s ? `/crm/quotes?status=${s}` : "/crm/quotes"} className={clsx("rounded-full px-3 py-1 text-xs", (sp.status ?? "") === s ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {s ? QUOTE_STATUS[s].label : "Tous"}
          </Link>
        ))}
      </div>
      <Table head={["N°", "Client", "Objet", "Émis le", "Valide jusqu'au", "Total HT", "Marge", "Statut"]} empty={!quotes?.length && <EmptyState title="Aucun devis" />}>
        {(quotes ?? []).map((q) => {
          const margin = Number(q.total_ht) ? (Number(q.total_ht) - Number(q.total_cost)) / Number(q.total_ht) : 0;
          const st = QUOTE_STATUS[q.status];
          return (
            <tr key={q.id} className="hover:bg-surface-2/60">
              <Td><Link href={`/crm/quotes/${q.id}`} className="font-medium hover:text-accent">{q.number}</Link></Td>
              <Td>{(q.clients as unknown as { name: string } | null)?.name}</Td>
              <Td className="max-w-64 truncate text-muted">{(q.deals as unknown as { title: string } | null)?.title}</Td>
              <Td className="text-muted">{formatDate(q.issue_date)}</Td>
              <Td className="text-muted">{q.valid_until ? formatDate(q.valid_until) : "—"}</Td>
              <Td className="text-right tabular-nums">{formatMoney(q.total_ht)}</Td>
              <Td className={clsx("text-right tabular-nums", margin >= 0.45 ? "text-ok" : margin >= 0.25 ? "text-warn" : "text-danger")}>{Number(q.total_ht) ? formatPercent(margin) : "—"}</Td>
              <Td><Badge tone={st?.tone ?? "neutral"}>{st?.label ?? q.status}</Badge>{q.followups > 0 && <span className="ml-1 text-xs text-muted">· {q.followups} relance(s)</span>}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
