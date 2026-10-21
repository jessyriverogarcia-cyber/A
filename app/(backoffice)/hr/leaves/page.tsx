import Link from "next/link";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, PageHeader, Table, Td } from "@/components/ui/backoffice";
import { LeaveDecision } from "@/components/hr/LeaveDecision";
import { LEAVE_KIND, LEAVE_STATUS } from "@/components/hr/status";

export const metadata = { title: "Congés" };

export default async function LeavesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const today = todayIso(sectorConfig.company.timezone);
  const { data: leaves } = await db.from("leave_requests").select("id, kind, starts_on, ends_on, days, status, comment, rejection_reason, employee_id, employees:employees!leave_requests_employee_id_fkey(first_name, last_name, department)").order("starts_on", { ascending: false });
  const pending = (leaves ?? []).filter((l) => l.status === "pending");
  const upcoming = (leaves ?? []).filter((l) => l.status === "approved" && l.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const approve = can(ctx, "hr", "approve");
  const who = (l: (typeof pending)[number]) => l.employees as unknown as { first_name: string; last_name: string; department: string | null };
  // Chevauchements : plusieurs absences du même service sur une même période
  const overlaps = (l: (typeof pending)[number]) =>
    upcoming.filter((u) => u.employee_id !== l.employee_id && who(u).department === who(l).department && u.starts_on <= l.ends_on && u.ends_on >= l.starts_on);

  return (
    <>
      <PageHeader title="Congés" subtitle="Validation en un clic · le solde est calculé automatiquement (25 jours ouvrés par an)." />
      <Flash ok={sp.ok} err={sp.err} />
      <Card className="mb-4 p-0">
        <div className="border-b border-border px-4 py-3"><CardTitle className="mb-0">À valider ({pending.length})</CardTitle></div>
        <ul className="divide-y divide-border" data-testid="leaves-pending">
          {pending.map((l) => {
            const e = who(l);
            const ov = overlaps(l);
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <Link href={`/hr/employees/${l.employee_id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link>
                  <span className="text-muted"> · {e.department}</span>
                  <p className="text-xs text-muted">{LEAVE_KIND[l.kind]} · {formatDate(l.starts_on)}{l.ends_on !== l.starts_on && ` → ${formatDate(l.ends_on)}`} · {formatNumber(l.days)} j ouvrés{l.comment && ` · « ${l.comment} »`}</p>
                  {ov.length > 0 && <p className="text-xs text-warn">⚠ Déjà absent(s) dans le service : {ov.map((o) => who(o).first_name).join(", ")}</p>}
                </div>
                {approve && <LeaveDecision id={l.id} back="/hr/leaves" testId={`leave-${e.first_name}`} />}
              </li>
            );
          })}
          {!pending.length && <li className="px-4 py-4 text-sm text-muted">Aucune demande en attente ✓</li>}
        </ul>
      </Card>
      <Table head={["Personne", "Type", "Du", "Au", "Jours", "Statut"]}>
        {(leaves ?? []).filter((l) => l.status !== "pending").map((l) => {
          const e = who(l);
          return (
            <tr key={l.id}>
              <Td>{e.first_name} {e.last_name}</Td>
              <Td className="text-muted">{LEAVE_KIND[l.kind]}</Td>
              <Td>{formatDate(l.starts_on)}</Td>
              <Td>{formatDate(l.ends_on)}</Td>
              <Td className="tabular-nums">{formatNumber(l.days)}</Td>
              <Td><Badge tone={LEAVE_STATUS[l.status].tone}>{LEAVE_STATUS[l.status].label}</Badge>{l.rejection_reason && <span className="ml-1 text-xs text-muted">{l.rejection_reason}</span>}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
