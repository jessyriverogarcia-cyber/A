import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { daysOverdue, effectiveStatus, suggestedDunningLevel } from "@/lib/domain/invoice";
import { dunningEmail, invoiceEmail } from "@/lib/domain/emails";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MailComposer } from "@/components/crm/MailComposer";
import { InvoiceEditor } from "@/components/finance/InvoiceEditor";
import { INVOICE_KIND, INVOICE_STATUS } from "@/components/finance/status";
import { creditNoteAction, deleteDraftAction, dunningAction, recordPaymentAction, sendInvoiceAction } from "../../actions";

export const metadata = { title: "Facture" };

const METHODS: Record<string, string> = { transfer: "Virement", card: "Carte", check: "Chèque", direct_debit: "Prélèvement" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const { data: inv } = await db
    .from("invoices")
    .select("*, invoice_lines(*), clients(id, name), contacts(first_name, last_name, email), work_orders(id, number, title), quotes(id, number), payments(id, amount, paid_on, method), dunning_steps(id, level, sent_at, note)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();

  const today = todayIso(sectorConfig.company.timezone);
  const eff = effectiveStatus({ status: inv.status, due_date: inv.due_date, paid_amount: Number(inv.paid_amount), total_ttc: Number(inv.total_ttc) }, today);
  const st = INVOICE_STATUS[eff];
  const client = inv.clients as unknown as { id: string; name: string };
  const contact = inv.contacts as unknown as { first_name: string; last_name: string; email: string | null } | null;
  const wo = inv.work_orders as unknown as { id: string; number: string; title: string } | null;
  const quote = inv.quotes as unknown as { id: string; number: string } | null;
  const payments = ((inv.payments ?? []) as { id: string; amount: number; paid_on: string; method: string }[]).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  const dunnings = ((inv.dunning_steps ?? []) as { id: string; level: number; sent_at: string; note: string | null }[]).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const lines = ((inv.invoice_lines ?? []) as { description: string; quantity: number; unit_price: number; discount: number; catalog_item_id: string | null; position: number }[])
    .sort((a, b) => a.position - b.position)
    .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount: Number(l.discount), catalog_item_id: l.catalog_item_id }));
  const write = can(ctx, "finance", "update");
  const create = can(ctx, "finance", "create");
  const remaining = Math.round((Number(inv.total_ttc) - Number(inv.paid_amount)) * 100) / 100;
  const draft = inv.status === "draft";
  const mailBase = {
    companyName: sectorConfig.company.name,
    senderName: ctx.full_name,
    contactFirstName: contact?.first_name,
    invoiceNumber: inv.number,
    totalTtc: formatMoney(inv.total_ttc),
    remaining: formatMoney(remaining),
    dueDate: formatDate(inv.due_date),
    iban: sectorConfig.company.legal.iban,
  };
  const send = invoiceEmail(mailBase);
  const days = daysOverdue(inv.due_date, today);
  const level = eff === "overdue" ? suggestedDunningLevel(days, Math.max(0, ...dunnings.map((d) => d.level))) : null;
  const dunning = level ? dunningEmail({ ...mailBase, level, daysLate: days }) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/finance/invoices", label: "Factures" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.number} <Badge tone={st.tone} data-testid="invoice-status">{st.label}</Badge>
            <span className="text-sm font-normal text-muted">{INVOICE_KIND[inv.kind]}</span>
          </span>
        }
        subtitle={
          <>
            <Link href={`/crm/clients/${client.id}`} className="hover:text-accent">{client.name}</Link>
            {wo && <> · dossier <Link href={`/ops/work-orders/${wo.id}`} className="hover:text-accent">{wo.number}</Link></>}
            {quote && <> · devis <Link href={`/crm/quotes/${quote.id}`} className="hover:text-accent">{quote.number}</Link></>}
          </>
        }
        actions={
          <>
            <a href={`/finance/invoices/${inv.id}/pdf`} target="_blank" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm" data-testid="invoice-pdf">PDF</a>
            {draft && can(ctx, "finance", "delete") && (
              <form action={deleteDraftAction}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <SubmitButton variant="danger" confirm="Supprimer ce brouillon ?">Supprimer</SubmitButton>
              </form>
            )}
            {!draft && create && inv.kind !== "credit_note" && eff !== "paid" && (
              <form action={creditNoteAction}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <SubmitButton variant="secondary" confirm="Créer un avoir annulant cette facture ?">Créer un avoir</SubmitButton>
              </form>
            )}
            {write && dunning && level && (
              <MailComposer label={`Relance niveau ${level}`} title={`Relance niveau ${level} — ${inv.number}`} to={contact?.email ?? null} subject={dunning.subject} body={dunning.body} action={dunningAction} hidden={{ invoice_id: inv.id, level: String(level) }} variant="secondary" testId="invoice-dunning" />
            )}
            {write && draft && (
              <MailComposer label="Émettre et envoyer" title={`Envoyer ${inv.number}`} to={contact?.email ?? null} subject={send.subject} body={send.body} action={sendInvoiceAction} hidden={{ invoice_id: inv.id }} testId="send-invoice" />
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      {draft && <p className="mb-4 rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-muted">Brouillon : relisez les lignes reprises du dossier. Une fois émise, une facture ne se modifie plus (on fait un avoir).</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <InvoiceEditor invoiceId={inv.id} initialLines={lines} initialNotes={inv.notes ?? ""} editable={write && draft} paid={Number(inv.paid_amount)} />
        <div className="space-y-4">
          <Card>
            <CardTitle>Échéance</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Date</dt><dd>{formatDate(inv.issue_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Échéance</dt><dd className={eff === "overdue" ? "font-medium text-danger" : ""}>{formatDate(inv.due_date)}{eff === "overdue" && ` (+${days} j)`}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Contact</dt><dd>{contact ? `${contact.first_name} ${contact.last_name}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Envoyée le</dt><dd>{inv.sent_at ? formatDate(inv.sent_at) : "—"}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardTitle>Paiements</CardTitle>
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{formatDate(p.paid_on)} <span className="text-muted">· {METHODS[p.method] ?? p.method}</span></span>
                  <span className="tabular-nums text-ok">{formatMoney(p.amount)}</span>
                </li>
              ))}
              {!payments.length && <li className="text-muted">Aucun paiement.</li>}
            </ul>
            {create && !draft && remaining > 0 && inv.kind !== "credit_note" && (
              <form action={recordPaymentAction} className="mt-3 space-y-2 border-t border-border pt-3">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Montant"><Input type="number" name="amount" step="0.01" min="0.01" defaultValue={remaining} data-testid="payment-amount" /></Field>
                  <Field label="Date"><Input type="date" name="paid_on" defaultValue={today} /></Field>
                </div>
                <Select name="method" defaultValue="transfer">
                  {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <SubmitButton testId="payment-submit">Enregistrer le paiement</SubmitButton>
              </form>
            )}
          </Card>

          <Card>
            <CardTitle>Relances</CardTitle>
            <ul className="space-y-1 text-sm">
              {dunnings.map((d) => (
                <li key={d.id}>
                  <Badge tone={d.level >= 3 ? "danger" : "warn"}>Niveau {d.level}</Badge> <span className="text-muted">{formatDate(d.sent_at)}</span>
                </li>
              ))}
              {!dunnings.length && <li className="text-muted">Aucune relance.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
