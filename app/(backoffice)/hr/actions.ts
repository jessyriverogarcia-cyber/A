"use server";

import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import type { Action, Module } from "@/lib/domain/permissions";
import { businessDays, rttBalance, zonedToIso } from "@/lib/domain/hr";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function guard(module: Module, action: Action) {
  const ctx = await requireUser();
  if (!can(ctx, module, action)) throw new Error("Droits insuffisants.");
  return { ctx, db: await createClient() };
}

const LEAVE_KINDS = ["paid", "rtt", "sick", "unpaid", "training", "other"];

/** Demande de congé en self-service (RLS « own_create » : chacun pour soi). */
export async function requestLeaveAction(form: FormData) {
  const ctx = await requireUser();
  const db = await createClient();
  const back = str(form.get("back")) ?? "/me";
  const start = str(form.get("starts_on"));
  const end = str(form.get("ends_on")) ?? start;
  const kind = String(form.get("kind"));
  if (!ctx.employee_id) redirect(`${back}?err=${q("Votre compte n'est lié à aucun employé.")}`);
  if (!start || !end || end < start || !LEAVE_KINDS.includes(kind)) redirect(`${back}?err=${q("Dates ou type de congé invalides.")}`);
  const days = form.get("half") === "on" && start === end ? 0.5 : businessDays(start, end);
  if (days <= 0) redirect(`${back}?err=${q("Aucun jour ouvré sur cette période.")}`);
  if (kind === "rtt") {
    const [{ data: me }, { data: mine }] = await Promise.all([
      db.from("employees").select("start_date, time_regime, weekly_hours, work_rate").eq("id", ctx.employee_id).single(),
      db.from("leave_requests").select("kind, status, starts_on, days").eq("employee_id", ctx.employee_id),
    ]);
    const b = rttBalance({ today: start, startDate: me?.start_date ?? null, regime: (me?.time_regime ?? "hours") as "hours" | "forfait_jours", weeklyHours: Number(me?.weekly_hours ?? 35), workRate: Number(me?.work_rate ?? 1), leaves: (mine ?? []).map((l) => ({ ...l, days: Number(l.days) })) }, sectorConfig.payroll.rtt);
    if (days > b.available) redirect(`${back}?err=${q(b.annual ? `Solde RTT insuffisant : ${b.available} j disponible(s) pour ${days} j demandé(s).` : "Votre horaire n'ouvre pas droit à des RTT.")}`);
  }
  const { data, error } = await db.from("leave_requests").insert({ org_id: ctx.org.id, employee_id: ctx.employee_id, kind, starts_on: start, ends_on: end, days, status: "pending", comment: str(form.get("comment")) }).select("id").single();
  if (error) redirect(`${back}?err=${q(error.message)}`);
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "leave.requested", entity_type: "leave_request", entity_id: data.id, actor: ctx.user_id, payload: { name: ctx.full_name, days, kind } });
  redirect(`${back}?ok=${q(`Demande envoyée : ${days} jour(s) ouvré(s). Vous serez notifié·e de la décision.`)}`);
}

export async function cancelLeaveAction(form: FormData) {
  const ctx = await requireUser();
  const db = await createClient();
  const id = String(form.get("leave_id"));
  // Une demande en attente peut être annulée par son auteur ou par les RH.
  const query = db.from("leave_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  await (can(ctx, "hr", "update") ? query : query.eq("employee_id", ctx.employee_id ?? ""));
  redirect(`${str(form.get("back")) ?? "/me"}?ok=${q("Demande annulée.")}`);
}

/** Validation en un clic (droit RH « approve »). */
export async function decideLeaveAction(form: FormData) {
  const { ctx, db } = await guard("hr", "approve");
  const id = String(form.get("leave_id"));
  const approve = form.get("decision") === "approve";
  const back = str(form.get("back")) ?? "/hr/leaves";
  const { data: lr, error } = await db
    .from("leave_requests")
    .update({ status: approve ? "approved" : "rejected", approver_id: ctx.employee_id, decided_at: new Date().toISOString(), rejection_reason: approve ? null : (str(form.get("reason")) ?? "Contrainte de planning") })
    .eq("id", id)
    .eq("status", "pending")
    .select("days, employee_id, starts_on, employees:employees!leave_requests_employee_id_fkey(first_name, last_name)")
    .single();
  if (error || !lr) redirect(`${back}?err=${q("Demande introuvable ou déjà traitée.")}`);
  const e = lr.employees as unknown as { first_name: string; last_name: string };
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: approve ? "leave.approved" : "leave.rejected", entity_type: "leave_request", entity_id: id, actor: ctx.user_id, payload: { name: `${e.first_name} ${e.last_name}`, days: lr.days } });
  await db.rpc("notify_employee", { p_employee: lr.employee_id, p_title: `Votre demande de congé est ${approve ? "validée" : "refusée"}`, p_body: `${lr.days} jour(s) à partir du ${lr.starts_on}`, p_link: "/me" });
  redirect(`${back}?ok=${q(`Congé ${approve ? "validé" : "refusé"} pour ${e.first_name} ${e.last_name}.`)}`);
}

/** Badgeuse virtuelle (« Mon espace ») : même chemin que la badgeuse physique, la Map réagit. */
export async function selfBadgeAction(form: FormData) {
  const ctx = await requireUser();
  const db = await createClient();
  const kind = String(form.get("kind"));
  if (!["in", "out", "break_start", "break_end"].includes(kind) || !ctx.employee_id) redirect("/me");
  const { error } = await db.from("badge_events").insert({ org_id: ctx.org.id, employee_id: ctx.employee_id, kind, reader: "APP" });
  if (error) redirect(`/me?err=${q(error.message)}`);
  if (kind === "in" || kind === "break_start")
    await db.from("activity_events").insert({ org_id: ctx.org.id, type: kind === "in" ? "badge.in" : "badge.break_start", entity_type: "employee", entity_id: ctx.employee_id, actor: ctx.user_id, payload: { personne: ctx.full_name, name: ctx.full_name, kind } });
  const label = { in: "Arrivée", out: "Départ", break_start: "Début de pause", break_end: "Fin de pause" }[kind];
  redirect(`/me?ok=${q(`${label} enregistré(e).`)}`);
}

/** Correction d'un oubli de pointage (RH, présence « update »), tracée dans l'audit. */
export async function fixBadgeAction(form: FormData) {
  const { ctx, db } = await guard("presence", "create");
  const employee = String(form.get("employee_id"));
  const day = String(form.get("day"));
  const time = str(form.get("time")) ?? "17:00";
  const kind = String(form.get("kind") ?? "out");
  const { error } = await db.from("badge_events").insert({ org_id: ctx.org.id, employee_id: employee, kind, reader: `CORRECTION ${ctx.full_name}`, at: zonedToIso(day, time, sectorConfig.company.timezone) });
  redirect(`/hr/presence?${error ? `err=${q(error.message)}` : `ok=${q("Pointage corrigé.")}`}`);
}

const STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"];

export async function candidateStageAction(form: FormData) {
  const { ctx, db } = await guard("hr", "update");
  const id = String(form.get("candidate_id"));
  const stage = String(form.get("stage"));
  if (!STAGES.includes(stage)) redirect("/hr/recruitment");
  const { data: c } = await db.from("candidates").update({ stage }).eq("id", id).select("full_name").single();
  if (stage === "hired" && c) await db.from("activity_events").insert({ org_id: ctx.org.id, type: "candidate.hired", entity_type: "candidate", entity_id: id, actor: ctx.user_id, payload: { name: c.full_name } });
  redirect(`/hr/recruitment?ok=${q(stage === "hired" ? `${c?.full_name} recruté·e : pensez au parcours d'intégration.` : "Candidat déplacé.")}`);
}

export async function addCandidateAction(form: FormData) {
  const { ctx, db } = await guard("hr", "create");
  const name = str(form.get("full_name"));
  if (!name) redirect(`/hr/recruitment?err=${q("Nom requis.")}`);
  await db.from("candidates").insert({ org_id: ctx.org.id, job_opening_id: str(form.get("job_opening_id")), full_name: name, email: str(form.get("email")), source: str(form.get("source")) ?? "Candidature spontanée", stage: "new" });
  redirect(`/hr/recruitment?ok=${q("Candidat ajouté.")}`);
}

export async function onboardingToggleAction(form: FormData) {
  const { db } = await guard("hr", "update");
  const id = String(form.get("task_id"));
  const { data: t } = await db.from("onboarding_tasks").select("done, employee_id").eq("id", id).single();
  await db.from("onboarding_tasks").update({ done: !t?.done }).eq("id", id);
  redirect(`/hr/employees/${t?.employee_id}`);
}
