import Link from "next/link";
import clsx from "clsx";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { needsReply } from "@/lib/domain/replies";
import { splitHeader } from "@/lib/services/comms";
import { formatDate, formatTime } from "@/lib/format";
import { todayIso } from "@/lib/domain/kpis";
import { sectorConfig } from "@/config/sector.config";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Flash, LinkButton, PageHeader, SimulatedBadge } from "@/components/ui/backoffice";
import { mailMode } from "@/lib/integrations/mail";
import { syncInboxAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const metadata = { title: "Communication" };

const FILTERS = [
  { id: "todo", label: "À répondre" },
  { id: "drafts", label: "Brouillons à relire" },
  { id: "mine", label: "Mes échanges" },
  { id: "clients", label: "Clients" },
  { id: "suppliers", label: "Fournisseurs" },
  { id: "internal", label: "Interne" },
  { id: "all", label: "Tout" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (sp.thread) redirect(`/comms/threads/${sp.thread}`); // lien profond
  const ctx = await requireUser();
  const db = await createClient();
  const mailbox = await mailMode(db);
  const filter = FILTERS.some((f) => f.id === sp.f) ? sp.f : "todo";
  const today = todayIso(sectorConfig.company.timezone);

  const [{ data: rows }, { data: clients }, { data: suppliers }, { data: wos }, { data: employees }] = await Promise.all([
    db.from("thread_overview").select("*").order("last_message_at", { ascending: false }).limit(300),
    db.from("clients").select("id, name"),
    db.from("suppliers").select("id, name"),
    db.from("work_orders").select("id, number"),
    db.from("employees").select("id, first_name, last_name"),
  ]);
  const name = <T extends { id: string }>(list: T[] | null, id: string | null) => (id ? (list ?? []).find((x) => x.id === id) : undefined);
  const threads = (rows ?? []).map((t) => ({ ...t, todo: needsReply(t), drafts: Number(t.drafts ?? 0) }));
  const counts: Record<string, number> = {
    todo: threads.filter((t) => t.todo).length,
    drafts: threads.filter((t) => t.drafts > 0).length,
    mine: threads.filter((t) => t.assigned_employee === ctx.employee_id && (t.todo || t.drafts > 0)).length,
  };
  const qtext = (sp.q ?? "").toLowerCase();
  const shown = threads.filter((t) => {
    if (qtext) {
      const hay = [t.subject, t.last_body, name(clients, t.client_id)?.name, name(suppliers, t.supplier_id)?.name].join(" ").toLowerCase();
      if (!hay.includes(qtext)) return false;
    }
    switch (filter) {
      case "todo": return t.todo;
      case "drafts": return t.drafts > 0;
      case "mine": return t.assigned_employee === ctx.employee_id || t.created_by_employee === ctx.employee_id;
      case "clients": return !!t.client_id && t.channel !== "internal";
      case "suppliers": return !!t.supplier_id;
      case "internal": return t.channel === "internal";
      default: return true;
    }
  });
  const write = can(ctx, "comms", "create");

  return (
    <>
      <LiveRefresh orgId={ctx.org.id} tables={["messages", "threads"]} />
      <PageHeader
        title="Boîte de réception"
        subtitle="Tous les échanges, rangés par client, fournisseur et dossier. Les réponses sont préparées : relisez, envoyez."
        actions={
          <>
            {mailbox.simulated && <SimulatedBadge />}
            {!mailbox.simulated && write && (
              <form action={syncInboxAction}>
                <SubmitButton variant="secondary" testId="sync-inbox">Relever la boîte</SubmitButton>
              </form>
            )}
            {write && <LinkButton href="/comms/new">Nouveau message</LinkButton>}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/comms?f=${f.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
            data-testid={`filter-${f.id}`}
            className={clsx("rounded-full border px-3 py-1 text-sm", filter === f.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text")}
          >
            {f.label}
            {counts[f.id] !== undefined && <span className="ml-1.5 tabular-nums">{counts[f.id]}</span>}
          </Link>
        ))}
        <form className="ml-auto">
          <input type="hidden" name="f" value="all" />
          <input name="q" defaultValue={sp.q} placeholder="Rechercher un client, un sujet…" className="w-64 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </form>
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <ul className="divide-y divide-border" data-testid="inbox">
          {shown.map((t) => {
            const who = name(clients, t.client_id)?.name ?? name(suppliers, t.supplier_id)?.name ?? "Interne";
            const wo = name(wos, t.work_order_id);
            const owner = name(employees, t.assigned_employee);
            const at = t.last_message_at!;
            const preview = splitHeader(t.last_body ?? "").text.replace(/\s+/g, " ");
            return (
              <li key={t.id}>
                <Link href={`/comms/threads/${t.id}`} className="flex items-start gap-4 px-4 py-3 hover:bg-surface-2/60" data-testid="thread-row">
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.todo ? "bg-accent" : "bg-transparent")} aria-label={t.todo ? "à répondre" : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={clsx("truncate text-sm", t.todo ? "font-semibold" : "font-medium")}>{who}</span>
                      {t.channel === "internal" && <Badge tone="info">interne</Badge>}
                      {t.supplier_id && <Badge>fournisseur</Badge>}
                      {wo && <Badge tone="accent">{wo.number}</Badge>}
                      {t.drafts > 0 && <Badge tone="warn">brouillon prêt</Badge>}
                    </div>
                    <p className="truncate text-sm">{t.subject}</p>
                    <p className="truncate text-xs text-muted">
                      {t.last_direction === "out" ? "Vous : " : ""}
                      {preview}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    <p>{at.slice(0, 10) === today ? formatTime(at) : formatDate(at)}</p>
                    {owner && <p className="mt-1">{owner.first_name}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {!shown.length && <EmptyState title={filter === "todo" ? "Tout est répondu ✓" : "Aucun échange"} hint={filter === "todo" ? "Aucun message en attente de réponse." : undefined} />}
      </div>
    </>
  );
}
