import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, followUpEmail, quoteEmail } from "@/lib/domain/emails";
import { formatDate, formatMoney } from "@/lib/format";
import { siteForFamily } from "@/lib/services/crm";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MailComposer } from "@/components/crm/MailComposer";
import { QuoteEditor, type CatalogItem, type EditorLine } from "@/components/crm/QuoteEditor";
import { QUOTE_STATUS } from "@/components/crm/status";
import { acceptQuoteAction, duplicateQuoteAction, followUpQuoteAction, rejectQuoteAction, sendQuoteAction } from "../../actions";
import { mailMode } from "@/lib/integrations/mail";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const mailbox = await mailMode(db);
  const [{ data: q }, { data: catalog }] = await Promise.all([
    db
      .from("quotes")
      .select("*, quote_lines(*), clients(id, name, product_family), contacts(first_name, last_name, email), deals(id, title, product_family), work_orders(id, number, stage, site_id)")
      .eq("id", id)
      .maybeSingle(),
    db.from("catalog_items").select("id, sku, label, unit, unit_price, unit_cost, category").order("category").order("label"),
  ]);
  if (!q) notFound();

  const client = q.clients as unknown as { id: string; name: string; product_family: string | null };
  const contact = q.contacts as unknown as { first_name: string; last_name: string; email: string | null } | null;
  const deal = q.deals as unknown as { id: string; title: string; product_family: string | null } | null;
  const wo = (q.work_orders as unknown as { id: string; number: string; stage: string }[] | null)?.[0];
  const write = can(ctx, "crm", "update");
  const editable = write && (q.status === "draft" || q.status === "sent");
  const st = QUOTE_STATUS[q.status];
  const title = deal?.title ?? `Devis ${client.name}`;
  const lines = ((q.quote_lines ?? []) as unknown as (EditorLine & { position: number })[]).sort((a, b) => a.position - b.position).map((l) => ({
    catalog_item_id: l.catalog_item_id,
    description: l.description,
    quantity: Number(l.quantity),
    unit_price: Number(l.unit_price),
    unit_cost: Number(l.unit_cost),
    discount: Number(l.discount),
  }));
  const mailInput = {
    companyName: sectorConfig.company.name,
    senderName: ctx.full_name,
    contactFirstName: contact?.first_name,
    quoteNumber: q.number,
    title,
    totalTtc: formatMoney(q.total_ttc),
    validUntil: q.valid_until ? formatDate(q.valid_until) : "—",
  };
  const send = quoteEmail(mailInput);
  const follow = followUpEmail({ ...mailInput, level: q.followups + 1, daysSinceSent: q.sent_at ? daysBetween(q.last_followup_at ?? q.sent_at) : 0 });
  const mapSite = siteForFamily(deal?.product_family ?? client.product_family).site;

  return (
    <>
      <PageHeader
        back={{ href: "/crm/quotes", label: "Devis" }}
        title={
          <span className="flex items-center gap-3">
            {q.number} <Badge tone={st?.tone ?? "neutral"} data-testid="quote-status">{st?.label ?? q.status}</Badge>
          </span>
        }
        subtitle={
          <>
            <Link href={`/crm/clients/${client.id}`} className="hover:text-accent">{client.name}</Link> · {title}
          </>
        }
        actions={
          <>
            <a href={`/crm/quotes/${q.id}/pdf`} target="_blank" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-border/60" data-testid="quote-pdf">
              PDF
            </a>
            {can(ctx, "crm", "create") && (
              <form action={duplicateQuoteAction}>
                <input type="hidden" name="quote_id" value={q.id} />
                <SubmitButton variant="secondary">Dupliquer</SubmitButton>
              </form>
            )}
            {write && q.status === "draft" && (
              <MailComposer simulated={mailbox.simulated} label="Envoyer au client" title={`Envoyer ${q.number}`} to={contact?.email ?? null} subject={send.subject} body={send.body} action={sendQuoteAction} hidden={{ quote_id: q.id }} testId="send-quote" />
            )}
            {write && q.status === "sent" && (
              <>
                <MailComposer simulated={mailbox.simulated} label="Relancer" title={`Relance — ${q.number}`} to={contact?.email ?? null} subject={follow.subject} body={follow.body} action={followUpQuoteAction} hidden={{ quote_id: q.id }} variant="secondary" testId="followup-quote" />
                <form action={acceptQuoteAction}>
                  <input type="hidden" name="quote_id" value={q.id} />
                  <SubmitButton testId="accept-quote" confirm={`Le client a accepté ${q.number} ? Un ${sectorConfig.workOrder.label.toLowerCase()} sera créé.`}>
                    ✓ Accepté par le client
                  </SubmitButton>
                </form>
              </>
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      {wo && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-ok/30 bg-ok/10 px-4 py-3 text-sm" data-testid="quote-wo">
          <span>
            {sectorConfig.workOrder.label} <strong>{wo.number}</strong> créé — étape « {sectorConfig.workOrder.stages.find((s) => s.id === wo.stage)?.label} ».
          </span>
          <span className="flex gap-2">
            <Link href={`/ops?wo=${wo.id}`} className="rounded-lg bg-surface px-3 py-1.5 hover:bg-surface-2">Ouvrir le dossier</Link>
            <Link href={`/map/${mapSite.id}`} className="rounded-lg bg-accent px-3 py-1.5 text-white">Voir sur la Map →</Link>
          </span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <QuoteEditor quoteId={q.id} initialLines={lines} initialNotes={q.notes ?? ""} catalog={(catalog ?? []).map((c) => ({ ...c, unit_price: Number(c.unit_price), unit_cost: Number(c.unit_cost) })) as CatalogItem[]} editable={editable} />
        <div className="space-y-4">
          <Card>
            <CardTitle>Suivi</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Contact</dt><dd>{contact ? `${contact.first_name} ${contact.last_name}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Émis le</dt><dd>{formatDate(q.issue_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Valide jusqu&apos;au</dt><dd>{q.valid_until ? formatDate(q.valid_until) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Envoyé le</dt><dd>{q.sent_at ? formatDate(q.sent_at) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Relances</dt><dd>{q.followups}</dd></div>
              {q.accepted_at && <div className="flex justify-between"><dt className="text-muted">Accepté le</dt><dd>{formatDate(q.accepted_at)}</dd></div>}
              {q.rejected_reason && <div className="flex justify-between"><dt className="text-muted">Motif du refus</dt><dd>{q.rejected_reason}</dd></div>}
            </dl>
          </Card>
          {write && q.status === "sent" && (
            <Card>
              <CardTitle>Refus du client</CardTitle>
              <form action={rejectQuoteAction} className="space-y-2">
                <input type="hidden" name="quote_id" value={q.id} />
                <Select name="reason" defaultValue="Prix">
                  {["Prix", "Délai", "Concurrent", "Projet abandonné", "Spécification technique", "Autre"].map((r) => <option key={r}>{r}</option>)}
                </Select>
                <SubmitButton variant="danger" testId="reject-quote">Marquer comme refusé</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
