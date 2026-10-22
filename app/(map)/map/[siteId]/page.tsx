import { notFound } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { requireUser } from "@/lib/auth";
import { loadSiteSnapshot } from "@/lib/map/snapshot";
import { LiveMap } from "@/components/map/LiveMap";

export const metadata = { title: "Map vivante" };

export default async function MapPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!sectorConfig.sites.some((s) => s.id === siteId)) notFound();
  const ctx = await requireUser();
  const snapshot = await loadSiteSnapshot(ctx, siteId);
  if (!snapshot) notFound();
  return <LiveMap snapshot={snapshot} userName={ctx.full_name} roleLabel={ctx.role.label} />;
}
