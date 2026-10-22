import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { effectiveStatus } from "@/lib/domain/invoice";
import { formatMoney } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/primitives";
import { PageHeader, Stat, Table, Td } from "@/components/ui/backoffice";

export const metadata = { title: "Trésorerie" };

/**
 * Prévisionnel sur 6 mois : encaissements attendus des factures (à leur échéance, les retards
 * sur le mois courant) + prévision saisie, moins les décaissements prévus.
 */
export default async function CashPage() {
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const [{ data: forecast }, { data: invoices }] = await Promise.all([
    db.from("cash_forecast").select("month, inflow, outflow, note").order("month"),
    db.from("invoices").select("status, due_date, total_ttc, paid_amount").neq("status", "draft").neq("status", "cancelled"),
  ]);
  const months = (forecast ?? []).slice(0, 6);
  const thisMonth = today.slice(0, 7);
  const receivable = new Map<string, number>();
  for (const i of invoices ?? []) {
    const eff = effectiveStatus({ status: i.status, due_date: i.due_date, paid_amount: Number(i.paid_amount), total_ttc: Number(i.total_ttc) }, today);
    if (eff === "paid") continue;
    const m = eff === "overdue" ? thisMonth : i.due_date.slice(0, 7);
    receivable.set(m, (receivable.get(m) ?? 0) + Number(i.total_ttc) - Number(i.paid_amount));
  }
  let balance = 0;
  const rows = months.map((m) => {
    const key = m.month.slice(0, 7);
    const invoicesIn = receivable.get(key) ?? 0;
    const inflow = Number(m.inflow) + invoicesIn;
    const net = inflow - Number(m.outflow);
    balance += net;
    return { key, label: new Date(m.month).toLocaleDateString(sectorConfig.company.locale, { month: "long", year: "numeric" }), invoicesIn, inflow, outflow: Number(m.outflow), net, balance };
  });
  const max = Math.max(1, ...rows.flatMap((r) => [r.inflow, r.outflow]));
  const overdueTotal = [...receivable.entries()].filter(([k]) => k === thisMonth).reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <PageHeader title="Trésorerie" subtitle="Prévisionnel à 6 mois : prévisions saisies + encaissements attendus des factures émises." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Solde cumulé à 6 mois" value={formatMoney(rows.at(-1)?.balance ?? 0)} tone={(rows.at(-1)?.balance ?? 0) >= 0 ? "ok" : "danger"} />
        <Stat label="À encaisser ce mois-ci (dont retards)" value={formatMoney(overdueTotal)} />
        <Stat label="Mois le plus tendu" value={rows.length ? rows.reduce((a, b) => (b.net < a.net ? b : a)).label : "—"} tone="warn" />
      </div>
      <Card className="mb-6">
        <CardTitle>Entrées et sorties</CardTitle>
        <div className="flex h-56 items-end gap-4" data-testid="cash-chart" role="img" aria-label="Entrées et sorties de trésorerie par mois">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-44 w-full items-end justify-center gap-1">
                <div className="w-1/3 rounded-t bg-ok/80" style={{ height: `${(r.inflow / max) * 100}%` }} title={`Entrées ${formatMoney(r.inflow)}`} />
                <div className="w-1/3 rounded-t bg-danger/70" style={{ height: `${(r.outflow / max) * 100}%` }} title={`Sorties ${formatMoney(r.outflow)}`} />
              </div>
              <span className="text-xs text-muted capitalize">{r.label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ok/80" />entrées <span className="mr-1 ml-3 inline-block h-2 w-2 rounded-sm bg-danger/70" />sorties</p>
      </Card>
      <Table head={["Mois", "Factures à encaisser", "Entrées totales", "Sorties prévues", "Solde du mois", "Cumul"]}>
        {rows.map((r) => (
          <tr key={r.key}>
            <Td className="capitalize">{r.label}</Td>
            <Td className="text-right tabular-nums">{formatMoney(r.invoicesIn)}</Td>
            <Td className="text-right tabular-nums">{formatMoney(r.inflow)}</Td>
            <Td className="text-right tabular-nums">{formatMoney(r.outflow)}</Td>
            <Td className={`text-right tabular-nums ${r.net < 0 ? "text-danger" : "text-ok"}`}>{formatMoney(r.net)}</Td>
            <Td className="text-right font-medium tabular-nums">{formatMoney(r.balance)}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
