import Link from "next/link";
import clsx from "clsx";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { todayIso } from "@/lib/domain/kpis";
import { categoryOf, policyWarnings, toReimburse, WARNING_LABEL } from "@/lib/domain/expenses";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EXPENSE_STATUS } from "@/components/expenses/status";
import { approveExpensesAction, markReimbursedAction, rejectExpensesAction } from "./actions";

export const metadata = { title: "Notes de frais" };

const TABS = [
  { id: "pending", label: "À valider" },
  { id: "approved", label: "À rembourser" },
  { id: "history", label: "Historique" },
];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab : "pending";
  const today = todayIso(sectorConfig.company.timezone);
  const policy = sectorConfig.expenses;
  const { data: rows } = await db
    .from("expenses")
    .select("id, employee_id, label, category, amount, vat_amount, km, spent_on, status, receipt_path, comment, rejection_reason, billable, decided_at, reimbursed_at, employees:employees!expenses_employee_id_fkey(first_name, last_name), work_orders(number)")
    .order("spent_on", { ascending: false })
    .limit(500);
  const all = rows ?? [];
  const shown = all.filter((e) => (tab === "pending" ? e.status === "pending" : tab === "approved" ? e.status === "approved" : e.status === "reimbursed" || e.status === "rejected"));
  const owed = toReimburse(all.map((e) => ({ ...e, amount: Number(e.amount) })));
  const name = (e: (typeof all)[number]) => {
    const x = e.employees as unknown as { first_name: string; last_name: string } | null;
    return x ? `${x.first_name} ${x.last_name}` : "—";
  };
  const approve = can(ctx, "expenses", "approve");
  const pay = can(ctx, "expenses", "update");
  const sum = (s: string) => all.filter((e) => e.status === s).reduce((t, e) => t + Number(e.amount), 0);

  return (
    <>
      <PageHeader
        title="Notes de frais"
        subtitle={`Saisies par chacun dans « Mon espace ». Remboursement ${policy.reimbursement === "payroll" ? "sur la paie (variables de paie)" : "par virement"}.`}
        actions={can(ctx, "expenses", "export") ? <LinkButton variant="secondary" href="/finance/expenses/export">Exporter les notes validées (CSV)</LinkButton> : undefined}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="À valider" value={formatMoney(sum("pending"))} hint={`${all.filter((e) => e.status === "pending").length} note(s)`} tone={sum("pending") ? "warn" : "ok"} />
        <Stat label="Validées, à rembourser" value={formatMoney(sum("approved"))} hint={`${owed.size} salarié(s)`} />
        <Stat label="TVA récupérable (validées)" value={formatMoney(all.filter((e) => e.status !== "rejected" && e.status !== "pending" && categoryOf(policy, e.category)?.vatRecoverable).reduce((t, e) => t + Number(e.vat_amount), 0))} hint="à reporter sur la déclaration" />
      </div>
      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.id} href={`/finance/expenses?tab=${t.id}`} className={clsx("rounded-full border px-3 py-1 text-sm", tab === t.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <form>
        <Table
          head={["", "Salarié", "Dépense", "Date", "Montant TTC", "Contrôles", "Statut"]}
          empty={!shown.length && <EmptyState title={tab === "pending" ? "Aucune note à valider ✓" : "Rien ici"} />}
        >
          {shown.map((e) => {
            const warns = e.status === "pending" ? policyWarnings(policy, { category: e.category ?? "", amount: Number(e.amount), spent_on: e.spent_on, receipt: !!e.receipt_path }, today) : [];
            const wo = e.work_orders as unknown as { number: string } | null;
            return (
              <tr key={e.id} data-testid="expense-row">
                <Td className="w-8">{tab !== "history" && <input type="checkbox" name="expense_id" value={e.id} defaultChecked={tab === "pending" ? !warns.length : true} aria-label={`Sélectionner ${e.label}`} />}</Td>
                <Td className="whitespace-nowrap">{name(e)}</Td>
                <Td>
                  <span className="block">{e.label}</span>
                  <span className="text-xs text-muted">
                    {categoryOf(policy, e.category)?.label ?? e.category}{e.km ? ` · ${formatNumber(Number(e.km))} km` : ""}{wo ? ` · ${wo.number}${e.billable ? " (refacturable)" : ""}` : ""}
                    {e.receipt_path && <> · <a href={`/finance/expenses/${e.id}/receipt`} className="text-accent">justificatif</a></>}
                    {e.comment && ` · « ${e.comment} »`}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDate(e.spent_on)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(e.amount)}<span className="block text-xs text-muted">dont TVA {formatMoney(e.vat_amount)}</span></Td>
                <Td>{warns.length ? warns.map((w) => <Badge key={w} tone="warn" className="mr-1">{WARNING_LABEL[w]}</Badge>) : e.status === "pending" ? <span className="text-xs text-ok">conforme</span> : e.rejection_reason ? <span className="text-xs text-danger">{e.rejection_reason}</span> : null}</Td>
                <Td><Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge></Td>
              </tr>
            );
          })}
        </Table>
        {tab === "pending" && approve && shown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SubmitButton formAction={approveExpensesAction} testId="expenses-approve">Valider la sélection</SubmitButton>
            <input name="reason" placeholder="Motif du refus" className="w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <SubmitButton formAction={rejectExpensesAction} variant="danger">Refuser la sélection</SubmitButton>
            <span className="text-xs text-muted">Les notes non conformes ne sont pas cochées d&apos;office.</span>
          </div>
        )}
        {tab === "approved" && pay && shown.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <SubmitButton formAction={markReimbursedAction} testId="expenses-reimburse">Marquer remboursées</SubmitButton>
            <span className="text-xs text-muted">{policy.reimbursement === "payroll" ? "Les montants apparaissent dans les variables de paie du mois." : "Après le virement."}</span>
          </div>
        )}
      </form>
      {tab === "approved" && owed.size > 0 && (
        <ul className="mt-6 space-y-1 text-sm" data-testid="owed">
          {[...owed.entries()].map(([emp, amount]) => (
            <li key={emp} className="flex max-w-md justify-between">
              <span>{name(all.find((e) => e.employee_id === emp)!)}</span>
              <span className="tabular-nums">{formatMoney(amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
