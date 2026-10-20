import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { Badge, Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { getHeaderKpis } from "@/lib/queries/kpis";

export const metadata = { title: "Map vivante" };

export default async function MapPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = sectorConfig.sites.find((s) => s.id === siteId);
  if (!site) notFound();

  const supabase = await createClient();
  const [kpis, { data: dbSite }] = await Promise.all([
    getHeaderKpis(siteId),
    supabase.from("sites").select("id, zones(id, key, name, type, outdoor, restricted)").eq("key", siteId).single(),
  ]);
  const { data: objects } = await supabase.from("map_objects").select("zone_id, type").eq("site_id", dbSite?.id ?? "");

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {sectorConfig.sites.map((s) => (
            <Link
              key={s.id}
              href={`/map/${s.id}`}
              className={clsx("rounded-full border px-4 py-1.5 text-sm", s.id === siteId ? "border-accent bg-accent/10 text-accent" : "border-border")}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <Badge tone="info">Vue 3D livrée en phase 2</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.id} data-testid={`kpi-${k.id}`}>
            <p className="text-xs text-muted">{k.label}</p>
            <p className={clsx("mt-1 text-3xl font-semibold", k.tone === "ok" && "text-ok", k.tone === "warn" && "text-warn", k.tone === "danger" && "text-danger")}>
              {k.value ?? "—"}
              {k.unit === "percent" && k.value !== null && "%"}
            </p>
            {k.detail && <p className="text-xs text-muted">{k.detail}</p>}
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-1 font-semibold">{site.label}</p>
        <p className="mb-4 text-sm text-muted">{site.description}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(dbSite?.zones ?? []).map((z) => {
            const n = objects?.filter((o) => o.zone_id === z.id).length ?? 0;
            return (
              <div key={z.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {z.name} {z.restricted && <Badge tone="danger">accès restreint</Badge>} {z.outdoor && <Badge>extérieur</Badge>}
                </span>
                <span className="text-xs text-muted">{n} objet{n > 1 ? "s" : ""}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
