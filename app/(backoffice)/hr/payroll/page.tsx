import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { payrollVariables } from "@/lib/services/payroll";
import { formatMoney, formatNumber } from "@/lib/format";
import { EmptyState, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";

export const metadata = { title: "Variables de paie" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx, "salaries")) return <EmptyState title="Réservé à la direction et aux RH" />;
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const rows = await payrollVariables(db, month);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const total = rows.reduce((s, r) => s + (r.baseMonthly ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Variables de paie"
        subtitle={`${rows[0]?.workable ?? 0} jours ouvrés · heures issues des badges, absences issues des congés validés · masse salariale de base ${formatMoney(total)}`}
        actions={
          <>
            <form className="flex gap-2">
              <Select name="month" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{new Date(`${m}-15`).toLocaleDateString(sectorConfig.company.locale, { month: "long", year: "numeric" })}</option>)}</Select>
              <button className="rounded-lg border border-border bg-surface-2 px-3 text-sm">OK</button>
            </form>
            <a href={`/hr/payroll/export?kind=payroll&month=${month}`} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white" data-testid="export-payroll">Export CSV (cabinet)</a>
          </>
        }
      />
      <Table head={["Salarié", "Contrat", "Base brute / mois", "Heures badgées", "Heures contrat", "Heures sup.", "CP", "RTT", "Maladie", "Autres"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.job}</p></Td>
            <Td className="text-muted">{r.contract}{r.months === 13 && " · 13e mois"}</Td>
            <Td className="text-right tabular-nums">{r.baseMonthly !== null ? formatMoney(r.baseMonthly) : "—"}</Td>
            <Td className="text-right tabular-nums">{formatNumber(r.hours)}</Td>
            <Td className="text-right text-muted tabular-nums">{formatNumber(r.contractMonthly)}</Td>
            <Td className={`text-right tabular-nums ${r.overtime ? "text-warn" : "text-muted"}`}>{r.overtime ? formatNumber(r.overtime) : "—"}</Td>
            <Td className="text-right tabular-nums">{r.paidLeave || "—"}</Td>
            <Td className="text-right tabular-nums">{r.rtt || "—"}</Td>
            <Td className="text-right tabular-nums">{r.sick || "—"}</Td>
            <Td className="text-right tabular-nums">{r.other || "—"}</Td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-muted">Le bulletin lui-même (cotisations, net) reste produit par votre logiciel de paie ou votre cabinet : cet export lui fournit les variables du mois.</p>
    </>
  );
}
