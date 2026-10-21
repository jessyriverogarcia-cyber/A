import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { requireUser, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { daysBetween, followUpEmail, needsFollowUp } from "@/lib/domain/emails";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, LinkButton, PageHeader, Stat } from "@/components/ui/backoffice";
import { MailComposer } from "@/components/crm/MailComposer";
import { followUpQuoteAction } from "./actions";

export const metadata = { title: "Commercial" };

type QuoteRow = {
  id: string;
  number: string;
  status: string;
  total_ht: number;
  total_ttc: number;
  valid_until: string | null;
  sent_at: string | null;
  last_followup_at: string | null;
  followups: number;
  accepted_at: string | null;
  issue_date: string;
  clients: { name: string } | null;
  deals: { title: string } | null;
  contacts: { first_name: string; email: string | null } | null;
};

export default async function CrmHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const in5 = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: quotesRaw }, { data: deals }] = await Promise.all([
    db
      .from("quotes")
      .select("id, number, status, total_ht, total_ttc, valid_until, sent_at, last_followup_at, followups, accepted_at, issue_date, clients(name), deals(title), contacts(first_name, email)")
      .order("issue_date", { ascending: false }),
    db.from("deals").select("id, title, stage, value, probability, next_step, next_step_on, clients(name)"),
  ]);
  const quotes = (quotesRaw ?? []) as unknown as QuoteRow[];
  const openStages = new Set(sectorConfig.crm.pipelineStages.filter((s) => s.outcome === "open").map((s) => s.id));
  const openDeals = (deals ?? []).filter((d) => openStages.has(d.stage));

  const toFollow = quotes.filter((q) => needsFollowUp(q));
  const expiring = quotes.filter((q) => q.status === "sent" && q.valid_until && q.valid_until <= in5);
  const drafts = quotes.filter((q) => q.status === "draft");
  const dueSteps = openDeals.filter((d) => d.next_step && d.next_step_on && d.next_step_on <= today);

  const weighted = openDeals.reduce((s, d) => s + Number(d.value) * Number(d.probability), 0);
  const pending = quotes.filter((q) => q.status === "sent");
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const decided = quotes.filter((q) => (q.status === "accepted" || q.status === "rejected") && q.issue_date >= since90);
  const conversion = decided.length ? decided.filter((q) => q.status === "accepted").length / decided.length : null;
  const month = today.slice(0, 7);
  const signedMonth = quotes.filter((q) => q.status === "accepted" && q.accepted_at?.slice(0, 7) === month).reduce((s, q) => s + Number(q.total_ht), 0);
  const canWrite = can(ctx, "crm", "update");

  const tile = (title: string, count: number, children: React.ReactNode, tone: "warn" | "danger" | "info" | "neutral" = "neutral") => (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <CardTitle className="mb-0">{title}</CardTitle>
        <Badge tone={count ? (tone === "neutral" ? "accent" : tone) : "neutral"}>{count}</Badge>
      </div>
      <ul className="divide-y divide-border">{count ? children : <li className="px-4 py-4 text-sm text-muted">Rien à faire ici aujourd&apos;hui ✓</li>}</ul>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Commercial"
        subtitle={`Bonjour ${ctx.full_name.split(" ")[0]} — voici ce qui demande votre attention aujourd'hui.`}
        actions={
          <>
            <LinkButton href="/crm/pipeline" variant="secondary">Pipeline</LinkButton>
            {can(ctx, "crm", "create") && <LinkButton href="/crm/clients/new">+ Nouveau client</LinkButton>}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pipeline pondéré" value={formatMoney(weighted)} hint={`${openDeals.length} affaires ouvertes`} tone="accent" />
        <Stat label="Devis en attente" value={pending.length} hint={formatMoney(pending.reduce((s, q) => s + Number(q.total_ht), 0)) + " HT"} />
        <Stat label="Taux de transformation (90 j)" value={conversion === null ? "—" : formatPercent(conversion)} hint={`${decided.length} devis décidés`} tone={conversion !== null && conversion >= 0.5 ? "ok" : "warn"} />
        <Stat label="Signé ce mois-ci" value={formatMoney(signedMonth)} hint="HT" tone="ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-testid="todo-tiles">
        {tile(
          "Devis à relancer",
          toFollow.length,
          toFollow.map((qt) => {
            const mail = followUpEmail({
              companyName: sectorConfig.company.name,
              senderName: ctx.full_name,
              contactFirstName: qt.contacts?.first_name,
              quoteNumber: qt.number,
              title: qt.deals?.title ?? qt.number,
              totalTtc: formatMoney(qt.total_ttc),
              validUntil: qt.valid_until ? formatDate(qt.valid_until) : "—",
              level: qt.followups + 1,
              daysSinceSent: daysBetween(qt.last_followup_at ?? qt.sent_at!),
            });
            return (
              <li key={qt.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/crm/quotes/${qt.id}`} className="font-medium hover:text-accent">
                    {qt.number} · {qt.clients?.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {qt.deals?.title} · envoyé il y a {daysBetween(qt.sent_at!)} j{qt.followups ? ` · ${qt.followups} relance(s)` : ""}
                  </p>
                </div>
                {canWrite && (
                  <MailComposer
                    label="Relancer"
                    title={`Relance — ${qt.number}`}
                    to={qt.contacts?.email ?? null}
                    subject={mail.subject}
                    body={mail.body}
                    action={followUpQuoteAction}
                    hidden={{ quote_id: qt.id, back: "/crm" }}
                    variant="secondary"
                    testId={`followup-${qt.number}`}
                  />
                )}
              </li>
            );
          }),
          "warn",
        )}
        {tile(
          "Prochaines étapes dues",
          dueSteps.length,
          dueSteps.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{d.next_step}</p>
                <p className="truncate text-xs text-muted">
                  {d.title} · {(d.clients as unknown as { name: string } | null)?.name}
                </p>
              </div>
              <Badge tone={d.next_step_on! < today ? "danger" : "info"}>{d.next_step_on! < today ? "en retard" : "aujourd'hui"}</Badge>
            </li>
          )),
          "info",
        )}
        {tile(
          "Devis qui expirent sous 5 jours",
          expiring.length,
          expiring.map((qt) => (
            <li key={qt.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/crm/quotes/${qt.id}`} className="font-medium hover:text-accent">
                {qt.number} · {qt.clients?.name}
              </Link>
              <span className="text-xs text-danger">expire le {formatDate(qt.valid_until!)}</span>
            </li>
          )),
          "danger",
        )}
        {tile(
          "Brouillons à finaliser",
          drafts.length,
          drafts.map((qt) => (
            <li key={qt.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/crm/quotes/${qt.id}`} className="font-medium hover:text-accent">
                {qt.number} · {qt.clients?.name}
              </Link>
              <span className="text-xs text-muted">{formatMoney(qt.total_ht)} HT</span>
            </li>
          )),
        )}
      </div>
    </>
  );
}
