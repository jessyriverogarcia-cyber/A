import Link from "next/link";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { needsReply, replySubject, suggestReply } from "@/lib/domain/replies";
import { replyContext, splitHeader, threadContext } from "@/lib/services/comms";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Select, SimulatedBadge, Textarea } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { archiveThreadAction, assignThreadAction, regenerateDraftAction, sendReplyAction, simulateInboundAction } from "../../actions";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const metadata = { title: "Échange" };

const stageLabel = (id: string) => sectorConfig.workOrder.stages.find((s) => s.id === id)?.label ?? id;

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireUser();
  const db = await createClient();
  const c = await threadContext(db, id);
  if (!c) notFound();
  const t = c.thread;
  const internal = t.channel === "internal";

  const docFilter = [t.work_order_id && `and(entity_type.eq.work_order,entity_id.eq.${t.work_order_id})`, t.client_id && `and(entity_type.eq.client,entity_id.eq.${t.client_id})`, t.supplier_id && `and(entity_type.eq.supplier,entity_id.eq.${t.supplier_id})`].filter(Boolean).join(",");
  const [{ data: messages }, { data: docs }, { data: employees }] = await Promise.all([
    db.from("messages").select("*").eq("thread_id", id).order("sent_at", { ascending: true, nullsFirst: false }),
    docFilter ? db.from("documents").select("id, name, version").or(docFilter).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("employees").select("id, first_name, last_name").eq("active", true).order("first_name"),
  ]);
  const sent = (messages ?? []).filter((m) => m.sent_at);
  const draft = (messages ?? []).find((m) => !m.sent_at && m.ai_draft);
  const lastIn = [...sent].reverse().find((m) => m.direction === "in");
  const lastDirection = sent.at(-1)?.direction ?? null;
  const todo = needsReply({ last_direction: lastDirection, last_inbound_at: lastIn?.sent_at ?? null, read_at: t.read_at });
  // Brouillon : celui préparé à l'arrivée du message, sinon une proposition calculée à l'instant.
  const proposal = draft?.body ?? (lastIn && !internal ? suggestReply(lastIn.body, replyContext(c, ctx.full_name)).body : "");
  const write = can(ctx, "comms", "create");
  const update = can(ctx, "comms", "update");
  const simulated = sectorConfig.integrations.mode === "simulated";
  const who = c.client?.name ?? c.supplier?.name ?? "Interne";

  return (
    <>
      <LiveRefresh orgId={ctx.org.id} tables={["messages"]} />
      <PageHeader
        back={{ href: "/comms", label: "Boîte de réception" }}
        title={t.subject}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {who}
            {internal && <Badge tone="info">message interne</Badge>}
            {todo && <Badge tone="accent">à répondre</Badge>}
            {c.workOrder && <Badge tone="accent">{c.workOrder.number}</Badge>}
          </span>
        }
        actions={
          <>
            {!internal && simulated && write && (
              <form action={simulateInboundAction}>
                <input type="hidden" name="thread_id" value={id} />
                <SubmitButton variant="secondary" testId="simulate-inbound">Simuler une réponse de l&apos;interlocuteur</SubmitButton>
              </form>
            )}
            {todo && update && (
              <form action={archiveThreadAction}>
                <input type="hidden" name="thread_id" value={id} />
                <SubmitButton variant="secondary" testId="archive-thread">Classer sans réponse</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <ol className="space-y-3" data-testid="messages">
            {sent.map((m) => {
              const out = m.direction === "out";
              const { to, text } = splitHeader(m.body);
              return (
                <li key={m.id} className={clsx("flex", out || (m.direction === "internal" && m.author === ctx.full_name) ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[85%] rounded-2xl border px-4 py-3 text-sm", out ? "border-accent/30 bg-accent/10" : m.direction === "internal" ? "border-info/30 bg-info/10" : "border-border bg-surface")}>
                    <p className="mb-1 text-xs text-muted">
                      <span className="font-medium text-text">{m.author}</span>
                      {to && ` → ${to}`} · {formatDate(m.sent_at!)} {formatTime(m.sent_at!)}
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {write && (
            <Card className={clsx(draft && "border-warn/40")}>
              <form action={sendReplyAction} className="space-y-3">
                <input type="hidden" name="thread_id" value={id} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="mb-0">{internal ? "Répondre" : draft ? "Brouillon préparé — à relire" : "Répondre"}</CardTitle>
                  {!internal && simulated && <SimulatedBadge />}
                </div>
                {!internal && (
                  <>
                    <p className="text-sm text-muted">
                      À : <span className="text-text">{c.to ?? "aucun e-mail de contact"}</span>
                    </p>
                    <input name="subject" defaultValue={replySubject(t.subject)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
                  </>
                )}
                <Textarea name="body" defaultValue={proposal} rows={10} className="font-mono text-[13px] leading-relaxed" data-testid="reply-body" placeholder={internal ? "Votre réponse à votre collègue…" : "Votre réponse…"} />
                {!internal && !!docs?.length && (
                  <fieldset className="space-y-1 text-sm">
                    <legend className="mb-1 text-muted">Joindre un document du dossier</legend>
                    {docs.map((d) => (
                      <label key={d.id} className="flex items-center gap-2">
                        <input type="checkbox" name="attach" value={d.id} /> {d.name}
                        {d.version > 1 && <span className="text-xs text-muted">v{d.version}</span>}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!internal && lastIn && (
                    <SubmitButton variant="secondary" formAction={regenerateDraftAction} testId="regenerate-draft">Préparer à nouveau</SubmitButton>
                  )}
                  <SubmitButton testId="send-reply">{internal ? "Envoyer" : "Envoyer la réponse"}</SubmitButton>
                </div>
                {draft && <p className="text-xs text-muted">Préparé automatiquement à partir du message reçu et du dossier (étape, échéance, factures). Vérifiez avant d&apos;envoyer.</p>}
              </form>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>Interlocuteur</CardTitle>
            {c.client && (
              <p className="text-sm">
                <Link href={`/crm/clients/${c.client.id}`} className="font-medium hover:text-accent">{c.client.name}</Link>
              </p>
            )}
            {c.supplier && <p className="text-sm font-medium">{c.supplier.name}</p>}
            {c.contact && <p className="text-sm text-muted">{c.contact.first_name} {c.contact.last_name} · {c.contact.email}</p>}
            {c.supplier?.email && <p className="text-sm text-muted">{c.supplier.email}</p>}
            {internal && c.author && <p className="text-sm text-muted">Ouvert par {c.author.first_name} {c.author.last_name}</p>}
          </Card>
          {c.workOrder && (
            <Card data-testid="thread-wo">
              <CardTitle>Dossier</CardTitle>
              <Link href={`/ops/work-orders/${c.workOrder.id}`} className="text-sm font-medium hover:text-accent">{c.workOrder.number} — {c.workOrder.title}</Link>
              <p className="mt-1 text-sm text-muted">Étape « {stageLabel(c.workOrder.stage)} » · {c.workOrder.progress} %</p>
              {c.workOrder.due_date && <p className={clsx("text-sm", c.workOrder.due_date < c.today ? "text-danger" : "text-muted")}>Échéance {formatDate(c.workOrder.due_date)}</p>}
            </Card>
          )}
          {c.invoice && (
            <Card>
              <CardTitle>Facture liée</CardTitle>
              <Link href={`/finance/invoices/${c.invoice.id}`} className="text-sm font-medium hover:text-accent">{c.invoice.number}</Link>
              <p className="text-sm text-muted">
                Reste dû {formatMoney(Number(c.invoice.total_ttc) - Number(c.invoice.paid_amount))} · échéance {formatDate(c.invoice.due_date)}
              </p>
              {c.invoice.effective === "overdue" && <Badge tone="danger">en retard</Badge>}
            </Card>
          )}
          {c.quote && (
            <Card>
              <CardTitle>Devis</CardTitle>
              <Link href={`/crm/quotes/${c.quote.id}`} className="text-sm font-medium hover:text-accent">{c.quote.number}</Link>
              <p className="text-sm text-muted">{c.quote.status === "accepted" ? "accepté" : c.quote.status === "sent" ? "envoyé, en attente" : c.quote.status}</p>
            </Card>
          )}
          <Card>
            <CardTitle>Suivi par</CardTitle>
            {update ? (
              <form action={assignThreadAction} className="flex gap-2">
                <input type="hidden" name="thread_id" value={id} />
                <input type="hidden" name="subject" value={t.subject} />
                <Select name="employee_id" defaultValue={t.assigned_employee ?? ""} aria-label="Responsable">
                  <option value="">Personne</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                  ))}
                </Select>
                <SubmitButton variant="secondary">OK</SubmitButton>
              </form>
            ) : (
              <p className="text-sm">{c.assigned ? `${c.assigned.first_name} ${c.assigned.last_name}` : "—"}</p>
            )}
          </Card>
          {!!docs?.length && (
            <Card>
              <CardTitle>Documents du dossier</CardTitle>
              <ul className="space-y-1 text-sm">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a href={`/comms/documents/${d.id}/download`} className="hover:text-accent">{d.name}</a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
