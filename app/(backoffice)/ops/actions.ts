"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import type { Action } from "@/lib/domain/permissions";
import { moveStage, qualityDecision, setStageProgress, shipWorkOrder, type OpsCtx } from "@/lib/services/ops";
import { createClient } from "@/lib/supabase/server";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const back = (id: string, r: { ok: boolean; reason?: string }, okMsg: string) =>
  redirect(`/ops/work-orders/${id}?${r.ok ? `ok=${q(okMsg)}` : `err=${q(r.reason ?? "Erreur")}`}`);

async function guard(action: Action): Promise<OpsCtx> {
  const ctx = await requireUser();
  if (!can(ctx, "ops", action)) throw new Error("Droits insuffisants sur la Production.");
  return { db: await createClient(), orgId: ctx.org.id, actor: ctx.user_id, actorEmployeeId: ctx.employee_id };
}

const stageLabel = (id: string) => sectorConfig.workOrder.stages.find((s) => s.id === id)?.label ?? id;

export async function moveStageAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const to = String(form.get("to"));
  // Le contrôle qualité se valide avec le bouton dédié (droit « approve »).
  if (to !== "quality" && String(form.get("from")) === "quality") redirect(`/ops/work-orders/${id}?err=${q("Utilisez « Valider » ou « Rejeter » au contrôle qualité.")}`);
  const r = await moveStage(c, id, to, { assetId: str(form.get("asset_id")), note: str(form.get("note")) ?? undefined });
  back(id, r, `Étape « ${stageLabel(to)} ».`);
}

export async function qualityAction(form: FormData) {
  const c = await guard("approve");
  const id = String(form.get("wo_id"));
  const accepted = form.get("decision") === "accept";
  const r = await qualityDecision(c, id, accepted, str(form.get("reason")));
  back(id, r, accepted ? "Contrôle qualité validé." : "Pièce rejetée — retour en reprise.");
}

export async function shipAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const r = await shipWorkOrder(c, id);
  back(id, r, "Expédition enregistrée — visible sur la Map.");
}

export async function progressAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  await setStageProgress(c, id, Number(form.get("stage_progress")));
  redirect(`/ops/work-orders/${id}?ok=${q("Avancement mis à jour.")}`);
}

export async function assignMachineAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const assetId = str(form.get("asset_id"));
  const { data: wo } = await c.db.from("work_orders").select("stage, asset_id").eq("id", id).single();
  if (!wo) redirect(`/ops/work-orders?err=${q("Dossier introuvable.")}`);
  if (wo.asset_id && wo.asset_id !== assetId && wo.stage === "printing") await c.db.from("assets").update({ status: "idle" }).eq("id", wo.asset_id);
  await c.db.from("work_orders").update({ asset_id: assetId }).eq("id", id);
  if (assetId && wo.stage === "printing") await c.db.from("assets").update({ status: "running" }).eq("id", assetId);
  const start = str(form.get("starts_at"));
  const end = str(form.get("ends_at"));
  if (assetId && start && end) {
    await c.db.from("asset_bookings").insert({ org_id: c.orgId, asset_id: assetId, work_order_id: id, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), booked_by: c.actorEmployeeId ?? null });
  }
  redirect(`/ops/work-orders/${id}?ok=${q(assetId ? "Machine réservée." : "Machine libérée.")}`);
}

const timeSchema = z.object({ hours: z.number().positive().max(24), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), billable: z.boolean(), note: z.string().nullable() });

/** Saisie d'heures : un opérateur saisit les siennes (RLS « own_create »), un responsable pour l'équipe. */
export async function logTimeAction(form: FormData) {
  const ctx = await requireUser();
  const db = await createClient();
  const id = String(form.get("wo_id"));
  const parsed = timeSchema.safeParse({ hours: Number(form.get("hours")), work_date: String(form.get("work_date")), billable: form.get("billable") === "on", note: str(form.get("note")) });
  if (!parsed.success) redirect(`/ops/work-orders/${id}?err=${q("Heures invalides (entre 0 et 24).")}`);
  const employee = can(ctx, "ops", "create") ? (str(form.get("employee_id")) ?? ctx.employee_id) : ctx.employee_id;
  if (!employee) redirect(`/ops/work-orders/${id}?err=${q("Votre compte n'est lié à aucun employé.")}`);
  const { error } = await db.from("time_entries").insert({ org_id: ctx.org.id, work_order_id: id, employee_id: employee, ...parsed.data });
  redirect(`/ops/work-orders/${id}?${error ? `err=${q(error.message)}` : `ok=${q(`${parsed.data.hours} h enregistrées.`)}`}`);
}

export async function taskStatusAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const status = String(form.get("status"));
  if (!["todo", "doing", "done"].includes(status)) redirect(`/ops/work-orders/${id}`);
  await c.db.from("tasks").update({ status }).eq("id", String(form.get("task_id")));
  redirect(`/ops/work-orders/${id}`);
}

export async function addTaskAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const title = str(form.get("title"));
  if (title) await c.db.from("tasks").insert({ org_id: c.orgId, work_order_id: id, title, assignee_employee_id: str(form.get("assignee")), due_on: str(form.get("due_on")) });
  redirect(`/ops/work-orders/${id}`);
}

export async function checklistToggleAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const listId = String(form.get("checklist_id"));
  const index = Number(form.get("index"));
  const { data: cl } = await c.db.from("checklists").select("items").eq("id", listId).single();
  const items = ((cl?.items as { label: string; done: boolean }[] | null) ?? []).map((it, i) => (i === index ? { ...it, done: !it.done } : it));
  await c.db.from("checklists").update({ items }).eq("id", listId);
  redirect(`/ops/work-orders/${id}`);
}

export async function traceabilityAction(form: FormData) {
  const c = await guard("update");
  const id = String(form.get("wo_id"));
  const { data: wo } = await c.db.from("work_orders").select("traceability").eq("id", id).single();
  const t = { ...((wo?.traceability as Record<string, unknown>) ?? {}), lot_matiere: str(form.get("lot_matiere")), norme: str(form.get("norme")), serial: str(form.get("serial")) };
  await c.db.from("work_orders").update({ traceability: t as never }).eq("id", id);
  redirect(`/ops/work-orders/${id}?ok=${q("Traçabilité mise à jour.")}`);
}
