"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import type { Action } from "@/lib/domain/permissions";
import { getMailProvider } from "@/lib/integrations/mail";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { createInvoiceFromWorkOrder, saveInvoiceLines } from "@/lib/services/finance";
import { nextNumber } from "@/lib/services/crm";
import { createClient } from "@/lib/supabase/server";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function guard(action: Action) {
  const ctx = await requireUser();
  if (!can(ctx, "finance", action)) throw new Error("Droits insuffisants sur la Finance.");
  return { ctx, db: await createClient() };
}

export async function createInvoiceFromWoAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const woId = String(form.get("wo_id"));
  const kind = form.get("kind") === "deposit" ? "deposit" : "final";
  const ratio = Math.min(0.9, Math.max(0.05, Number(form.get("ratio") ?? 30) / 100));
  const backTo = str(form.get("back")) ?? "/finance";
  let id: string;
  try {
    const inv = await createInvoiceFromWorkOrder(db, ctx.org.id, woId, kind, ratio);
    id = inv.id;
  } catch (e) {
    redirect(`${backTo}?err=${q(e instanceof Error ? e.message : "Erreur")}`);
  }
  redirect(`/finance/invoices/${id}?ok=${q("Facture créée en brouillon à partir du dossier : relisez-la puis envoyez-la.")}`);
}

const lineSchema = z.array(z.object({ description: z.string().min(1), quantity: z.number(), unit_price: z.number(), discount: z.number().min(0).max(1), catalog_item_id: z.string().uuid().nullable().optional() }));

export async function saveInvoiceLinesAction(invoiceId: string, lines: unknown, notes: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { ctx, db } = await guard("update");
  const parsed = lineSchema.safeParse(lines);
  if (!parsed.success) return { ok: false, reason: "Lignes invalides." };
  const { data: inv } = await db.from("invoices").select("status").eq("id", invoiceId).single();
  // Une facture émise ne se modifie plus (obligation légale) : on fait un avoir.
  if (inv?.status !== "draft") return { ok: false, reason: "Seule une facture brouillon est modifiable." };
  try {
    await saveInvoiceLines(db, ctx.org.id, invoiceId, parsed.data);
    await db.from("invoices").update({ notes }).eq("id", invoiceId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Erreur" };
  }
  return { ok: true };
}

async function mailFor(invoiceId: string, form: FormData, author: string, orgId: string) {
  const db = await createClient();
  const { data: inv } = await db.from("invoices").select("number, client_id, work_order_id, contacts(email)").eq("id", invoiceId).single();
  if (!inv) throw new Error("Facture introuvable.");
  const res = await (await getMailProvider(db, orgId)).send({
    to: (inv.contacts as unknown as { email: string | null } | null)?.email ?? null,
    subject: String(form.get("subject")),
    body: String(form.get("body")),
    clientId: inv.client_id,
    workOrderId: inv.work_order_id,
    author,
    attachments: [{ name: `${inv.number}.pdf`, url: `/finance/invoices/${invoiceId}/pdf`, load: async () => { const pdf = await renderInvoicePdf(db, invoiceId); return pdf && { data: pdf.data, mime: "application/pdf" }; } }],
  });
  if (!res.ok) redirect(`/finance/invoices/${invoiceId}?err=${q(res.reason ?? "Échec de l'envoi")}`);
  return { inv, simulated: res.simulated };
}

export async function sendInvoiceAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("invoice_id"));
  const { data: check } = await db.from("invoices").select("status, total_ttc, contact_id, client_id").eq("id", id).single();
  if (check?.status !== "draft") redirect(`/finance/invoices/${id}?err=${q("Facture déjà émise.")}`);
  if (Number(check.total_ttc) === 0) redirect(`/finance/invoices/${id}?err=${q("Facture vide.")}`);
  if (!check.contact_id) {
    const { data: ct } = await db.from("contacts").select("id").eq("client_id", check.client_id).order("is_primary", { ascending: false }).limit(1).maybeSingle();
    if (ct) await db.from("invoices").update({ contact_id: ct.id }).eq("id", id);
  }
  const { inv, simulated } = await mailFor(id, form, ctx.full_name, ctx.org.id);
  const today = new Date().toISOString().slice(0, 10);
  await db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString(), issue_date: today }).eq("id", id);
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "invoice.sent", entity_type: "invoice", entity_id: id, actor: ctx.user_id, payload: { number: inv.number } });
  redirect(`/finance/invoices/${id}?ok=${q(`Facture émise et envoyée${simulated ? " (simulation)" : ""}.`)}`);
}

export async function recordPaymentAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const id = String(form.get("invoice_id"));
  const amount = Number(form.get("amount"));
  const paidOn = str(form.get("paid_on")) ?? new Date().toISOString().slice(0, 10);
  const backTo = str(form.get("back")) ?? `/finance/invoices/${id}`;
  if (!(amount > 0)) redirect(`${backTo}?err=${q("Montant invalide.")}`);
  const { error } = await db.from("payments").insert({ org_id: ctx.org.id, invoice_id: id, amount, paid_on: paidOn, method: str(form.get("method")) ?? "transfer" });
  if (error) redirect(`${backTo}?err=${q(error.message)}`);
  const { data: inv } = await db.from("invoices").select("number, status").eq("id", id).single();
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "payment.received", entity_type: "invoice", entity_id: id, actor: ctx.user_id, payload: { number: inv?.number, amount } });
  redirect(`${backTo}?ok=${q(inv?.status === "paid" ? "Paiement enregistré : facture soldée." : "Paiement partiel enregistré.")}`);
}

export async function dunningAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const id = String(form.get("invoice_id"));
  const level = Number(form.get("level"));
  const backTo = str(form.get("back")) ?? `/finance/invoices/${id}`;
  const { inv, simulated } = await mailFor(id, form, ctx.full_name, ctx.org.id);
  await db.from("dunning_steps").insert({ org_id: ctx.org.id, invoice_id: id, level, channel: "email", note: String(form.get("subject")) });
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "invoice.dunning", entity_type: "invoice", entity_id: id, actor: ctx.user_id, payload: { number: inv.number, level } });
  redirect(`${backTo}?ok=${q(`Relance niveau ${level} envoyée${simulated ? " (simulation)" : ""}.`)}`);
}

/** Avoir : annule (totalement) une facture émise, sans la modifier. */
export async function creditNoteAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const id = String(form.get("invoice_id"));
  const { data: src } = await db.from("invoices").select("*, invoice_lines(*)").eq("id", id).single();
  if (!src || src.status === "draft" || src.kind === "credit_note") redirect(`/finance/invoices/${id}?err=${q("Avoir impossible sur ce document.")}`);
  const today = new Date().toISOString().slice(0, 10);
  const { data: credit, error } = await db
    .from("invoices")
    .insert({ org_id: ctx.org.id, client_id: src.client_id, work_order_id: src.work_order_id, quote_id: src.quote_id, contact_id: src.contact_id, kind: "credit_note", corrects_invoice_id: src.id, number: await nextNumber(db, "invoices", "AV"), status: "draft", issue_date: today, due_date: today, notes: `Avoir sur facture ${src.number}` })
    .select("id")
    .single();
  if (error) redirect(`/finance/invoices/${id}?err=${q(error.message)}`);
  const lines = (src.invoice_lines as { description: string; quantity: number; unit_price: number; discount: number }[]).map((l) => ({ description: `${l.description} (avoir ${src.number})`, quantity: Number(l.quantity), unit_price: -Number(l.unit_price), discount: Number(l.discount) }));
  await saveInvoiceLines(db, ctx.org.id, credit.id, lines);
  redirect(`/finance/invoices/${credit.id}?ok=${q("Avoir créé en brouillon.")}`);
}

export async function deleteDraftAction(form: FormData) {
  const { db } = await guard("delete");
  const id = String(form.get("invoice_id"));
  const { data: inv } = await db.from("invoices").select("status").eq("id", id).single();
  if (inv?.status !== "draft") redirect(`/finance/invoices/${id}?err=${q("Seul un brouillon peut être supprimé.")}`);
  await db.from("invoices").delete().eq("id", id);
  redirect(`/finance/invoices?ok=${q("Brouillon supprimé.")}`);
}

