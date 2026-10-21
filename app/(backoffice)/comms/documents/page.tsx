import Link from "next/link";
import clsx from "clsx";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteDocumentAction, uploadDocumentAction } from "../actions";

export const metadata = { title: "Documents" };

const TYPES: Record<string, string> = { client: "Client", work_order: "Dossier", supplier: "Fournisseur", employee: "Salarié", org: "Entreprise" };
const size = (b: number | null) => (b == null ? "—" : b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024)} Ko` : `${(b / 1048576).toFixed(1)} Mo`);

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const type = sp.type && TYPES[sp.type] ? sp.type : null;
  let query = db.from("documents").select("*").order("created_at", { ascending: false });
  if (type) query = query.eq("entity_type", type);
  const [{ data: docs }, { data: clients }, { data: suppliers }, { data: wos }, { data: quotes }, { data: invoices }] = await Promise.all([
    query,
    db.from("clients").select("id, name").order("name"),
    db.from("suppliers").select("id, name").order("name"),
    db.from("work_orders").select("id, number, title").order("number", { ascending: false }),
    can(ctx, "crm") ? db.from("quotes").select("id, number, total_ttc, issue_date, clients(name)").neq("status", "draft").order("issue_date", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
    can(ctx, "finance") ? db.from("invoices").select("id, number, total_ttc, issue_date, clients(name)").neq("status", "draft").order("issue_date", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
  ]);
  const linked = (d: { entity_type: string | null; entity_id: string | null }) => {
    if (d.entity_type === "client") { const c = clients?.find((x) => x.id === d.entity_id); return c && { label: c.name, href: `/crm/clients/${c.id}` }; }
    if (d.entity_type === "work_order") { const w = wos?.find((x) => x.id === d.entity_id); return w && { label: w.number, href: `/ops/work-orders/${w.id}` }; }
    if (d.entity_type === "supplier") { const s = suppliers?.find((x) => x.id === d.entity_id); return s && { label: s.name, href: null }; }
    return null;
  };
  const write = can(ctx, "comms", "create");
  const del = can(ctx, "comms", "delete");
  const generated = [
    ...(quotes ?? []).map((q) => ({ id: q.id, label: `Devis ${q.number}`, who: (q.clients as unknown as { name: string } | null)?.name, amount: q.total_ttc, date: q.issue_date, href: `/crm/quotes/${q.id}/pdf` })),
    ...(invoices ?? []).map((i) => ({ id: i.id, label: `Facture ${i.number}`, who: (i.clients as unknown as { name: string } | null)?.name, amount: i.total_ttc, date: i.issue_date, href: `/finance/invoices/${i.id}/pdf` })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <>
      <PageHeader title="Documents" subtitle="Plans, certificats, contrats : rangés sur la fiche du client, du dossier ou du fournisseur. Stockage privé." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <nav className="flex flex-wrap gap-2">
            {[["", "Tous"], ...Object.entries(TYPES)].map(([k, label]) => (
              <Link key={k} href={k ? `/comms/documents?type=${k}` : "/comms/documents"} className={clsx("rounded-full border px-3 py-1 text-sm", (type ?? "") === k ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text")}>
                {label}
              </Link>
            ))}
          </nav>
          <Table head={["Nom", "Rattaché à", "Taille", "Déposé", ""]} empty={!docs?.length && <EmptyState title="Aucun document" hint="Déposez un plan, un certificat ou un contrat." />}>
            {(docs ?? []).map((d) => {
              const l = linked(d);
              return (
                <tr key={d.id} data-testid="document-row">
                  <Td>
                    <a href={`/comms/documents/${d.id}/download`} className="font-medium hover:text-accent">{d.name}</a>
                    {d.version > 1 && <Badge className="ml-2">v{d.version}</Badge>}
                  </Td>
                  <Td className="text-muted">
                    {TYPES[d.entity_type ?? "org"]}
                    {l && (l.href ? <> · <Link href={l.href} className="hover:text-accent">{l.label}</Link></> : ` · ${l.label}`)}
                  </Td>
                  <Td className="whitespace-nowrap text-muted tabular-nums">{size(d.size_bytes)}</Td>
                  <Td className="text-muted"><span className="whitespace-nowrap">{formatDate(d.created_at)}</span>{d.uploaded_by && <span className="block text-xs">{d.uploaded_by}</span>}</Td>
                  <Td className="text-right">
                    {del && (
                      <form action={deleteDocumentAction}>
                        <input type="hidden" name="document_id" value={d.id} />
                        <SubmitButton variant="secondary" className="px-2 py-1 text-xs" confirm={`Supprimer « ${d.name} » ?`}>Supprimer</SubmitButton>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
        <aside className="space-y-4">
          {write && (
            <Card>
              <CardTitle>Déposer un document</CardTitle>
              <form action={uploadDocumentAction} className="space-y-3" encType="multipart/form-data">
                <input type="file" name="file" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5" data-testid="upload-file" />
                <Select name="entity" defaultValue="org" aria-label="Rattacher à" data-testid="upload-entity">
                  <option value="org">Entreprise (général)</option>
                  <optgroup label="Dossiers">
                    {(wos ?? []).map((w) => <option key={w.id} value={`work_order:${w.id}`}>{w.number} — {w.title}</option>)}
                  </optgroup>
                  <optgroup label="Clients">
                    {(clients ?? []).map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="Fournisseurs">
                    {(suppliers ?? []).map((s) => <option key={s.id} value={`supplier:${s.id}`}>{s.name}</option>)}
                  </optgroup>
                </Select>
                <p className="text-xs text-muted">20 Mo maximum. Un fichier du même nom crée une nouvelle version.</p>
                <SubmitButton testId="upload-submit">Déposer</SubmitButton>
              </form>
            </Card>
          )}
          {!!generated.length && (
            <Card>
              <CardTitle>Générés par l&apos;application</CardTitle>
              <ul className="space-y-2 text-sm">
                {generated.slice(0, 10).map((g) => (
                  <li key={g.href} className="flex items-center justify-between gap-2">
                    <a href={g.href} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-accent">{g.label} <span className="text-muted">· {g.who}</span></a>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{formatMoney(g.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">PDF recalculés à la demande depuis les données (jamais de double saisie).</p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
