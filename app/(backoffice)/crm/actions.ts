"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sectorConfig } from "@/config/sector.config";
import { can, requireUser, type UserContext } from "@/lib/auth";
import { computeQuoteTotals } from "@/lib/domain/quote";
import { fromCents, toCents } from "@/lib/domain/money";
import { getMailProvider } from "@/lib/integrations/mail";
import { renderQuotePdf } from "@/lib/pdf/render";
import { acceptQuote, nextNumber } from "@/lib/services/crm";
import { createClient } from "@/lib/supabase/server";
import type { Action } from "@/lib/domain/permissions";

const cfg = sectorConfig;
const q = (msg: string) => encodeURIComponent(msg);

async function guard(action: Action) {
  const ctx = await requireUser();
  if (!can(ctx, "crm", action)) throw new Error("Droits insuffisants sur le module Commercial.");
  return { ctx, db: await createClient() };
}

async function emit(ctx: UserContext, type: string, entity_type: string, entity_id: string, payload: Record<string, unknown>) {
  const db = await createClient();
  await db.from("activity_events").insert({ org_id: ctx.org.id, type, entity_type, entity_id, actor: ctx.user_id, payload: payload as never });
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

// --- Clients et contacts ------------------------------------------------------

const clientSchema = z.object({
  name: z.string().min(2, "Nom trop court"),
  industry: z.string().nullable(),
  product_family: z.string().nullable(),
  city: z.string().nullable(),
  vat_number: z.string().nullable(),
  status: z.enum(["prospect", "active", "inactive"]),
});

export async function createClientAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const parsed = clientSchema.safeParse({
    name: str(form.get("name")),
    industry: str(form.get("industry")),
    product_family: str(form.get("product_family")),
    city: str(form.get("city")),
    vat_number: str(form.get("vat_number")),
    status: str(form.get("status")) ?? "prospect",
  });
  if (!parsed.success) redirect(`/crm/clients/new?err=${q(parsed.error.issues[0].message)}`);
  const { data: client, error } = await db
    .from("clients")
    .insert({ ...parsed.data, org_id: ctx.org.id, country: "FR", payment_terms_days: cfg.crm.paymentTermsDays, owner_employee_id: ctx.employee_id })
    .select("id")
    .single();
  if (error) redirect(`/crm/clients/new?err=${q(error.message)}`);
  const first = str(form.get("contact_first_name"));
  const last = str(form.get("contact_last_name"));
  if (first && last) {
    await db.from("contacts").insert({ org_id: ctx.org.id, client_id: client.id, first_name: first, last_name: last, email: str(form.get("contact_email")), phone: str(form.get("contact_phone")), job_title: str(form.get("contact_job_title")), is_primary: true });
  }
  redirect(`/crm/clients/${client.id}?ok=${q("Client créé.")}`);
}

export async function addContactAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const clientId = String(form.get("client_id"));
  const first = str(form.get("first_name"));
  const last = str(form.get("last_name"));
  if (!first || !last) redirect(`/crm/clients/${clientId}?err=${q("Prénom et nom requis.")}`);
  const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  const { error } = await db.from("contacts").insert({ org_id: ctx.org.id, client_id: clientId, first_name: first, last_name: last, email: str(form.get("email")), phone: str(form.get("phone")), job_title: str(form.get("job_title")), is_primary: !count });
  redirect(`/crm/clients/${clientId}?${error ? `err=${q(error.message)}` : `ok=${q("Contact ajouté.")}`}`);
}

export async function updateClientNotesAction(form: FormData) {
  const { db } = await guard("update");
  const clientId = String(form.get("client_id"));
  await db.from("clients").update({ notes: str(form.get("notes")) }).eq("id", clientId);
  redirect(`/crm/clients/${clientId}?ok=${q("Notes enregistrées.")}`);
}

// --- Affaires (pipeline) -----------------------------------------------------

export async function createDealAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const clientId = String(form.get("client_id"));
  const title = str(form.get("title"));
  const back = str(form.get("back")) ?? `/crm/clients/${clientId}`;
  if (!title) redirect(`${back}?err=${q("Titre requis.")}`);
  const stage = cfg.crm.pipelineStages[0];
  const { data: client } = await db.from("clients").select("product_family").eq("id", clientId).single();
  const { error } = await db.from("deals").insert({
    org_id: ctx.org.id,
    client_id: clientId,
    title,
    stage: stage.id,
    probability: stage.probability,
    value: Number(form.get("value") || 0),
    expected_close: str(form.get("expected_close")),
    owner_employee_id: ctx.employee_id,
    product_family: client?.product_family ?? null,
    next_step: str(form.get("next_step")),
    next_step_on: str(form.get("next_step_on")),
  });
  redirect(`${back}?${error ? `err=${q(error.message)}` : `ok=${q("Affaire créée.")}`}`);
}

export async function moveDealAction(dealId: string, stageId: string): Promise<{ ok: boolean; reason?: string }> {
  const { ctx, db } = await guard("update");
  const stage = cfg.crm.pipelineStages.find((s) => s.id === stageId);
  if (!stage) return { ok: false, reason: "Étape inconnue." };
  const { data: deal, error } = await db.from("deals").update({ stage: stage.id, probability: stage.probability }).eq("id", dealId).select("title, clients(name)").single();
  if (error) return { ok: false, reason: error.message };
  await emit(ctx, "deal.stage", "deal", dealId, { title: deal.title, client: (deal.clients as unknown as { name: string } | null)?.name, stage: stage.label });
  revalidatePath("/crm");
  return { ok: true };
}

export async function updateNextStepAction(form: FormData) {
  const { db } = await guard("update");
  const dealId = String(form.get("deal_id"));
  const back = str(form.get("back")) ?? "/crm";
  await db.from("deals").update({ next_step: str(form.get("next_step")), next_step_on: str(form.get("next_step_on")) }).eq("id", dealId);
  redirect(`${back}?ok=${q("Prochaine étape mise à jour.")}`);
}

// --- Devis -------------------------------------------------------------------

export async function createQuoteAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const clientId = String(form.get("client_id"));
  const dealId = str(form.get("deal_id"));
  const { data: contact } = await db.from("contacts").select("id").eq("client_id", clientId).order("is_primary", { ascending: false }).limit(1).maybeSingle();
  const today = new Date();
  const valid = new Date(today.getTime() + cfg.crm.quoteValidityDays * 86_400_000);
  const { data: quote, error } = await db
    .from("quotes")
    .insert({
      org_id: ctx.org.id,
      client_id: clientId,
      deal_id: dealId,
      contact_id: contact?.id ?? null,
      number: await nextNumber(db, "quotes", cfg.crm.quotePrefix),
      status: "draft",
      issue_date: today.toISOString().slice(0, 10),
      valid_until: valid.toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) redirect(`/crm/clients/${clientId}?err=${q(error.message)}`);
  redirect(`/crm/quotes/${quote.id}`);
}

const lineSchema = z.array(
  z.object({
    catalog_item_id: z.string().uuid().nullable(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().min(0),
    unit_cost: z.number().min(0),
    discount: z.number().min(0).max(1),
  }),
);

export async function saveQuoteLinesAction(quoteId: string, lines: unknown, notes: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { ctx, db } = await guard("update");
  const parsed = lineSchema.safeParse(lines);
  if (!parsed.success) return { ok: false, reason: "Lignes invalides : " + parsed.error.issues[0].message };
  const { data: quote } = await db.from("quotes").select("status").eq("id", quoteId).single();
  if (!quote || !["draft", "sent"].includes(quote.status)) return { ok: false, reason: "Ce devis n'est plus modifiable." };

  // Totaux recalculés côté serveur (jamais confiés au navigateur).
  const totals = computeQuoteTotals(
    parsed.data.map((l) => ({ quantity: l.quantity, unitPrice: toCents(l.unit_price), unitCost: toCents(l.unit_cost), discount: l.discount })),
    cfg.company.vatRate,
    cfg.company.rounding,
  );
  await db.from("quote_lines").delete().eq("quote_id", quoteId);
  if (parsed.data.length) {
    const { error } = await db.from("quote_lines").insert(parsed.data.map((l, i) => ({ ...l, org_id: ctx.org.id, quote_id: quoteId, position: i })));
    if (error) return { ok: false, reason: error.message };
  }
  const { error } = await db
    .from("quotes")
    .update({ total_ht: fromCents(totals.net), total_vat: fromCents(totals.vat), total_ttc: fromCents(totals.gross), total_cost: fromCents(totals.cost), notes })
    .eq("id", quoteId);
  if (error) return { ok: false, reason: error.message };
  const { data: q2 } = await db.from("quotes").select("deal_id").eq("id", quoteId).single();
  if (q2?.deal_id) await db.from("deals").update({ value: fromCents(totals.net) }).eq("id", q2.deal_id);
  revalidatePath(`/crm/quotes/${quoteId}`);
  return { ok: true };
}

async function sendMail(ctx: UserContext, quoteId: string, form: FormData, kind: "send" | "followup") {
  const db = await createClient();
  const { data: quote } = await db.from("quotes").select("number, client_id, deal_id, status, followups, total_ht, contacts(email)").eq("id", quoteId).single();
  if (!quote) throw new Error("Devis introuvable.");
  if (kind === "send" && Number(quote.total_ht) <= 0) redirect(`/crm/quotes/${quoteId}?err=${q("Ajoutez au moins une ligne avant d'envoyer.")}`);
  const mail = await getMailProvider(db, ctx.org.id);
  const res = await mail.send({
    to: (quote.contacts as unknown as { email: string | null } | null)?.email ?? null,
    subject: String(form.get("subject")),
    body: String(form.get("body")),
    clientId: quote.client_id,
    author: ctx.full_name,
    attachments: [{ name: `${quote.number}.pdf`, url: `/crm/quotes/${quoteId}/pdf`, load: async () => { const pdf = await renderQuotePdf(db, quoteId); return pdf && { data: pdf.data, mime: "application/pdf" }; } }],
  });
  if (!res.ok) redirect(`/crm/quotes/${quoteId}?err=${q(res.reason ?? "Échec de l'envoi")}`);
  return { quote, db, simulated: res.simulated };
}

export async function sendQuoteAction(form: FormData) {
  const { ctx } = await guard("update");
  const quoteId = String(form.get("quote_id"));
  const { quote, db, simulated } = await sendMail(ctx, quoteId, form, "send");
  await db.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
  if (quote.deal_id) {
    const { data: deal } = await db.from("deals").select("stage").eq("id", quote.deal_id).single();
    const order = cfg.crm.pipelineStages.map((s) => s.id);
    const proposal = cfg.crm.pipelineStages.find((s) => s.id === "proposal") ?? cfg.crm.pipelineStages[2];
    if (deal && order.indexOf(deal.stage) < order.indexOf(proposal.id))
      await db.from("deals").update({ stage: proposal.id, probability: proposal.probability }).eq("id", quote.deal_id);
  }
  await emit(ctx, "quote.sent", "quote", quoteId, { numero: quote.number });
  redirect(`/crm/quotes/${quoteId}?ok=${q(`Devis envoyé${simulated ? " (simulation : aucun e-mail réel, copie rangée dans l'historique)" : ""}.`)}`);
}

export async function followUpQuoteAction(form: FormData) {
  const { ctx } = await guard("update");
  const quoteId = String(form.get("quote_id"));
  const back = str(form.get("back")) ?? `/crm/quotes/${quoteId}`;
  const { quote, db, simulated } = await sendMail(ctx, quoteId, form, "followup");
  await db.from("quotes").update({ followups: quote.followups + 1, last_followup_at: new Date().toISOString() }).eq("id", quoteId);
  await emit(ctx, "quote.followup", "quote", quoteId, { numero: quote.number, level: quote.followups + 1 });
  redirect(`${back}?ok=${q(`Relance envoyée${simulated ? " (simulation)" : ""}.`)}`);
}

export async function acceptQuoteAction(form: FormData) {
  const { ctx } = await guard("update");
  const quoteId = String(form.get("quote_id"));
  let msg: string;
  try {
    const wo = await acceptQuote(await createClient(), quoteId);
    msg = wo.created ? `Devis accepté : ${cfg.workOrder.label.toLowerCase()} ${wo.number} créé et visible sur la Map.` : `Déjà accepté (${wo.number}).`;
  } catch (e) {
    redirect(`/crm/quotes/${quoteId}?err=${q(e instanceof Error ? e.message : "Erreur")}`);
  }
  void ctx;
  redirect(`/crm/quotes/${quoteId}?ok=${q(msg)}`);
}

export async function rejectQuoteAction(form: FormData) {
  const { ctx, db } = await guard("update");
  const quoteId = String(form.get("quote_id"));
  const reason = str(form.get("reason")) ?? "Non précisé";
  const { data: quote } = await db.from("quotes").update({ status: "rejected", rejected_reason: reason }).eq("id", quoteId).select("number, deal_id").single();
  if (quote?.deal_id) await db.from("deals").update({ stage: "lost", probability: 0, lost_reason: reason }).eq("id", quote.deal_id);
  await emit(ctx, "quote.rejected", "quote", quoteId, { numero: quote?.number, reason });
  redirect(`/crm/quotes/${quoteId}?ok=${q("Devis marqué comme refusé.")}`);
}

export async function duplicateQuoteAction(form: FormData) {
  const { ctx, db } = await guard("create");
  const quoteId = String(form.get("quote_id"));
  const { data: src } = await db.from("quotes").select("*, quote_lines(*)").eq("id", quoteId).single();
  if (!src) redirect(`/crm/quotes?err=${q("Devis introuvable.")}`);
  const today = new Date();
  const { data: copy, error } = await db
    .from("quotes")
    .insert({
      org_id: ctx.org.id,
      client_id: src.client_id,
      deal_id: src.deal_id,
      contact_id: src.contact_id,
      number: await nextNumber(db, "quotes", cfg.crm.quotePrefix),
      status: "draft",
      issue_date: today.toISOString().slice(0, 10),
      valid_until: new Date(today.getTime() + cfg.crm.quoteValidityDays * 86_400_000).toISOString().slice(0, 10),
      total_ht: src.total_ht,
      total_vat: src.total_vat,
      total_ttc: src.total_ttc,
      total_cost: src.total_cost,
      notes: src.notes,
    })
    .select("id")
    .single();
  if (error) redirect(`/crm/quotes/${quoteId}?err=${q(error.message)}`);
  const lines = (src.quote_lines ?? []) as { catalog_item_id: string | null; description: string; quantity: number; unit_price: number; unit_cost: number; discount: number; position: number }[];
  if (lines.length)
    await db.from("quote_lines").insert(lines.map((l) => ({ org_id: ctx.org.id, quote_id: copy.id, catalog_item_id: l.catalog_item_id, description: l.description, quantity: l.quantity, unit_price: l.unit_price, unit_cost: l.unit_cost, discount: l.discount, position: l.position })));
  redirect(`/crm/quotes/${copy.id}?ok=${q("Copie créée en brouillon.")}`);
}
