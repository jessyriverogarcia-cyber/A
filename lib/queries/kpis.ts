import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";

export interface KpiValue {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  detail?: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}

const tone = (v: number | null, good?: number, warn?: number): KpiValue["tone"] =>
  v === null || good === undefined ? "neutral" : v >= good ? "ok" : warn !== undefined && v >= warn ? "warn" : "danger";

/** KPI d'en-tête déclarés dans la fiche secteur, calculés sur les données (RLS de l'utilisateur). */
export async function getHeaderKpis(siteKey?: string): Promise<KpiValue[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: site } = siteKey
    ? await supabase.from("sites").select("id").eq("key", siteKey).maybeSingle()
    : { data: null };

  let machinesQ = supabase.from("assets").select("status").eq("kind", "machine");
  if (site) machinesQ = machinesQ.eq("site_id", site.id);
  const [{ data: machines }, { data: orders }] = await Promise.all([
    machinesQ,
    supabase.from("work_orders").select("due_date, status").eq("status", "active"),
  ]);

  const values: Record<string, Omit<KpiValue, "id" | "label" | "unit" | "tone">> = {
    machines_active: machines
      ? {
          value: machines.length ? Math.round((machines.filter((m) => m.status === "running").length / machines.length) * 100) : 0,
          detail: `${machines.filter((m) => m.status === "running").length}/${machines.length}`,
        }
      : { value: null },
    orders_in_progress: { value: orders ? orders.length : null },
    on_time_rate: orders?.length
      ? { value: Math.round((orders.filter((o) => !o.due_date || o.due_date >= today).length / orders.length) * 100) }
      : { value: null },
    revenue_today: { value: null },
  };

  return sectorConfig.kpis
    .filter((k) => !k.optional)
    .map((k) => {
      const v = values[k.id] ?? { value: null };
      return { id: k.id, label: k.label, unit: k.unit, ...v, tone: tone(v.value, k.good, k.warn) };
    });
}
