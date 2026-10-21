import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { Badge, Input } from "@/components/ui/primitives";
import { PageHeader, Select, Table, Td } from "@/components/ui/backoffice";
import { PRESENCE } from "@/components/hr/status";

export const metadata = { title: "Équipe" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  let query = db.from("employees").select("id, first_name, last_name, job_title, department, contract_type, work_rate, start_date, avatar_color, zones:home_zone_id(name)").eq("active", true).order("last_name");
  if (sp.dept) query = query.eq("department", sp.dept);
  if (sp.q) query = query.or(`first_name.ilike.%${sp.q}%,last_name.ilike.%${sp.q}%,job_title.ilike.%${sp.q}%`);
  const [{ data: emps }, { data: presence }, { data: leaves }] = await Promise.all([
    query,
    db.from("presence_status").select("employee_id, status"),
    db.from("leave_requests").select("employee_id").eq("status", "approved").lte("starts_on", today).gte("ends_on", today),
  ]);
  const onLeave = new Set((leaves ?? []).map((l) => l.employee_id));
  const depts = [...new Set((emps ?? []).map((e) => e.department).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader title="Équipe" subtitle={`${emps?.length ?? 0} personnes`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Nom, poste…" className="max-w-xs" />
        <Select name="dept" defaultValue={sp.dept ?? ""} className="max-w-56">
          <option value="">Tous les services</option>
          {depts.map((d) => <option key={d}>{d}</option>)}
        </Select>
        <button className="rounded-lg border border-border bg-surface-2 px-4 text-sm">Filtrer</button>
      </form>
      <Table head={["Nom", "Poste", "Service", "Contrat", "Zone", "Aujourd'hui"]}>
        {(emps ?? []).map((e) => {
          const st = onLeave.has(e.id) ? "leave" : ((presence ?? []).find((p) => p.employee_id === e.id)?.status ?? "absent");
          return (
            <tr key={e.id} className="hover:bg-surface-2/60">
              <Td>
                <Link href={`/hr/employees/${e.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: e.avatar_color ?? "#64748b" }}>{e.first_name[0]}{e.last_name[0]}</span>
                  {e.first_name} {e.last_name}
                </Link>
              </Td>
              <Td className="text-muted">{e.job_title}</Td>
              <Td className="text-muted">{e.department}</Td>
              <Td className="text-muted">{e.contract_type}{Number(e.work_rate) < 1 && ` · ${Math.round(Number(e.work_rate) * 100)} %`}</Td>
              <Td className="text-muted">{(e.zones as unknown as { name: string } | null)?.name}</Td>
              <Td><Badge tone={PRESENCE[st]?.tone ?? "neutral"}>{PRESENCE[st]?.label ?? st}</Badge></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
