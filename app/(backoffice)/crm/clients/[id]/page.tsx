import Link from "next/link";
import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Textarea } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { QUOTE_STATUS } from "@/components/crm/status";
import { addContactAction, createDealAction, createQuoteAction, updateClientNotesAction } from "../../actions";

export const metadata = { title: "Fiche client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const { data: c } = await db
    .from("clients")
    .select("*, contacts(*), deals(id, title, stage, value, next_step, next_step_on), quotes(id, number, status, total_ht, issue_date), work_orders(id, number, title, stage, progress, status, due_date), invoices(id, number, status, total_ttc, due_date), threads(id, subject, channel, last_message_at)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const write = can(ctx, "crm", "update");
  const create = can(ctx, "crm", "create");
  const stageLabel = (sid: string) => sectorConfig.crm.pipelineStages.find((s) => s.id === sid)?.label ?? sid;
  const woStage = (sid: string) => sectorConfig.workOrder.stages.find((s) => s.id === sid)?.label ?? sid;
  const family = sectorConfig.productFamilies.find((f) => f.id === c.product_family);

  return (
    <>
      <PageHeader
        back={{ href: "/crm/clients", label: "Clients" }}
        title={c.name}
        subtitle={[c.industry, family?.label, c.city, c.vat_number].filter(Boolean).join(" · ")}
        actions={
          create && (
            <form action={createQuoteAction}>
              <input type="hidden" name="client_id" value={c.id} />
              <SubmitButton testId="new-quote">+ Nouveau devis</SubmitButton>
            </form>
          )
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Affaires</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {(c.deals ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    {d.next_step && <p className="text-xs text-muted">→ {d.next_step}{d.next_step_on && ` (${formatDate(d.next_step_on)})`}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{formatMoney(d.value)}</span>
                    <Badge tone={d.stage === "won" ? "ok" : d.stage === "lost" ? "danger" : "info"}>{stageLabel(d.stage)}</Badge>
                    {create && d.stage !== "won" && d.stage !== "lost" && (
                      <form action={createQuoteAction}>
                        <input type="hidden" name="client_id" value={c.id} />
                        <input type="hidden" name="deal_id" value={d.id} />
                        <SubmitButton variant="secondary" className="px-2 py-1 text-xs">Chiffrer</SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              ))}
              {!c.deals?.length && <li className="py-2 text-muted">Aucune affaire.</li>}
            </ul>
            {create && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-accent">+ Nouvelle affaire</summary>
                <form action={createDealAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="client_id" value={c.id} />
                  <Field label="Titre *" className="sm:col-span-2"><Input name="title" required /></Field>
                  <Field label="Montant estimé (HT)"><Input name="value" type="number" min={0} step={100} /></Field>
                  <Field label="Clôture prévue"><Input name="expected_close" type="date" /></Field>
                  <Field label="Prochaine étape"><Input name="next_step" /></Field>
                  <Field label="Pour le"><Input name="next_step_on" type="date" /></Field>
                  <div><SubmitButton>Créer l&apos;affaire</SubmitButton></div>
                </form>
              </details>
            )}
          </Card>

          <Card>
            <CardTitle>Devis</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {(c.quotes ?? []).sort((a, b) => b.issue_date.localeCompare(a.issue_date)).map((qt) => (
                <li key={qt.id} className="flex items-center justify-between py-2">
                  <Link href={`/crm/quotes/${qt.id}`} className="font-medium hover:text-accent">{qt.number}</Link>
                  <span className="text-muted">{formatDate(qt.issue_date)}</span>
                  <span className="tabular-nums">{formatMoney(qt.total_ht)} HT</span>
                  <Badge tone={QUOTE_STATUS[qt.status]?.tone ?? "neutral"}>{QUOTE_STATUS[qt.status]?.label ?? qt.status}</Badge>
                </li>
              ))}
              {!c.quotes?.length && <li className="py-2 text-muted">Aucun devis.</li>}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle>{sectorConfig.workOrder.labelPlural}</CardTitle>
              <ul className="space-y-2 text-sm">
                {(c.work_orders ?? []).map((w) => (
                  <li key={w.id}>
                    <div className="flex justify-between"><span className="font-medium">{w.number}</span><Badge tone={w.status === "done" ? "ok" : "accent"}>{w.status === "done" ? "Livré" : woStage(w.stage)}</Badge></div>
                    <p className="truncate text-xs text-muted">{w.title}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${w.progress}%` }} /></div>
                  </li>
                ))}
                {!c.work_orders?.length && <li className="text-muted">Aucun dossier.</li>}
              </ul>
            </Card>
            <Card>
              <CardTitle>Factures</CardTitle>
              <ul className="divide-y divide-border text-sm">
                {(c.invoices ?? []).map((i) => (
                  <li key={i.id} className="flex justify-between py-1.5">
                    <span>{i.number}</span>
                    <span className="tabular-nums">{formatMoney(i.total_ttc)}</span>
                    <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "danger" : "neutral"}>{i.status === "paid" ? "Payée" : i.status === "overdue" ? "En retard" : i.status === "partially_paid" ? "Partielle" : "Envoyée"}</Badge>
                  </li>
                ))}
                {!c.invoices?.length && <li className="py-1.5 text-muted">Aucune facture (ou pas de droit Finance).</li>}
              </ul>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Contacts</CardTitle>
            <ul className="space-y-3 text-sm">
              {(c.contacts ?? []).map((ct) => (
                <li key={ct.id}>
                  <p className="font-medium">{ct.first_name} {ct.last_name} {ct.is_primary && <Badge tone="accent">principal</Badge>}</p>
                  <p className="text-xs text-muted">{ct.job_title}</p>
                  <p className="text-xs">{ct.email && <a href={`mailto:${ct.email}`} className="text-info">{ct.email}</a>} {ct.phone}</p>
                </li>
              ))}
            </ul>
            {create && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-accent">+ Ajouter un contact</summary>
                <form action={addContactAction} className="mt-3 space-y-2">
                  <input type="hidden" name="client_id" value={c.id} />
                  <div className="grid grid-cols-2 gap-2"><Input name="first_name" placeholder="Prénom" required /><Input name="last_name" placeholder="Nom" required /></div>
                  <Input name="job_title" placeholder="Fonction" />
                  <Input name="email" type="email" placeholder="E-mail" />
                  <Input name="phone" placeholder="Téléphone" />
                  <SubmitButton variant="secondary">Ajouter</SubmitButton>
                </form>
              </details>
            )}
          </Card>
          <Card>
            <CardTitle>Échanges</CardTitle>
            <ul className="space-y-2 text-sm">
              {(c.threads ?? []).sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/comms/threads/${t.id}`} className="block truncate hover:text-accent">{t.subject}</Link>
                  <p className="text-xs text-muted">{t.channel} · {formatDate(t.last_message_at)}</p>
                </li>
              ))}
              {!c.threads?.length && <li className="text-muted">Aucun échange.</li>}
              <li><Link href={`/comms?f=all&q=${encodeURIComponent(c.name)}`} className="text-xs text-accent">Tous les échanges →</Link></li>
            </ul>
          </Card>
          <Card>
            <CardTitle>Notes</CardTitle>
            <form action={updateClientNotesAction} className="space-y-2">
              <input type="hidden" name="client_id" value={c.id} />
              <Textarea name="notes" defaultValue={c.notes ?? ""} disabled={!write} placeholder="Exigences qualité, interlocuteurs, habitudes d'achat…" />
              {write && <SubmitButton variant="secondary">Enregistrer</SubmitButton>}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
