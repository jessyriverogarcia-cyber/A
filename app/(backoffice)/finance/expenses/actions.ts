"use server";

import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { categoryOf, expenseAmounts } from "@/lib/domain/expenses";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const policy = sectorConfig.expenses;
const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);

/** Saisie en self-service (RLS « own_create ») : montant ou kilomètres, justificatif, dossier refacturable. */
export async function submitExpenseAction(form: FormData) {
  const ctx = await requireUser();
  const back = str(form.get("back")) ?? "/me";
  if (!ctx.employee_id) redirect(`${back}?err=${q("Votre compte n'est lié à aucun salarié.")}`);
  const db = await createClient();
  const category = String(form.get("category"));
  const cat = categoryOf(policy, category);
  const label = str(form.get("label"));
  const spentOn = str(form.get("spent_on"));
  const km = cat?.mileage ? Number(String(form.get("km") ?? "").replace(",", ".")) : null;
  const amount = cat?.mileage ? null : Number(String(form.get("amount") ?? "").replace(",", "."));
  if (!cat || !label || !spentOn || (cat.mileage ? !(km! > 0) : !(amount! > 0))) redirect(`${back}?err=${q("Catégorie, libellé, date et montant (ou kilomètres) sont obligatoires.")}`);
  const a = expenseAmounts(policy, { category, amount, km });

  // Justificatif dans le dossier privé du salarié
  let receiptPath: string | null = null;
  let receiptName: string | null = null;
  const file = form.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) redirect(`${back}?err=${q("Justificatif trop volumineux (10 Mo maximum).")}`);
    receiptPath = `${ctx.org.id}/expense/${ctx.employee_id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    receiptName = file.name;
    const { error } = await db.storage.from("documents").upload(receiptPath, file, { contentType: file.type || "application/octet-stream" });
    if (error) redirect(`${back}?err=${q(`Justificatif non enregistré : ${error.message}`)}`);
  }
  const workOrderId = str(form.get("work_order_id"));
  const { data, error } = await db
    .from("expenses")
    .insert({
      org_id: ctx.org.id,
      employee_id: ctx.employee_id,
      label,
      category,
      spent_on: spentOn,
      amount: a.ttc,
      vat_amount: a.vat,
      km,
      work_order_id: workOrderId,
      billable: !!workOrderId && form.get("billable") === "on",
      comment: str(form.get("comment")),
      receipt_path: receiptPath,
      receipt_name: receiptName,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    if (receiptPath) await db.storage.from("documents").remove([receiptPath]);
    redirect(`${back}?err=${q(error.message)}`);
  }
  await db.rpc("notify_expense_submitted", { p_expense: data.id });
  redirect(`${back}?ok=${q(`Note de frais envoyée : ${a.ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}. La comptabilité est prévenue.`)}`);
}

export async function withdrawExpenseAction(form: FormData) {
  const ctx = await requireUser();
  const db = await createClient();
  const id = String(form.get("expense_id"));
  const { data: e } = await db.from("expenses").select("receipt_path").eq("id", id).eq("employee_id", ctx.employee_id ?? "").eq("status", "pending").maybeSingle();
  if (e) {
    await db.from("expenses").delete().eq("id", id);
    if (e.receipt_path) await db.storage.from("documents").remove([e.receipt_path]);
  }
  redirect(`${str(form.get("back")) ?? "/me"}?ok=${q("Note retirée.")}`);
}

// Deux actions distinctes : un bouton porteur de formAction ne transmet pas son name/value.
export const approveExpensesAction = async (form: FormData) => decideExpenses(form, true);
export const rejectExpensesAction = async (form: FormData) => decideExpenses(form, false);

/** Validation ou refus en un clic (droit expenses:approve) ; le salarié est notifié. */
async function decideExpenses(form: FormData, approve: boolean) {
  const ctx = await requireUser();
  if (!can(ctx, "expenses", "approve")) redirect(`/finance/expenses?err=${q("Droits insuffisants.")}`);
  const db = await createClient();
  const ids = form.getAll("expense_id").map(String);
  if (!ids.length) redirect(`/finance/expenses?err=${q("Aucune note sélectionnée.")}`);
  const { data, error } = await db
    .from("expenses")
    .update({ status: approve ? "approved" : "rejected", approver_id: ctx.employee_id, decided_at: new Date().toISOString(), rejection_reason: approve ? null : (str(form.get("reason")) ?? "Non conforme à la politique de frais") })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, employee_id, label, amount");
  if (error) redirect(`/finance/expenses?err=${q(error.message)}`);
  for (const e of data ?? [])
    await db.rpc("notify_employee", { p_employee: e.employee_id, p_title: `Note de frais ${approve ? "validée" : "refusée"}`, p_body: `${e.label} · ${Number(e.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`, p_link: "/me" });
  redirect(`/finance/expenses?ok=${q(`${data?.length ?? 0} note(s) ${approve ? "validée(s)" : "refusée(s)"}.`)}`);
}

/** Remboursement effectué (par la paie ou par virement) : les notes validées sortent du « à rembourser ». */
export async function markReimbursedAction(form: FormData) {
  const ctx = await requireUser();
  if (!can(ctx, "expenses", "update")) redirect(`/finance/expenses?err=${q("Droits insuffisants.")}`);
  const db = await createClient();
  const ids = form.getAll("expense_id").map(String);
  const { data } = await db.from("expenses").update({ status: "reimbursed", reimbursed_at: new Date().toISOString() }).in("id", ids).eq("status", "approved").select("id");
  redirect(`/finance/expenses?tab=approved&ok=${q(`${data?.length ?? 0} note(s) marquée(s) remboursée(s).`)}`);
}
