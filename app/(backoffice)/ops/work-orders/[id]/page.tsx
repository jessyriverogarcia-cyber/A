import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/domain/kpis";
import { budgetAlert, nextStage } from "@/lib/domain/workOrder";
import { formatDate, formatNumber } from "@/lib/format";
import { ASSET_STATUS_LABEL } from "@/lib/map/theme";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  addTaskAction,
  assignMachineAction,
  checklistToggleAction,
  logTimeAction,
  moveStageAction,
  progressAction,
  qualityAction,
  shipAction,
  taskStatusAction,
  traceabilityAction,
} from "../../actions";

export const metadata = { title: "Ordre de fabrication" };

const stages = sectorConfig.workOrder.stages;
const time = (d: string) => new Date(d).toLocaleString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, dateStyle: "short", timeStyle: "short" });

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const { data: wo } = await db
    .from("work_orders")
    .select("*, clients(id, name), quotes(id, number), assets(id, code, name, status), sites(key, name), zones(name), employees(first_name, last_name), work_order_stages(*), tasks(*), checklists(*), time_entries(*, employees(first_name, last_name))")
    .eq("id", id)
    .maybeSingle();
  if (!wo) notFound();

  const [{ data: machines }, { data: team }, { data: bookings }] = await Promise.all([
    db.from("assets").select("id, code, name, status, technology, site_id").eq("kind", "machine").order("code"),
    db.from("employees").select("id, first_name, last_name").eq("active", true).order("first_name"),
    db.from("asset_bookings").select("id, starts_at, ends_at, assets(code)").eq("work_order_id", id).order("starts_at"),
  ]);

  const write = can(ctx, "ops", "update");
  const approve = can(ctx, "ops", "approve");
  const teamWrite = can(ctx, "ops", "create");
  const today = todayIso(sectorConfig.company.timezone);
  const idx = stages.findIndex((s) => s.id === wo.stage);
  const next = nextStage(stages, wo.stage);
  const prev = idx > 0 ? stages[idx - 1] : null;
  const done = wo.status === "done";
  // Peut être null : un opérateur n'a pas accès aux fiches clients (RLS du Commercial).
  const client = wo.clients as unknown as { id: string; name: string } | null;
  const quote = wo.quotes as unknown as { id: string; number: string } | null;
  const asset = wo.assets as unknown as { id: string; code: string; name: string; status: string } | null;
  const site = wo.sites as unknown as { key: string; name: string } | null;
  const entries = (wo.time_entries ?? []) as unknown as { id: string; hours: number; work_date: string; billable: boolean; note: string | null; employees: { first_name: string; last_name: string } | null }[];
  const spent = entries.reduce((s, e) => s + Number(e.hours), 0);
  const budget = Number(wo.hours_budget);
  const budgetLvl = budgetAlert(spent, budget);
  const history = ((wo.work_order_stages ?? []) as { id: string; stage: string; entered_at: string; left_at: string | null; note: string | null }[]).sort((a, b) => a.entered_at.localeCompare(b.entered_at));
  const tasks = ((wo.tasks ?? []) as { id: string; title: string; status: string; due_on: string | null; position: number }[]).sort((a, b) => a.position - b.position);
  const checklists = (wo.checklists ?? []) as unknown as { id: string; title: string; items: { label: string; done: boolean }[] }[];
  const trace = (wo.traceability ?? {}) as { lot_matiere?: string; norme?: string; serial?: string; model?: unknown };
  const tech = sectorConfig.technologies.find((t) => t.id === wo.technology);
  const siteMachines = (machines ?? []).filter((m) => !wo.site_id || m.site_id === wo.site_id);
  const qcPending = checklists.flatMap((c) => c.items).filter((i) => !i.done).length;
  const late = !done && wo.due_date && wo.due_date < today;

  return (
    <>
      <PageHeader
        back={{ href: "/ops/work-orders", label: sectorConfig.workOrder.labelPlural }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {wo.number}
            <Badge tone={done ? "ok" : "accent"} data-testid="wo-stage">{done ? "Expédié" : stages[idx]?.label}</Badge>
            {late && <Badge tone="danger">En retard</Badge>}
          </span>
        }
        subtitle={
          <>
            {wo.title} · {client ? <Link href={`/crm/clients/${client.id}`} className="hover:text-accent">{client.name}</Link> : <span>client non visible avec votre rôle</span>}
            {quote && <> · devis <Link href={`/crm/quotes/${quote.id}`} className="hover:text-accent">{quote.number}</Link></>}
          </>
        }
        actions={site && <Link href={`/map/${site.key}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Voir sur la Map →</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      {/* Étapes */}
      <Card className="mb-4">
        <ol className="flex flex-wrap gap-2" data-testid="wo-stepper">
          {stages.map((s, i) => (
            <li key={s.id} className={clsx("flex flex-1 basis-28 flex-col rounded-lg border px-3 py-2 text-xs", i < idx || done ? "border-transparent bg-surface-2 text-muted" : i === idx ? "border-accent bg-accent/10 font-semibold" : "border-dashed border-border text-muted")}>
              <span className="mb-1 h-1 rounded-full" style={{ background: i <= idx || done ? s.color : "transparent" }} />
              {i < idx || done ? "✓ " : ""}
              {s.label}
            </li>
          ))}
        </ol>
        <div className="mt-3 h-2 rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${wo.progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">Avancement global {wo.progress} % · étape à {wo.stage_progress} %</p>

        {write && !done && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
            {wo.stage === "quality" ? (
              approve ? (
                <form action={qualityAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="wo_id" value={wo.id} />
                  <SubmitButton name="decision" value="accept" testId="qc-accept">✓ Valider le contrôle</SubmitButton>
                  <div className="w-64"><Input name="reason" placeholder="Motif en cas de rejet" /></div>
                  <SubmitButton name="decision" value="reject" variant="danger" testId="qc-reject">✕ Rejeter</SubmitButton>
                  {qcPending > 0 && <span className="text-xs text-warn">{qcPending} point(s) de contrôle non cochés</span>}
                </form>
              ) : (
                <p className="text-sm text-muted">En attente de la validation par la Qualité.</p>
              )
            ) : next ? (
              <form action={moveStageAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="wo_id" value={wo.id} />
                <input type="hidden" name="from" value={wo.stage} />
                <input type="hidden" name="to" value={next.id} />
                {next.id === "printing" && (
                  <Field label="Machine">
                    <Select name="asset_id" defaultValue={wo.asset_id ?? ""} required data-testid="next-machine">
                      <option value="">Choisir…</option>
                      {siteMachines.map((m) => (
                        <option key={m.id} value={m.id} disabled={m.status === "down" || m.status === "maintenance"}>
                          {m.code} · {m.name} ({ASSET_STATUS_LABEL[m.status]}){m.technology === wo.technology ? " ★" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <SubmitButton testId="wo-next">Passer à « {next.label} » →</SubmitButton>
              </form>
            ) : (
              <form action={shipAction}>
                <input type="hidden" name="wo_id" value={wo.id} />
                <SubmitButton testId="wo-ship">🚚 Expédier</SubmitButton>
              </form>
            )}
            {prev && wo.stage !== "quality" && (
              <form action={moveStageAction}>
                <input type="hidden" name="wo_id" value={wo.id} />
                <input type="hidden" name="from" value={wo.stage} />
                <input type="hidden" name="to" value={prev.id} />
                <SubmitButton variant="secondary">← Revenir à « {prev.label} »</SubmitButton>
              </form>
            )}
            <form action={progressAction} className="ml-auto flex items-end gap-2">
              <input type="hidden" name="wo_id" value={wo.id} />
              <Field label="Avancement de l'étape">
                <input type="range" name="stage_progress" min={0} max={100} step={5} defaultValue={wo.stage_progress} className="w-40 accent-[var(--accent)]" />
              </Field>
              <SubmitButton variant="secondary">OK</SubmitButton>
            </form>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Heures */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <CardTitle className="mb-0">Heures</CardTitle>
              <Badge tone={budgetLvl === "exceeded" ? "danger" : budgetLvl === "warning" ? "warn" : "ok"} data-testid="wo-budget">
                {formatNumber(Math.round(spent * 4) / 4)} / {formatNumber(budget)} h{budgetLvl === "exceeded" ? " · dépassé" : budgetLvl === "warning" ? " · 80 % atteints" : ""}
              </Badge>
            </div>
            <div className="mb-3 h-2 rounded-full bg-surface-2">
              <div className={clsx("h-full rounded-full", budgetLvl === "exceeded" ? "bg-danger" : budgetLvl === "warning" ? "bg-warn" : "bg-ok")} style={{ width: `${Math.min(100, budget ? (spent / budget) * 100 : 0)}%` }} />
            </div>
            <ul className="divide-y divide-border text-sm">
              {entries.sort((a, b) => b.work_date.localeCompare(a.work_date)).slice(0, 8).map((e) => (
                <li key={e.id} className="flex justify-between py-1.5">
                  <span>{e.employees ? `${e.employees.first_name} ${e.employees.last_name}` : "—"} <span className="text-muted">· {formatDate(e.work_date)}{e.note ? ` · ${e.note}` : ""}</span></span>
                  <span className="tabular-nums">{formatNumber(e.hours)} h{!e.billable && <span className="ml-1 text-xs text-muted">(non fact.)</span>}</span>
                </li>
              ))}
              {!entries.length && <li className="py-1.5 text-muted">Aucune heure saisie.</li>}
            </ul>
            {!done && (
              <form action={logTimeAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <input type="hidden" name="wo_id" value={wo.id} />
                {teamWrite && (
                  <Field label="Personne">
                    <Select name="employee_id" defaultValue={ctx.employee_id ?? ""}>
                      {(team ?? []).map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Date" className="w-40"><Input type="date" name="work_date" defaultValue={today} /></Field>
                <Field label="Heures" className="w-24"><Input type="number" name="hours" min={0.25} max={24} step={0.25} required data-testid="time-hours" /></Field>
                <Field label="Note" className="w-48"><Input name="note" /></Field>
                <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="billable" defaultChecked /> facturable</label>
                <SubmitButton variant="secondary" testId="time-submit">+ Saisir</SubmitButton>
              </form>
            )}
          </Card>

          {/* Tâches */}
          <Card>
            <CardTitle>Tâches</CardTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["todo", "doing", "done"] as const).map((col) => (
                <div key={col} className="rounded-lg bg-surface-2/60 p-2">
                  <p className="mb-2 text-xs font-semibold text-muted">{col === "todo" ? "À faire" : col === "doing" ? "En cours" : "Fait"}</p>
                  <ul className="space-y-2">
                    {tasks.filter((t) => t.status === col).map((t) => (
                      <li key={t.id} className="rounded-md border border-border bg-surface p-2 text-sm">
                        <p className={col === "done" ? "text-muted line-through" : ""}>{t.title}</p>
                        {t.due_on && <p className="text-xs text-muted">{formatDate(t.due_on)}</p>}
                        {write && (
                          <form action={taskStatusAction} className="mt-1 flex gap-1">
                            <input type="hidden" name="wo_id" value={wo.id} />
                            <input type="hidden" name="task_id" value={t.id} />
                            {col !== "todo" && <button name="status" value={col === "done" ? "doing" : "todo"} className="rounded px-1.5 text-xs text-muted hover:bg-surface-2">←</button>}
                            {col !== "done" && <button name="status" value={col === "todo" ? "doing" : "done"} className="rounded px-1.5 text-xs text-accent hover:bg-surface-2">→</button>}
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {write && (
              <form action={addTaskAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="wo_id" value={wo.id} />
                <div className="w-72"><Input name="title" placeholder="Nouvelle tâche…" /></div>
                <div className="w-40"><Input type="date" name="due_on" /></div>
                <SubmitButton variant="secondary">Ajouter</SubmitButton>
              </form>
            )}
          </Card>

          {/* Historique */}
          <Card>
            <CardTitle>Historique des étapes</CardTitle>
            <ol className="space-y-2 border-l-2 border-border pl-4 text-sm">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full" style={{ background: stages.find((s) => s.id === h.stage)?.color ?? "#999" }} />
                  <span className="font-medium">{stages.find((s) => s.id === h.stage)?.label ?? h.stage}</span>
                  <span className="text-muted"> · {time(h.entered_at)}{h.left_at ? ` → ${time(h.left_at)}` : " · en cours"}</span>
                  {h.note && <p className="text-xs text-muted">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Dossier</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Famille</dt><dd className="text-right">{sectorConfig.productFamilies.find((f) => f.id === wo.product_family)?.label ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Technologie</dt><dd>{tech?.label ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Objet physique</dt><dd className="text-right">{wo.physical_object ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Site · zone</dt><dd className="text-right">{site?.name} · {(wo.zones as unknown as { name: string } | null)?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Responsable</dt><dd>{(wo.employees as unknown as { first_name: string; last_name: string } | null)?.first_name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Échéance</dt><dd className={late ? "font-medium text-danger" : ""}>{wo.due_date ? formatDate(wo.due_date) : "—"}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardTitle>Machine</CardTitle>
            {asset ? (
              <p className="text-sm"><span className="font-medium">{asset.code}</span> · {asset.name} <Badge tone={asset.status === "running" ? "ok" : asset.status === "down" ? "danger" : "neutral"}>{ASSET_STATUS_LABEL[asset.status]}</Badge></p>
            ) : (
              <p className="text-sm text-muted">Aucune machine affectée.</p>
            )}
            {(bookings ?? []).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {(bookings ?? []).map((b) => <li key={b.id}>{(b.assets as unknown as { code: string } | null)?.code} : {time(b.starts_at)} → {time(b.ends_at)}</li>)}
              </ul>
            )}
            {write && !done && (
              <form action={assignMachineAction} className="mt-3 space-y-2 border-t border-border pt-3">
                <input type="hidden" name="wo_id" value={wo.id} />
                <Select name="asset_id" defaultValue={wo.asset_id ?? ""}>
                  <option value="">— Aucune —</option>
                  {siteMachines.map((m) => <option key={m.id} value={m.id}>{m.code} · {ASSET_STATUS_LABEL[m.status]}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="datetime-local" name="starts_at" aria-label="Début de réservation" />
                  <Input type="datetime-local" name="ends_at" aria-label="Fin de réservation" />
                </div>
                <SubmitButton variant="secondary">Réserver / changer</SubmitButton>
              </form>
            )}
          </Card>

          {checklists.map((cl) => (
            <Card key={cl.id}>
              <CardTitle>{cl.title}</CardTitle>
              <ul className="space-y-1 text-sm">
                {cl.items.map((it, i) => (
                  <li key={i}>
                    <form action={checklistToggleAction}>
                      <input type="hidden" name="wo_id" value={wo.id} />
                      <input type="hidden" name="checklist_id" value={cl.id} />
                      <input type="hidden" name="index" value={i} />
                      <button disabled={!write} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-surface-2 disabled:cursor-default" data-testid="check-item">
                        <span className={clsx("flex h-4 w-4 items-center justify-center rounded border text-[10px]", it.done ? "border-ok bg-ok text-white" : "border-border")}>{it.done && "✓"}</span>
                        <span className={it.done ? "text-muted" : ""}>{it.label}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Card>
            <CardTitle>Traçabilité</CardTitle>
            <form action={traceabilityAction} className="space-y-2">
              <input type="hidden" name="wo_id" value={wo.id} />
              <Field label="Lot matière"><Input name="lot_matiere" defaultValue={trace.lot_matiere ?? ""} disabled={!write} /></Field>
              <Field label="Norme"><Input name="norme" defaultValue={trace.norme ?? ""} disabled={!write} /></Field>
              <Field label="N° de série"><Input name="serial" defaultValue={trace.serial ?? ""} disabled={!write} /></Field>
              {write && <SubmitButton variant="secondary">Enregistrer</SubmitButton>}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
