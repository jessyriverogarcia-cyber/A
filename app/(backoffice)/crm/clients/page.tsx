import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { Badge, Input } from "@/components/ui/primitives";
import { EmptyState, Flash, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";

export const metadata = { title: "Clients" };

const STATUS: Record<string, { label: string; tone: "ok" | "info" | "neutral" }> = {
  active: { label: "Actif", tone: "ok" },
  prospect: { label: "Prospect", tone: "info" },
  inactive: { label: "Inactif", tone: "neutral" },
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  let query = db.from("clients").select("id, name, industry, product_family, city, status, deals(value, stage), quotes(status, total_ht)").order("name");
  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.family) query = query.eq("product_family", sp.family);
  const { data: clients } = await query;
  const open = new Set(sectorConfig.crm.pipelineStages.filter((s) => s.outcome === "open").map((s) => s.id));

  return (
    <>
      <PageHeader title="Clients" subtitle={`${clients?.length ?? 0} comptes`} actions={can(ctx, "crm", "create") && <LinkButton href="/crm/clients/new">+ Nouveau client</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Rechercher un client…" className="max-w-xs" />
        <Select name="family" defaultValue={sp.family ?? ""} className="max-w-xs">
          <option value="">Toutes les familles</option>
          {sectorConfig.productFamilies.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </Select>
        <button className="rounded-lg border border-border bg-surface-2 px-4 text-sm">Filtrer</button>
      </form>
      <Table
        head={["Client", "Secteur", "Famille", "Ville", "Pipeline ouvert", "Signé", "Statut"]}
        empty={!clients?.length && <EmptyState title="Aucun client" hint="Modifiez la recherche ou créez un client." />}
      >
        {(clients ?? []).map((c) => {
          const pipeline = (c.deals ?? []).filter((d) => open.has(d.stage)).reduce((s, d) => s + Number(d.value), 0);
          const signed = (c.quotes ?? []).filter((q) => q.status === "accepted").reduce((s, q) => s + Number(q.total_ht), 0);
          const st = STATUS[c.status] ?? STATUS.active;
          return (
            <tr key={c.id} className="hover:bg-surface-2/60">
              <Td>
                <Link href={`/crm/clients/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
              </Td>
              <Td className="text-muted">{c.industry}</Td>
              <Td className="text-muted">{sectorConfig.productFamilies.find((f) => f.id === c.product_family)?.label ?? "—"}</Td>
              <Td className="text-muted">{c.city}</Td>
              <Td className="tabular-nums">{pipeline ? formatMoney(pipeline) : "—"}</Td>
              <Td className="tabular-nums">{signed ? formatMoney(signed) : "—"}</Td>
              <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
