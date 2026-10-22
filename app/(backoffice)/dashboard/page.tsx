import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { computeKpis, kpiTone, todayIso } from "@/lib/domain/kpis";
import { needsFollowUp } from "@/lib/domain/emails";
import { maintenanceState, stockLevel } from "@/lib/domain/stock";
import { needsReply } from "@/lib/domain/replies";
import { formatDate, formatPercent } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { PageHeader, Stat } from "@/components/ui/backoffice";

export const metadata = { title: "Tableau de bord" };

const empty = Promise.resolve({ data: [] as never[] });
type Item = { label: string; count: number; href: string; tone?: "danger" | "warn" | "accent" };

/** « Ma journée » : ce que chaque rôle doit faire aujourd'hui, toutes rubriques confondues. */
export default async function DashboardPage() {
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const [{ data: orders }, { data: machines }, { data: quotes }, { data: deals }, { data: invoices }, { data: stock }, { data: assets }, { data: leaves }, { data: threads }, { data: notes }, { data: tasks }, { data: expenses }] = await Promise.all([
    can(ctx, "ops") ? db.from("work_orders").select("id, status, stage, due_date") : empty,
    db.from("assets").select("status").eq("kind", "machine"),
    can(ctx, "crm") ? db.from("quotes").select("status, sent_at, last_followup_at, followups") : empty,
    can(ctx, "crm") ? db.from("deals").select("next_step_on, stage") : empty,
    can(ctx, "finance") ? db.from("invoices").select("status, due_date, kind") : empty,
    db.from("stock_items").select("quantity, min_quantity"),
    db.from("assets").select("next_maintenance_on"),
    can(ctx, "hr", "approve") ? db.from("leave_requests").select("id").eq("status", "pending") : empty,
    can(ctx, "comms") ? db.from("thread_overview").select("last_direction, last_inbound_at, read_at, assigned_employee, drafts") : empty,
    db.from("notifications").select("id, title, body, link, created_at").eq("user_id", ctx.user_id).is("read_at", null).order("created_at", { ascending: false }).limit(5),
    ctx.employee_id ? db.from("tasks").select("id, title, due_on, status, work_order_id, work_orders(number)").eq("assignee_employee_id", ctx.employee_id).neq("status", "done").order("due_on") : empty,
    can(ctx, "expenses", "approve") ? db.from("expenses").select("id").eq("status", "pending") : empty,
  ]);

  const kpiValues = computeKpis({ machines: machines ?? [], orders: orders ?? [], today });
  const kpis = sectorConfig.kpis.filter((k) => kpiValues[k.id] && (k.id !== "orders_in_progress" || can(ctx, "ops")));
  const myThreads = (threads ?? []).filter((t) => needsReply(t) && (!ctx.employee_id || t.assigned_employee === ctx.employee_id || !t.assigned_employee));
  const items: (Item & { module: string })[] = [
    { module: "comms", label: "Messages à répondre", count: myThreads.length, href: "/comms?f=todo", tone: "accent" },
    { module: "crm", label: "Devis à relancer", count: (quotes ?? []).filter((q) => needsFollowUp(q)).length, href: "/crm", tone: "warn" },
    { module: "crm", label: "Prochaines étapes d'affaires dues", count: (deals ?? []).filter((d) => d.next_step_on && d.next_step_on <= today && !["won", "lost"].includes(d.stage)).length, href: "/crm/pipeline" },
    { module: "ops", label: "Dossiers en retard", count: (orders ?? []).filter((o) => o.status === "active" && o.due_date && o.due_date < today).length, href: "/ops", tone: "danger" },
    { module: "ops", label: "Dossiers au contrôle qualité", count: (orders ?? []).filter((o) => o.status === "active" && o.stage === "quality").length, href: "/ops/work-orders" },
    { module: "finance", label: "Factures échues", count: (invoices ?? []).filter((i) => i.kind !== "credit_note" && ["sent", "partially_paid", "overdue"].includes(i.status) && i.due_date < today).length, href: "/finance", tone: "danger" },
    { module: "finance", label: "Brouillons de facture à émettre", count: (invoices ?? []).filter((i) => i.status === "draft").length, href: "/finance/invoices" },
    { module: "resources", label: "Articles sous le minimum", count: (stock ?? []).filter((s) => stockLevel(Number(s.quantity), Number(s.min_quantity)) !== "ok").length, href: "/resources", tone: "warn" },
    { module: "resources", label: "Maintenances dues", count: (assets ?? []).filter((a) => maintenanceState(a.next_maintenance_on, today) === "overdue").length, href: "/resources", tone: "warn" },
    { module: "hr", label: "Congés à valider", count: (leaves ?? []).length, href: "/hr", tone: "warn" },
    { module: "expenses", label: "Notes de frais à valider", count: (expenses ?? []).length, href: "/finance/expenses", tone: "warn" },
  ];
  const visible = items.filter((i) => can(ctx, i.module as Parameters<typeof can>[1]) && (i.module !== "hr" || can(ctx, "hr", "approve")) && (i.module !== "resources" || can(ctx, "resources", "update")) && (i.module !== "expenses" || can(ctx, "expenses", "approve")));
  const hello = new Intl.DateTimeFormat(sectorConfig.company.locale, { weekday: "long", day: "numeric", month: "long", timeZone: sectorConfig.company.timezone }).format(new Date());

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <PageHeader title={`Bonjour ${ctx.full_name.split(" ")[0]}`} subtitle={`${hello.charAt(0).toUpperCase()}${hello.slice(1)} · ${ctx.role.label}`} actions={can(ctx, "pilotage") ? <Link href="/pilotage" className="text-sm text-accent">Tableau de bord direction →</Link> : undefined} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => {
          const v = kpiValues[k.id];
          const tone = kpiTone(v.value, k.good, k.warn);
          return <Stat key={k.id} label={k.label} value={v.value === null ? "—" : k.unit === "percent" ? formatPercent(v.value / 100) : v.value} hint={v.detail} tone={tone === "neutral" ? "neutral" : tone} />;
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3"><CardTitle className="mb-0">À faire aujourd&apos;hui</CardTitle></div>
          <ul className="divide-y divide-border" data-testid="my-todo">
            {visible.map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2/60">
                  <span className={i.count ? "" : "text-muted"}>{i.label}</span>
                  <Badge tone={i.count ? (i.tone ?? "info") : "neutral"}>{i.count}</Badge>
                </Link>
              </li>
            ))}
            {!visible.length && <li className="px-4 py-4 text-sm text-muted">Votre rôle n&apos;a pas de file de travail : consultez la Map vivante.</li>}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Mes tâches</CardTitle>
            <ul className="space-y-2 text-sm" data-testid="my-tasks">
              {(tasks ?? []).slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={t.work_order_id ? `/ops/work-orders/${t.work_order_id}` : "/ops"} className="min-w-0 truncate hover:text-accent">{t.title} <span className="text-xs text-muted">· {(t.work_orders as unknown as { number: string } | null)?.number}</span></Link>
                  {t.due_on && <span className={t.due_on < today ? "shrink-0 text-xs text-danger" : "shrink-0 text-xs text-muted"}>{formatDate(t.due_on)}</span>}
                </li>
              ))}
              {!tasks?.length && <li className="text-muted">Aucune tâche assignée.</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Notifications</CardTitle>
            <ul className="space-y-2 text-sm">
              {(notes ?? []).map((n) => (
                <li key={n.id}>
                  <Link href="/notifications" className="block hover:text-accent">{n.title}</Link>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                </li>
              ))}
              {!notes?.length && <li className="text-muted">Tout est lu ✓</li>}
            </ul>
          </Card>
          <Link href="/me" className="block rounded-card border border-border bg-surface px-4 py-3 text-sm hover:bg-surface-2/60">Mon espace : badgeuse, heures, congés →</Link>
        </div>
      </div>
    </div>
  );
}
