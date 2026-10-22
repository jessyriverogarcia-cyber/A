import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sectorConfig } from "@/config/sector.config";
import type { Database } from "@/lib/supabase/database.types";
import { todayIso } from "@/lib/domain/kpis";
import { effectiveStatus } from "@/lib/domain/invoice";
import { suggestReply, type ReplyContext } from "@/lib/domain/replies";
import { formatDate, formatMoney } from "@/lib/format";

type Db = SupabaseClient<Database>;
const cfg = sectorConfig;
const stageLabel = (id: string) => cfg.workOrder.stages.find((s) => s.id === id)?.label ?? id;

export type ThreadContext = NonNullable<Awaited<ReturnType<typeof threadContext>>>;

/**
 * Tout ce qu'il faut pour répondre sans chercher : interlocuteur, dossier, facture et devis liés.
 * Les mêmes données alimentent le panneau latéral du fil et le brouillon préparé.
 */
export async function threadContext(db: Db, threadId: string) {
  const { data: t } = await db
    .from("threads")
    .select(
      "*, clients(id, name), suppliers(id, name, email), work_orders(id, number, title, stage, progress, due_date, status, quote_id), assigned:employees!threads_assigned_employee_fkey(id, first_name, last_name), author:employees!threads_created_by_employee_fkey(id, first_name, last_name)",
    )
    .eq("id", threadId)
    .maybeSingle();
  if (!t) return null;
  const today = todayIso(cfg.company.timezone);
  const clientId = t.client_id;
  const [{ data: contacts }, { data: invoices }, { data: quotes }] = await Promise.all([
    clientId ? db.from("contacts").select("first_name, last_name, email, is_primary").eq("client_id", clientId).order("is_primary", { ascending: false }) : Promise.resolve({ data: [] }),
    clientId ? db.from("invoices").select("id, number, status, due_date, total_ttc, paid_amount").eq("client_id", clientId).neq("status", "draft").neq("status", "cancelled").order("issue_date", { ascending: false }) : Promise.resolve({ data: [] }),
    clientId ? db.from("quotes").select("id, number, status, valid_until").eq("client_id", clientId).order("issue_date", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const wo = t.work_orders as unknown as { id: string; number: string; title: string; stage: string; progress: number; due_date: string | null; status: string; quote_id: string | null } | null;
  const contact = (contacts ?? [])[0] ?? null;
  const supplier = t.suppliers as unknown as { id: string; name: string; email: string | null } | null;
  // Facture : celle citée dans le sujet, sinon la plus ancienne non soldée.
  const invs = (invoices ?? []).map((i) => ({ ...i, effective: effectiveStatus({ ...i, paid_amount: Number(i.paid_amount), total_ttc: Number(i.total_ttc) }, today) }));
  const invoice = invs.find((i) => t.subject.includes(i.number)) ?? invs.filter((i) => i.effective !== "paid").at(-1) ?? null;
  const quote = (quotes ?? []).find((q) => q.id === wo?.quote_id || t.subject.includes(q.number)) ?? (quotes ?? []).find((q) => q.status === "sent") ?? null;
  return {
    thread: t,
    client: t.clients as unknown as { id: string; name: string } | null,
    supplier,
    workOrder: wo,
    assigned: t.assigned as unknown as { id: string; first_name: string; last_name: string } | null,
    author: t.author as unknown as { id: string; first_name: string; last_name: string } | null,
    contact,
    to: t.channel === "internal" ? null : (contact?.email ?? supplier?.email ?? null),
    invoice,
    quote,
    today,
  };
}

/** Contexte du brouillon : seulement des faits vérifiés en base (étape, échéance, solde). */
export function replyContext(c: ThreadContext, senderName: string): ReplyContext {
  const wo = c.workOrder;
  const inv = c.invoice;
  return {
    companyName: cfg.company.name,
    senderName,
    contactFirstName: c.contact?.first_name ?? null,
    workOrder: wo ? { number: wo.number, stageLabel: stageLabel(wo.stage), dueDate: wo.due_date ? formatDate(wo.due_date) : null, late: !!wo.due_date && wo.due_date < c.today && wo.status === "active", progress: wo.progress } : null,
    invoice: inv
      ? { number: inv.number, paid: inv.effective === "paid", dueDate: formatDate(inv.due_date), balance: formatMoney(Number(inv.total_ttc) - Number(inv.paid_amount)), overdue: inv.effective === "overdue" }
      : null,
    quote: c.quote ? { number: c.quote.number, status: c.quote.status, validUntil: c.quote.valid_until ? formatDate(c.quote.valid_until) : null } : null,
  };
}

/** Prépare (ou remplace) le brouillon de réponse d'un fil à partir du dernier message reçu. */
export async function prepareDraft(db: Db, orgId: string, threadId: string, inbound: string, senderName: string) {
  const c = await threadContext(db, threadId);
  if (!c) return null;
  const draft = suggestReply(inbound, replyContext(c, senderName));
  await db.from("messages").delete().eq("thread_id", threadId).is("sent_at", null).eq("ai_draft", true);
  await db.from("messages").insert({ org_id: orgId, thread_id: threadId, direction: "out", author: senderName, body: draft.body, ai_draft: true, sent_at: null });
  return draft;
}

/** Enlève l'en-tête « À : … / Objet : … » ajouté par le fournisseur simulé, pour l'affichage. */
export function splitHeader(body: string) {
  const m = body.match(/^À : (.*)\nObjet : (.*)\n\n([\s\S]*)$/);
  return m ? { to: m[1], subject: m[2], text: m[3] } : { to: null, subject: null, text: body };
}
