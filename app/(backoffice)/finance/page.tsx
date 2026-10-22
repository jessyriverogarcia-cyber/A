import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { averagePaymentDelay, daysOverdue, effectiveStatus, suggestedDunningLevel } from "@/lib/domain/invoice";
import { dunningEmail } from "@/lib/domain/emails";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, LinkButton, PageHeader, Stat } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MailComposer } from "@/components/crm/MailComposer";
import { createInvoiceFromWoAction, dunningAction } from "./actions";
import { mailMode } from "@/lib/integrations/mail";

export const metadata = { title: "Finance" };

export default async function FinanceHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const mailbox = await mailMode(db);
  if (can(ctx, "finance", "update")) await db.rpc("refresh_overdue_invoices");
  const today = todayIso(sectorConfig.company.timezone);
  const month = today.slice(0, 7);

  const [{ data: invoices }, { data: wos }, { data: pendingExpenses }] = await Promise.all([
    db.from("invoices").select("id, number, kind, status, issue_date, due_date, total_ht, total_ttc, paid_amount, clients(name), contacts(first_name, email), dunning_steps(level, sent_at), payments(paid_on)").order("due_date"),
    db.from("work_orders").select("id, number, title, status, stage, clients(name), quotes(total_ht), invoices(kind, status)").order("number"),
    db.from("expenses").select("id, label, amount, spent_on, employees:employees!expenses_employee_id_fkey(first_name, last_name)").eq("status", "pending").order("spent_on"),
  ]);
  const list = (invoices ?? []).map((i) => ({ ...i, eff: effectiveStatus({ status: i.status, due_date: i.due_date, paid_amount: Number(i.paid_amount), total_ttc: Number(i.total_ttc) }, today) }));
  const overdue = list.filter((i) => i.eff === "overdue");
  const drafts = list.filter((i) => i.status === "draft");
  const outstanding = list.filter((i) => ["sent", "partially_paid", "overdue"].includes(i.eff));
  const dueSoon = outstanding.filter((i) => i.eff !== "overdue" && i.due_date <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const toInvoice = (wos ?? []).filter((w) => w.status === "done" && !((w.invoices ?? []) as { kind: string; status: string }[]).some((i) => i.kind === "invoice" && i.status !== "cancelled"));

  const billedMonth = list.filter((i) => i.status !== "draft" && i.status !== "cancelled" && i.issue_date.startsWith(month)).reduce((s, i) => s + Number(i.total_ht), 0);
  const owed = outstanding.reduce((s, i) => s + Number(i.total_ttc) - Number(i.paid_amount), 0);
  const late = overdue.reduce((s, i) => s + Number(i.total_ttc) - Number(i.paid_amount), 0);
  const dso = averagePaymentDelay(list.filter((i) => i.eff === "paid").map((i) => ({ issue_date: i.issue_date, paid_on: ((i.payments ?? []) as { paid_on: string }[]).map((p) => p.paid_on).sort().at(-1) ?? null })));
  const write = can(ctx, "finance", "update");
  const create = can(ctx, "finance", "create");

  const tile = (title: string, count: number, children: React.ReactNode, tone: "danger" | "warn" | "info" | "accent" = "accent") => (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <CardTitle className="mb-0">{title}</CardTitle>
        <Badge tone={count ? tone : "neutral"}>{count}</Badge>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">{count ? children : <li className="px-4 py-4 text-sm text-muted">Rien à faire ici ✓</li>}</ul>
    </Card>
  );

  return (
    <>
      <PageHeader title="Finance" subtitle="Factures à émettre, retards à relancer, encaissements." actions={<LinkButton href="/finance/invoices" variant="secondary">Toutes les factures</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Facturé ce mois-ci" value={formatMoney(billedMonth)} hint="HT" tone="accent" />
        <Stat label="Reste à encaisser" value={formatMoney(owed)} hint={`${outstanding.length} factures`} />
        <Stat label="En retard" value={formatMoney(late)} hint={`${overdue.length} factures`} tone={overdue.length ? "danger" : "ok"} />
        <Stat label="Délai moyen de paiement" value={dso === null ? "—" : `${dso} j`} hint={`objectif ≤ ${sectorConfig.crm.paymentTermsDays} j`} tone={dso !== null && dso <= sectorConfig.crm.paymentTermsDays ? "ok" : "warn"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-testid="finance-tiles">
        {tile(
          "Retards à relancer",
          overdue.length,
          overdue.map((i) => {
            const days = daysOverdue(i.due_date, today);
            const last = Math.max(0, ...((i.dunning_steps ?? []) as { level: number }[]).map((d) => d.level));
            const level = suggestedDunningLevel(days, last);
            const contact = i.contacts as unknown as { first_name: string; email: string | null } | null;
            const remaining = Number(i.total_ttc) - Number(i.paid_amount);
            const mail = level
              ? dunningEmail({
                  companyName: sectorConfig.company.name,
                  senderName: ctx.full_name,
                  contactFirstName: contact?.first_name,
                  invoiceNumber: i.number,
                  totalTtc: formatMoney(i.total_ttc),
                  remaining: formatMoney(remaining),
                  dueDate: formatDate(i.due_date),
                  iban: sectorConfig.company.legal.iban,
                  level,
                  daysLate: days,
                })
              : null;
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/finance/invoices/${i.id}`} className="font-medium hover:text-accent">
                    {i.number} · {(i.clients as unknown as { name: string } | null)?.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {formatMoney(remaining)} dus · {days} j de retard{last ? ` · relance ${last} envoyée` : ""}
                  </p>
                </div>
                {write && mail && level && (
                  <MailComposer simulated={mailbox.simulated}
                    label={`Relance ${level}`}
                    title={`Relance niveau ${level} — ${i.number}`}
                    to={contact?.email ?? null}
                    subject={mail.subject}
                    body={mail.body}
                    action={dunningAction}
                    hidden={{ invoice_id: i.id, level: String(level), back: "/finance" }}
                    variant="secondary"
                    testId={`dunning-${i.number}`}
                  />
                )}
                {!level && <Badge tone="danger">contentieux</Badge>}
              </li>
            );
          }),
          "danger",
        )}
        {tile(
          `${sectorConfig.workOrder.labelPlural} livrés à facturer`,
          toInvoice.length,
          toInvoice.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/ops/work-orders/${w.id}`} className="font-medium hover:text-accent">
                  {w.number} · {(w.clients as unknown as { name: string } | null)?.name}
                </Link>
                <p className="truncate text-xs text-muted">{w.title}</p>
              </div>
              {create && (
                <form action={createInvoiceFromWoAction}>
                  <input type="hidden" name="wo_id" value={w.id} />
                  <input type="hidden" name="kind" value="final" />
                  <SubmitButton variant="secondary" testId={`invoice-wo-${w.number}`}>Facturer</SubmitButton>
                </form>
              )}
            </li>
          )),
          "warn",
        )}
        {tile(
          "Brouillons à émettre",
          drafts.length,
          drafts.map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/finance/invoices/${i.id}`} className="font-medium hover:text-accent">
                {i.number} · {(i.clients as unknown as { name: string } | null)?.name}
              </Link>
              <span className="tabular-nums text-muted">{formatMoney(i.total_ttc)}</span>
            </li>
          )),
        )}
        {tile(
          "Échéances sous 7 jours",
          dueSoon.length,
          dueSoon.map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/finance/invoices/${i.id}`} className="font-medium hover:text-accent">
                {i.number} · {(i.clients as unknown as { name: string } | null)?.name}
              </Link>
              <span className="text-xs text-muted">{formatDate(i.due_date)} · {formatMoney(Number(i.total_ttc) - Number(i.paid_amount))}</span>
            </li>
          )),
          "info",
        )}
        {tile(
          "Notes de frais à valider",
          (pendingExpenses ?? []).length,
          (pendingExpenses ?? []).map((e) => {
            const x = e.employees as unknown as { first_name: string; last_name: string } | null;
            return (
              <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href="/finance/expenses" className="min-w-0 truncate hover:text-accent">{x?.first_name} {x?.last_name} · <span className="text-muted">{e.label}</span></Link>
                <span className="shrink-0 text-xs tabular-nums">{formatMoney(e.amount)}</span>
              </li>
            );
          }),
          "warn",
        )}
      </div>
    </>
  );
}
