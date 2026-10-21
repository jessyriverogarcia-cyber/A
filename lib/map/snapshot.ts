import "server-only";
import { createClient } from "@/lib/supabase/server";
import { can, type UserContext } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import type { SiteSnapshot } from "./types";

/** Charge tout ce que la Map d'un site affiche, avec les droits (RLS) de l'utilisateur. */
export async function loadSiteSnapshot(ctx: UserContext, siteKey: string): Promise<SiteSnapshot | null> {
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("id, key, name").eq("key", siteKey).maybeSingle();
  if (!site) return null;

  const [zones, objects, assets, employees, presence, workOrders, stock, events] = await Promise.all([
    supabase.from("zones").select("id, key, name, type, polygon, capacity, restricted, outdoor").eq("site_id", site.id),
    supabase.from("map_objects").select("id, zone_id, type, kit, position, rotation, scale, entity_type, entity_id, visual_state").eq("site_id", site.id),
    supabase.from("assets").select("id, code, name, kind, technology, status, zone_id, next_maintenance_on, specs").eq("site_id", site.id),
    supabase.from("employees").select("id, first_name, last_name, job_title, role_key, avatar_color, appearance, home_zone_id, site_id").eq("site_id", site.id).eq("active", true),
    supabase.from("presence_status").select("employee_id, status, since, current_activity"),
    supabase
      .from("work_orders")
      .select("id, number, title, stage, stage_progress, progress, status, asset_id, zone_id, site_id, due_date, priority, product_family, physical_object, traceability, clients(name)")
      .eq("site_id", site.id)
      .neq("status", "cancelled"),
    supabase.from("stock_items").select("id, sku, label, category, quantity, min_quantity, unit, location_zone_id, suppliers(name)"),
    supabase.from("activity_events").select("id, type, entity_type, entity_id, payload, at").order("at", { ascending: false }).limit(25),
  ]);

  const zoneIds = new Set((zones.data ?? []).map((z) => z.id));
  return {
    orgId: ctx.org.id,
    site,
    zones: zones.data ?? [],
    objects: objects.data ?? [],
    assets: assets.data ?? [],
    employees: employees.data ?? [],
    presence: presence.data ?? [],
    workOrders: (workOrders.data ?? []).map(({ clients, ...w }) => ({
      ...w,
      client_name: (clients as unknown as { name: string } | null)?.name ?? null,
    })),
    stock: (stock.data ?? [])
      .filter((s) => s.location_zone_id && zoneIds.has(s.location_zone_id))
      .map(({ suppliers, ...s }) => ({
        ...s,
        quantity: Number(s.quantity),
        min_quantity: Number(s.min_quantity),
        supplier_name: (suppliers as unknown as { name: string } | null)?.name ?? null,
      })),
    events: events.data ?? [],
    canEdit: can(ctx, "map", "update"),
    canRunScenario: isDemoMode(), // scénario fictif : jamais sur des données de production
  } as unknown as SiteSnapshot;
}
