import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { computeKpis, kpiTone, todayIso, type KpiTone } from "@/lib/domain/kpis";

export interface KpiValue {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  detail?: string;
  tone: KpiTone;
}

/** KPI d'en-tête déclarés dans la fiche secteur, calculés sur les données (RLS de l'utilisateur). */
export async function getHeaderKpis(siteKey?: string): Promise<KpiValue[]> {
  const supabase = await createClient();
  const { data: site } = siteKey
    ? await supabase.from("sites").select("id").eq("key", siteKey).maybeSingle()
    : { data: null };

  let machinesQ = supabase.from("assets").select("status").eq("kind", "machine");
  if (site) machinesQ = machinesQ.eq("site_id", site.id);
  const [{ data: machines }, { data: orders }] = await Promise.all([
    machinesQ,
    supabase.from("work_orders").select("due_date, status").eq("status", "active"),
  ]);
  const values = computeKpis({
    machines: machines ?? [],
    orders: orders ?? [],
    today: todayIso(sectorConfig.company.timezone),
  });

  return sectorConfig.kpis
    .filter((k) => !k.optional)
    .map((k) => {
      const v = values[k.id] ?? { value: null };
      return { id: k.id, label: k.label, unit: k.unit, ...v, tone: kpiTone(v.value, k.good, k.warn) };
    });
}
