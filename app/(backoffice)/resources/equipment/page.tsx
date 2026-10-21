import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { maintenanceState } from "@/lib/domain/stock";
import { formatDate } from "@/lib/format";
import { ASSET_STATUS_LABEL, STATUS_COLOR } from "@/lib/map/theme";
import { Badge } from "@/components/ui/primitives";
import { Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";

export const metadata = { title: "Équipements" };

const KIND: Record<string, string> = { machine: "Machine", equipment: "Équipement", workstation: "Poste", room: "Salle", vehicle: "Véhicule", badge_reader: "Badgeuse" };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const { data: assets } = await db.from("assets").select("id, code, name, kind, technology, status, next_maintenance_on, last_maintenance_on, zones(name), sites(name)").order("kind").order("code");
  return (
    <>
      <PageHeader title="Équipements" subtitle={`${assets?.length ?? 0} équipements suivis · état synchronisé avec la Map`} />
      <Flash ok={sp.ok} err={sp.err} />
      <Table head={["Code", "Nom", "Type", "Site · zone", "État", "Dernière maint.", "Prochaine maint."]}>
        {(assets ?? []).map((a) => {
          const m = maintenanceState(a.next_maintenance_on, today);
          return (
            <tr key={a.id} className="hover:bg-surface-2/60">
              <Td><Link href={`/resources/equipment/${a.id}`} className="font-medium hover:text-accent">{a.code}</Link></Td>
              <Td>{a.name}</Td>
              <Td className="text-muted">{KIND[a.kind] ?? a.kind}{a.technology ? ` · ${sectorConfig.technologies.find((t) => t.id === a.technology)?.label ?? a.technology}` : ""}</Td>
              <Td className="text-muted">{(a.sites as unknown as { name: string } | null)?.name} · {(a.zones as unknown as { name: string } | null)?.name}</Td>
              <Td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />{ASSET_STATUS_LABEL[a.status]}</Td>
              <Td className="text-muted">{a.last_maintenance_on ? formatDate(a.last_maintenance_on) : "—"}</Td>
              <Td>{a.next_maintenance_on ? <Badge tone={m === "overdue" ? "danger" : m === "due_soon" ? "warn" : "neutral"}>{formatDate(a.next_maintenance_on)}</Badge> : "—"}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
