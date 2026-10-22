import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import { overallProgress } from "@/lib/domain/workOrder";
import type { Database } from "@/lib/supabase/database.types";

const stages = sectorConfig.workOrder.stages;

/** Site de fabrication d'une famille : celui qui contient la zone de sa technologie principale. */
export function siteForFamily(familyId: string | null | undefined) {
  const family = sectorConfig.productFamilies.find((f) => f.id === familyId) ?? sectorConfig.productFamilies[0];
  const tech = sectorConfig.technologies.find((t) => t.id === family.technologies[0]);
  const site =
    sectorConfig.sites.find((s) => [...s.zones, ...s.outdoor].some((z) => z.id === tech?.zoneId)) ?? sectorConfig.sites[0];
  return { site, technology: tech?.id ?? null };
}

/**
 * Acceptation d'un devis (UI, scénario de démo, futur lien de signature) : passe par la
 * fonction SQL atomique accept_quote, qui crée l'OF à la première étape de la fiche secteur.
 */
export async function acceptQuote(db: SupabaseClient<Database>, quoteId: string) {
  const { data: q } = await db.from("quotes").select("deal_id, clients(product_family), deals(product_family)").eq("id", quoteId).single();
  const family =
    (q?.deals as unknown as { product_family: string | null } | null)?.product_family ??
    (q?.clients as unknown as { product_family: string | null } | null)?.product_family;
  const { site, technology } = siteForFamily(family);
  const first = stages[0];
  const zoneKey = first.zoneId && [...site.zones, ...site.outdoor].some((z) => z.id === first.zoneId) ? first.zoneId : (site.zones[0]?.id ?? "");
  const { data, error } = await db.rpc("accept_quote", {
    p_quote: quoteId,
    p_wo_prefix: sectorConfig.workOrder.shortCode,
    p_stage: first.id,
    p_progress: overallProgress(stages, first.id, 5),
    p_site_key: site.id,
    p_zone_key: zoneKey,
    p_technology: technology ?? "",
  });
  if (error) throw new Error(error.message);
  return data as { work_order_id: string; number: string; created: boolean };
}

export async function nextNumber(db: SupabaseClient<Database>, table: "quotes" | "invoices" | "work_orders" | "purchase_orders", prefix: string) {
  const { data, error } = await db.rpc("next_document_number", { p_table: table, p_prefix: prefix });
  if (error) throw new Error(error.message);
  return data as string;
}
