import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/backoffice";
import { Kanban, type KanbanDeal } from "@/components/crm/Kanban";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const ctx = await requireUser();
  const db = await createClient();
  const { data } = await db.from("deals").select("id, title, stage, value, probability, client_id, next_step, next_step_on, clients(name), employees(first_name)").order("value", { ascending: false });
  const deals: KanbanDeal[] = (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    stage: d.stage,
    value: Number(d.value),
    probability: Number(d.probability),
    client_id: d.client_id,
    client_name: (d.clients as unknown as { name: string } | null)?.name ?? "",
    next_step: d.next_step,
    next_step_on: d.next_step_on,
    owner: (d.employees as unknown as { first_name: string } | null)?.first_name ?? null,
  }));
  const open = new Set(sectorConfig.crm.pipelineStages.filter((s) => s.outcome === "open").map((s) => s.id));
  const weighted = deals.filter((d) => open.has(d.stage)).reduce((s, d) => s + d.value * d.probability, 0);

  return (
    <>
      <PageHeader title="Pipeline" subtitle={`Pondéré : ${formatMoney(weighted)} · glissez une carte pour changer d'étape`} />
      <Kanban deals={deals} canMove={can(ctx, "crm", "update")} orgId={ctx.org.id} today={todayIso(sectorConfig.company.timezone)} />
    </>
  );
}
