import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import type { Database } from "@/lib/supabase/database.types";
import { can, type UserContext } from "@/lib/auth";
import { todayIso } from "@/lib/domain/kpis";
import { addDays, stockLevel } from "@/lib/domain/stock";
import { averagePaymentDelay } from "@/lib/domain/invoice";
import { formatDate, formatMoney } from "@/lib/format";
import {
  backlog,
  cashProjection,
  hoursOverruns,
  lastMonths,
  quoteConversion,
  quotedMargin,
  receivables,
  revenueByMonth,
  sortAlerts,
  weightedPipeline,
  type Alert,
} from "@/lib/domain/pilotage";

type Db = SupabaseClient<Database>;
const cfg = sectorConfig;
const empty = Promise.resolve({ data: [] as never[] });

/**
 * Tableau de bord direction : chaque chiffre est calculé à la volée depuis les tables des modules.
 * Une section n'est chargée que si le rôle peut lire le module (la RLS le garantit aussi).
 */
export async function directionDashboard(db: Db, ctx: UserContext) {
  const today = todayIso(cfg.company.timezone);
  const months = lastMonths(today, 12);
  const d30 = addDays(today, -30);
  const fin = can(ctx, "finance");
  const crm = can(ctx, "crm");

  const [{ data: invoices }, { data: payments }, { data: forecast }, { data: deals }, { data: quotes }, { data: orders }, { data: entries }, { data: machines }, { data: stock }, { data: qc }, { data: leaves }, { data: presence }, { data: trainings }] = await Promise.all([
    fin ? db.from("invoices").select("id, number, status, kind, issue_date, due_date, total_ht, total_ttc, paid_amount, work_order_id, clients(name)") : empty,
    fin ? db.from("payments").select("invoice_id, paid_on") : empty,
    fin ? db.from("cash_forecast").select("month, inflow, outflow").gte("month", `${today.slice(0, 7)}-01`).order("month").limit(6) : empty,
    crm ? db.from("deals").select("stage, value, probability") : empty,
    crm ? db.from("quotes").select("id, status, total_ht, total_cost, issue_date").gte("issue_date", addDays(today, -365)) : empty,
    db.from("work_orders").select("id, number, title, status, due_date, hours_budget, quote_id, priority"),
    db.from("time_entries").select("work_order_id, hours"),
    db.from("assets").select("id, code, status").eq("kind", "machine"),
    db.from("stock_items").select("id, sku, label, quantity, min_quantity, unit_cost"),
    db.from("activity_events").select("payload, at").eq("type", "work_order.qc").gte("at", d30),
    can(ctx, "hr") ? db.from("leave_requests").select("id").eq("status", "pending") : empty,
    db.from("presence_status").select("status"),
    can(ctx, "hr") ? db.from("trainings").select("title, expires_on, employees(first_name, last_name)").not("expires_on", "is", null).lt("expires_on", today) : empty,
  ]);

  // Finance
  const rev = revenueByMonth((invoices ?? []).map((i) => ({ ...i, total_ht: Number(i.total_ht) })), months);
  const recv = receivables((invoices ?? []).map((i) => ({ ...i, total_ttc: Number(i.total_ttc), paid_amount: Number(i.paid_amount) })), today);
  const paidOn = new Map((payments ?? []).map((p) => [p.invoice_id, p.paid_on]));
  const dso = averagePaymentDelay((invoices ?? []).filter((i) => i.status === "paid").map((i) => ({ issue_date: i.issue_date, paid_on: paidOn.get(i.id) ?? null })));
  const cash = cashProjection((forecast ?? []).map((f) => ({ month: f.month, inflow: Number(f.inflow), outflow: Number(f.outflow) })));

  // Commercial
  const pipe = weightedPipeline((deals ?? []).map((d) => ({ ...d, value: Number(d.value), probability: Number(d.probability) })), cfg.crm.pipelineStages);
  const qs = (quotes ?? []).map((q) => ({ ...q, total_ht: Number(q.total_ht), total_cost: Number(q.total_cost) }));
  const conversion = quoteConversion(qs);
  const margin = quotedMargin(qs);
  const quoteHt = new Map(qs.map((q) => [q.id, q.total_ht]));
  const carnet = backlog((orders ?? []).map((o) => ({ ...o, quote_ht: o.quote_id ? (quoteHt.get(o.quote_id) ?? null) : null })), (invoices ?? []).map((i) => ({ ...i, total_ht: Number(i.total_ht) })));

  // Production
  const active = (orders ?? []).filter((o) => o.status === "active");
  const late = active.filter((o) => o.due_date && o.due_date < today);
  const spent = new Map<string, number>();
  for (const e of entries ?? []) if (e.work_order_id) spent.set(e.work_order_id, (spent.get(e.work_order_id) ?? 0) + Number(e.hours));
  const overruns = hoursOverruns((orders ?? []).map((o) => ({ ...o, hours_budget: Number(o.hours_budget) })), spent, 0.05);
  const running = (machines ?? []).filter((m) => m.status === "running").length;
  const down = (machines ?? []).filter((m) => m.status === "down");
  const qcRejected = (qc ?? []).filter((e) => (e.payload as { result?: string })?.result === "rejeté").length;

  // Ressources & équipe
  const low = (stock ?? []).filter((s) => stockLevel(Number(s.quantity), Number(s.min_quantity)) !== "ok");
  const stockValue = (stock ?? []).reduce((t, s) => t + Number(s.quantity) * Number(s.unit_cost), 0);
  const present = (presence ?? []).filter((p) => p.status === "at_station" || p.status === "in_meeting" || p.status === "on_break").length;

  // Décisions à prendre
  const alerts: Alert[] = [];
  for (const i of (invoices ?? []).filter((x) => x.kind !== "credit_note" && ["sent", "overdue", "partially_paid"].includes(x.status) && x.due_date < today)) {
    const long = i.due_date < addDays(today, -30);
    alerts.push({ level: long ? "critical" : "serious", module: "Finance", title: `Facture ${i.number} ${long ? "impayée depuis plus de 30 jours" : "échue"}`, detail: `${(i.clients as unknown as { name: string } | null)?.name ?? ""} · ${formatMoney(Number(i.total_ttc) - Number(i.paid_amount))} · échue le ${formatDate(i.due_date)}`, href: `/finance/invoices/${i.id}` });
  }
  for (const m of down) alerts.push({ level: "critical", module: "Production", title: `${m.code} en panne`, detail: "Capacité réduite : vérifier le planning des dossiers.", href: `/resources/equipment/${m.id}` });
  for (const o of late) alerts.push({ level: o.priority === "urgent" || o.priority === "high" ? "serious" : "warning", module: "Production", title: `${o.number} en retard`, detail: `${o.title} · échéance ${formatDate(o.due_date!)}`, href: `/ops/work-orders/${o.id}` });
  for (const o of overruns.slice(0, 5)) alerts.push({ level: o.ratio > 1.25 ? "serious" : "warning", module: "Production", title: `${o.number} : heures au-delà du budget`, detail: `${Math.round(o.spent)} h passées pour ${o.hours_budget} h prévues (+${Math.round((o.ratio - 1) * 100)} %)`, href: `/ops/work-orders/${o.id}` });
  if (low.length) alerts.push({ level: "warning", module: "Ressources", title: `${low.length} article(s) sous le minimum`, detail: low.slice(0, 3).map((s) => s.label).join(", "), href: "/resources" });
  for (const t of trainings ?? []) {
    const e = t.employees as unknown as { first_name: string; last_name: string };
    alerts.push({ level: "serious", module: "RH", title: `Habilitation expirée : ${t.title}`, detail: `${e.first_name} ${e.last_name} · depuis le ${formatDate(t.expires_on!)}`, href: "/hr" });
  }
  if ((leaves ?? []).length) alerts.push({ level: "warning", module: "RH", title: `${leaves!.length} demande(s) de congé à valider`, detail: "Validation en un clic depuis l'accueil RH.", href: "/hr" });

  return {
    today,
    finance: fin ? { revenue: rev, receivables: recv, dso, cash } : null,
    crm: crm ? { pipeline: pipe, conversion, margin, backlog: carnet } : null,
    ops: { active: active.length, late: late.length, onTime: active.length ? (active.length - late.length) / active.length : null, overruns: overruns.length, machines: (machines ?? []).length, running, down: down.length, qcTotal: (qc ?? []).length, qcRejected },
    resources: { low: low.length, stockValue },
    team: { present, headcount: (presence ?? []).length, pendingLeaves: (leaves ?? []).length },
    alerts: sortAlerts(alerts),
  };
}
