import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { purchaseOrderEmail } from "@/lib/domain/emails";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { PoLine } from "@/lib/services/resources";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Textarea } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MailComposer } from "@/components/crm/MailComposer";
import { PO_STATUS } from "@/components/resources/status";
import { cancelPoAction, receivePoAction, sendPoAction, updatePoLinesAction } from "../../actions";
import { mailMode } from "@/lib/integrations/mail";

export const metadata = { title: "Commande fournisseur" };

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const mailbox = await mailMode(db);
  const { data: po } = await db.from("purchase_orders").select("*, suppliers(name, email, phone, lead_time_days)").eq("id", id).maybeSingle();
  if (!po) notFound();
  const supplier = po.suppliers as unknown as { name: string; email: string | null; phone: string | null; lead_time_days: number | null };
  const lines = po.lines as unknown as PoLine[];
  const write = can(ctx, "resources", "update");
  const st = PO_STATUS[po.status];
  const mail = purchaseOrderEmail({
    companyName: sectorConfig.company.name,
    senderName: ctx.full_name,
    supplierName: supplier.name,
    number: po.number,
    lines: lines.map((l) => ({ label: l.label, qty: l.qty, unit: l.unit })),
    expectedOn: po.expected_on ? formatDate(po.expected_on) : "dès que possible",
    deliveryAddress: sectorConfig.company.legal.address,
  });

  return (
    <>
      <PageHeader
        back={{ href: "/resources/purchase-orders", label: "Commandes fournisseurs" }}
        title={<span className="flex items-center gap-3">{po.number} <Badge tone={st?.tone ?? "neutral"} data-testid="po-status">{st?.label ?? po.status}</Badge></span>}
        subtitle={`${supplier.name} · délai habituel ${supplier.lead_time_days ?? "—"} j`}
        actions={
          write && (
            <>
              {(po.status === "draft" || po.status === "sent") && (
                <form action={cancelPoAction}>
                  <input type="hidden" name="po_id" value={po.id} />
                  <SubmitButton variant="danger" confirm="Annuler cette commande ?">Annuler</SubmitButton>
                </form>
              )}
              {po.status === "draft" && (
                <MailComposer simulated={mailbox.simulated} label="Envoyer au fournisseur" title={`Envoyer ${po.number}`} to={supplier.email} subject={mail.subject} body={mail.body} action={sendPoAction} hidden={{ po_id: po.id }} testId="send-po" />
              )}
              {po.status === "sent" && (
                <form action={receivePoAction}>
                  <input type="hidden" name="po_id" value={po.id} />
                  <SubmitButton testId="receive-po" confirm="Confirmer la réception complète de la commande ?">✓ Réceptionner</SubmitButton>
                </form>
              )}
            </>
          )
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Articles</CardTitle>
          <form action={updatePoLinesAction}>
            <input type="hidden" name="po_id" value={po.id} />
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-medium">Article</th><th className="w-32 py-2 text-right font-medium">Quantité</th><th className="w-28 py-2 text-right font-medium">PU HT</th><th className="w-32 py-2 text-right font-medium">Total</th></tr></thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.stock_item_id} data-testid="po-line">
                    <td className="py-2"><Link href={`/resources/stock/${l.stock_item_id}`} className="hover:text-accent">{l.label}</Link> <span className="text-xs text-muted">{l.sku}</span></td>
                    <td className="py-2 text-right">
                      {po.status === "draft" && write ? (
                        <div className="ml-auto flex w-28 items-center gap-1"><Input type="number" name={`qty_${l.stock_item_id}`} defaultValue={l.qty} min={0} step="any" className="text-right" data-testid="po-qty" /><span className="text-xs text-muted">{l.unit}</span></div>
                      ) : (
                        <span className="tabular-nums">{formatNumber(l.qty)} {l.unit}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(l.unit_cost)}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(l.qty * l.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-3 text-right font-medium">Total HT</td><td className="pt-3 text-right font-semibold tabular-nums" data-testid="po-total">{formatMoney(po.total)}</td></tr></tfoot>
            </table>
            {po.status === "draft" && write && (
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <Field label="Livraison souhaitée"><Input type="date" name="expected_on" defaultValue={po.expected_on ?? ""} /></Field>
                <Field label="Notes"><Textarea name="notes" defaultValue={po.notes ?? ""} className="min-h-10" /></Field>
                <div><SubmitButton variant="secondary" testId="po-save">Mettre à jour</SubmitButton></div>
              </div>
            )}
          </form>
        </Card>
        <Card>
          <CardTitle>Suivi</CardTitle>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Fournisseur</dt><dd>{supplier.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">E-mail</dt><dd>{supplier.email ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Envoyée le</dt><dd>{po.sent_at ? formatDate(po.sent_at) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Prévue le</dt><dd>{po.expected_on ? formatDate(po.expected_on) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Reçue le</dt><dd>{po.received_at ? formatDate(po.received_at) : "—"}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
