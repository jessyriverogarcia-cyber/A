/**
 * Indicateurs du tableau de bord direction — fonctions pures, testées.
 * Toutes les valeurs viennent des tables partagées : rien n'est ressaisi pour le pilotage.
 */

/** Les n derniers mois (AAAA-MM), du plus ancien au mois en cours. */
export function lastMonths(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const ISSUED = new Set(["sent", "paid", "partially_paid", "overdue"]);

/** CA facturé HT par mois d'émission (les avoirs, négatifs, viennent en déduction). */
export function revenueByMonth(invoices: { issue_date: string; total_ht: number; status: string }[], months: string[]) {
  const sums = new Map(months.map((m) => [m, 0]));
  for (const i of invoices) {
    if (!ISSUED.has(i.status)) continue;
    const k = i.issue_date.slice(0, 7);
    if (sums.has(k)) sums.set(k, sums.get(k)! + Number(i.total_ht));
  }
  return months.map((month) => ({ month, value: Math.round(sums.get(month)! * 100) / 100 }));
}

/** Variation relative (null si la base est nulle). */
export const variation = (current: number, previous: number) => (previous ? (current - previous) / Math.abs(previous) : null);

/** Pipeline pondéré : valeur × probabilité des affaires ouvertes, par étape. */
export function weightedPipeline(deals: { stage: string; value: number; probability: number }[], stages: { id: string; label: string; outcome?: string }[]) {
  const open = stages.filter((s) => !s.outcome || s.outcome === "open");
  const byStage = open.map((s) => {
    const ds = deals.filter((d) => d.stage === s.id);
    return { id: s.id, label: s.label, count: ds.length, value: ds.reduce((t, d) => t + Number(d.value), 0), weighted: ds.reduce((t, d) => t + Number(d.value) * Number(d.probability), 0) };
  });
  return { byStage, total: byStage.reduce((t, s) => t + s.value, 0), weighted: Math.round(byStage.reduce((t, s) => t + s.weighted, 0)) };
}

/** Taux de transformation des devis tranchés (acceptés / acceptés + refusés + expirés). */
export function quoteConversion(quotes: { status: string }[]) {
  const accepted = quotes.filter((q) => q.status === "accepted").length;
  const decided = quotes.filter((q) => ["accepted", "rejected", "expired"].includes(q.status)).length;
  return { accepted, decided, rate: decided ? accepted / decided : null };
}

/** Marge prévisionnelle des devis acceptés (HT − coût) / HT. */
export function quotedMargin(quotes: { status: string; total_ht: number; total_cost: number }[]) {
  const acc = quotes.filter((q) => q.status === "accepted");
  const ht = acc.reduce((t, q) => t + Number(q.total_ht), 0);
  const cost = acc.reduce((t, q) => t + Number(q.total_cost), 0);
  return { ht, margin: ht - cost, rate: ht ? (ht - cost) / ht : null };
}

/**
 * Carnet de commandes : montant HT des devis acceptés dont l'OF est en cours,
 * moins ce qui est déjà facturé sur ces dossiers (acomptes compris).
 */
export function backlog(orders: { id: string; status: string; quote_ht: number | null }[], invoices: { work_order_id: string | null; total_ht: number; status: string }[]) {
  const active = orders.filter((o) => o.status === "active" || o.status === "on_hold");
  return Math.max(
    0,
    active.reduce((t, o) => {
      const billed = invoices.filter((i) => i.work_order_id === o.id && ISSUED.has(i.status)).reduce((s, i) => s + Number(i.total_ht), 0);
      return t + Math.max(0, Number(o.quote_ht ?? 0) - billed);
    }, 0),
  );
}

/** Encours clients TTC et part échue. */
export function receivables(invoices: { status: string; due_date: string; total_ttc: number; paid_amount: number; kind?: string }[], today: string) {
  let open = 0;
  let overdue = 0;
  for (const i of invoices) {
    if (!ISSUED.has(i.status) || i.kind === "credit_note") continue;
    const rest = Number(i.total_ttc) - Number(i.paid_amount);
    if (rest <= 0) continue;
    open += rest;
    if (i.due_date < today) overdue += rest;
  }
  return { open: Math.round(open * 100) / 100, overdue: Math.round(overdue * 100) / 100 };
}

/** Dossiers dont les heures passées dépassent le budget (au-delà de la tolérance). */
export function hoursOverruns(orders: { id: string; number: string; title: string; hours_budget: number; status: string }[], spent: Map<string, number>, tolerance = 0) {
  return orders
    .filter((o) => o.status === "active" && Number(o.hours_budget) > 0)
    .map((o) => ({ ...o, spent: spent.get(o.id) ?? 0, ratio: (spent.get(o.id) ?? 0) / Number(o.hours_budget) }))
    .filter((o) => o.ratio > 1 + tolerance)
    .sort((a, b) => b.ratio - a.ratio);
}

/** Trésorerie prévisionnelle : solde cumulé mois après mois à partir d'un solde de départ. */
export function cashProjection(rows: { month: string; inflow: number; outflow: number }[], opening = 0) {
  let balance = opening;
  return [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => {
      const net = Number(r.inflow) - Number(r.outflow);
      balance += net;
      return { month: r.month.slice(0, 7), inflow: Number(r.inflow), outflow: Number(r.outflow), net, balance };
    });
}

export type AlertLevel = "critical" | "serious" | "warning";
export interface Alert {
  level: AlertLevel;
  module: string;
  title: string;
  detail: string;
  href: string;
}

const ORDER: Record<AlertLevel, number> = { critical: 0, serious: 1, warning: 2 };

/** Décisions à prendre, triées par gravité puis par module. */
export const sortAlerts = (alerts: Alert[]) => [...alerts].sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.module.localeCompare(b.module));

/**
 * Différences entre deux versions d'une ligne auditée, sans les colonnes techniques.
 * Pour une création ou une suppression : toutes les colonnes renseignées.
 */
export function auditDiff(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  const skip = new Set(["id", "org_id", "created_at", "updated_at", "created_by"]);
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const k of keys) {
    if (skip.has(k)) continue;
    const before = oldData?.[k] ?? null;
    const after = newData?.[k] ?? null;
    if (oldData && newData && JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!oldData && after === null) continue;
    if (!newData && before === null) continue;
    out.push({ field: k, before, after });
  }
  return out;
}
