export interface KpiInputs {
  machines: { status: string }[];
  orders: { status: string; due_date: string | null }[];
  /** Date du jour au format AAAA-MM-JJ. */
  today: string;
}

export interface KpiResult {
  value: number | null;
  detail?: string;
}

/** Valeurs des KPI d'en-tête connus, par identifiant de la fiche secteur. */
export function computeKpis({ machines, orders, today }: KpiInputs): Record<string, KpiResult> {
  const active = orders.filter((o) => o.status === "active");
  const running = machines.filter((m) => m.status === "running").length;
  return {
    machines_active: {
      value: machines.length ? Math.round((running / machines.length) * 100) : null,
      detail: `${running}/${machines.length}`,
    },
    orders_in_progress: { value: active.length },
    on_time_rate: {
      value: active.length
        ? Math.round((active.filter((o) => !o.due_date || o.due_date >= today).length / active.length) * 100)
        : null,
      detail: `${active.filter((o) => o.due_date && o.due_date < today).length} en retard`,
    },
  };
}

export type KpiTone = "ok" | "warn" | "danger" | "neutral";

export function kpiTone(value: number | null, good?: number, warn?: number): KpiTone {
  if (value === null || good === undefined) return "neutral";
  if (value >= good) return "ok";
  if (warn !== undefined && value >= warn) return "warn";
  return "danger";
}

export function todayIso(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
