import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { auditDiff } from "@/lib/domain/pilotage";
import { ACTIONS, AUDITED, auditQuery, entityName, parseFilters, show } from "@/lib/services/audit";
import { formatDate, formatTime } from "@/lib/format";
import { Badge, Input } from "@/components/ui/primitives";
import { EmptyState, Field, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export const metadata = { title: "Journal d'audit" };

const PAGE = 50;
const TONE: Record<string, "ok" | "info" | "danger"> = { INSERT: "ok", UPDATE: "info", DELETE: "danger" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const f = parseFilters(sp);
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const [{ data: rows, count }, { data: profiles }] = await Promise.all([auditQuery(db, f, PAGE, page * PAGE), db.rpc("org_members")]);
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v !== undefined && v !== "") p.set(k, String(v));
    return p.toString();
  };
  const total = count ?? 0;

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        subtitle="Qui a modifié quoi, quand, avec la valeur avant et après. Écrit par la base de données elle-même : impossible à contourner depuis l'application."
        actions={can(ctx, "pilotage", "export") ? <LinkButton variant="secondary" href={`/pilotage/audit/export?${qs({ p: undefined })}`}>Exporter (CSV)</LinkButton> : undefined}
      />
      <form className="mb-4 grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="audit-filters">
        <Field label="Objet">
          <Select name="table" defaultValue={f.table ?? ""}>
            <option value="">Tous</option>
            {Object.entries(AUDITED).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Action">
          <Select name="action" defaultValue={f.action ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Auteur">
          <Select name="actor" defaultValue={f.actor ?? ""} data-testid="audit-actor">
            <option value="">Tous</option>
            {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Du"><Input type="date" name="from" defaultValue={f.from} /></Field>
        <Field label="Au"><Input type="date" name="to" defaultValue={f.to} /></Field>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="system" value="1" defaultChecked={f.system} /> Inclure les traitements automatiques
          </label>
          <SubmitButton variant="secondary">Filtrer</SubmitButton>
        </div>
      </form>
      <p className="mb-2 text-xs text-muted">{total} entrée(s){f.row && <> · pour une seule fiche — <Link href="/pilotage/audit" className="text-accent">tout voir</Link></>}</p>
      <Table head={["Quand", "Qui", "Action", "Objet", "Changements"]} empty={!rows?.length && <EmptyState title="Aucune entrée" hint="Les modifications faites dans l'application apparaissent ici." />}>
        {(rows ?? []).map((r) => {
          const meta = AUDITED[r.table_name!] ?? { label: r.table_name! };
          const data = (r.new_data ?? r.old_data) as Record<string, unknown> | null;
          const diff = auditDiff(r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null);
          const name = entityName(data);
          return (
            <tr key={r.id} className="align-top" data-testid="audit-row">
              <Td className="whitespace-nowrap text-muted">{formatDate(r.at!)}<span className="block text-xs">{formatTime(r.at!)}</span></Td>
              <Td className="whitespace-nowrap">{r.actor_name ?? <span className="text-muted">Système</span>}</Td>
              <Td><Badge tone={TONE[r.action!]}>{ACTIONS[r.action!] ?? r.action}</Badge></Td>
              <Td>
                <span className="text-muted">{meta.label}</span>
                {name && (meta.href && r.action !== "DELETE" ? <Link href={meta.href(r.row_id!)} className="block font-medium hover:text-accent">{name}</Link> : <span className="block font-medium">{name}</span>)}
                {r.row_id && !f.row && <Link href={`/pilotage/audit?row=${r.row_id}&system=1`} className="text-xs text-accent">historique</Link>}
              </Td>
              <Td>
                {r.action === "UPDATE" ? (
                  <ul className="space-y-0.5 text-xs">
                    {diff.slice(0, 6).map((c) => (
                      <li key={c.field} className="font-mono">
                        <span className="text-muted">{c.field}</span> : <span className="line-through decoration-danger/60">{show(c.before)}</span> → <span className="text-text">{show(c.after)}</span>
                      </li>
                    ))}
                    {diff.length > 6 && <li className="text-muted">+ {diff.length - 6} champ(s)</li>}
                    {!diff.length && <li className="text-muted">aucun champ métier modifié</li>}
                  </ul>
                ) : (
                  <span className="text-xs text-muted">{diff.length} champ(s) {r.action === "DELETE" ? "supprimé(s)" : "renseigné(s)"}</span>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 0 ? <Link href={`/pilotage/audit?${qs({ p: page - 1 })}`} className="text-accent">← Plus récentes</Link> : <span />}
          <span className="text-muted">Page {page + 1} / {Math.ceil(total / PAGE)}</span>
          {(page + 1) * PAGE < total ? <Link href={`/pilotage/audit?${qs({ p: page + 1 })}`} className="text-accent">Plus anciennes →</Link> : <span />}
        </div>
      )}
    </>
  );
}
