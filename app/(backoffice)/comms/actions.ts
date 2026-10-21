"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { can, requireUser } from "@/lib/auth";
import type { Action, Module } from "@/lib/domain/permissions";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/server";
import { getMailProvider } from "@/lib/integrations/mail";
import { prepareDraft, threadContext } from "@/lib/services/comms";

const q = (m: string) => encodeURIComponent(m);
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function guard(module: Module, action: Action) {
  const ctx = await requireUser();
  if (!can(ctx, module, action)) throw new Error("Droits insuffisants.");
  return { ctx, db: await createClient() };
}

/** Envoi de la réponse (brouillon relu) : e-mail via le fournisseur, ou note interne. */
export async function sendReplyAction(form: FormData) {
  const { ctx, db } = await guard("comms", "create");
  const threadId = String(form.get("thread_id"));
  const back = `/comms/threads/${threadId}`;
  const body = str(form.get("body"));
  if (!body) redirect(`${back}?err=${q("Le message est vide.")}`);
  const c = await threadContext(db, threadId);
  if (!c) redirect(`/comms?err=${q("Fil introuvable.")}`);
  const now = new Date().toISOString();

  if (c.thread.channel === "internal") {
    const { error } = await db.from("messages").insert({ org_id: ctx.org.id, thread_id: threadId, direction: "internal", author: ctx.full_name, body, sent_at: now });
    if (error) redirect(`${back}?err=${q(error.message)}`);
    await db.from("threads").update({ last_message_at: now, read_at: now }).eq("id", threadId);
    // On prévient l'autre personne du fil.
    const other = [c.author?.id, c.assigned?.id].find((id) => id && id !== ctx.employee_id);
    if (other) await db.rpc("notify_employee", { p_employee: other, p_title: `${ctx.full_name} vous a répondu`, p_body: c.thread.subject, p_link: back });
    redirect(`${back}?ok=${q("Message envoyé.")}`);
  }

  const docIds = form.getAll("attach").map(String);
  const { data: docs } = docIds.length ? await db.from("documents").select("id, name").in("id", docIds) : { data: [] };
  const provider = getMailProvider(db, ctx.org.id);
  const res = await provider.send({
    to: c.to,
    subject: str(form.get("subject")) ?? c.thread.subject,
    body,
    threadId,
    clientId: c.thread.client_id,
    supplierId: c.thread.supplier_id,
    workOrderId: c.thread.work_order_id,
    author: ctx.full_name,
    attachments: (docs ?? []).map((d) => ({ name: d.name, url: `/comms/documents/${d.id}/download` })),
  });
  if (!res.ok) redirect(`${back}?err=${q(res.reason ?? "Envoi impossible.")}`);
  await db.from("messages").delete().eq("thread_id", threadId).is("sent_at", null);
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "message.sent", entity_type: "thread", entity_id: threadId, actor: ctx.user_id, payload: { subject: c.thread.subject, client: c.client?.name ?? c.supplier?.name ?? null } });
  redirect(`${back}?ok=${q(provider.simulated ? "Réponse enregistrée (envoi simulé : aucune messagerie connectée)." : "Réponse envoyée.")}`);
}

/** « Classé sans réponse » : le fil sort de la liste « à répondre ». */
export async function archiveThreadAction(form: FormData) {
  const { db } = await guard("comms", "update");
  const id = String(form.get("thread_id"));
  await db.from("threads").update({ read_at: new Date().toISOString() }).eq("id", id);
  await db.from("messages").delete().eq("thread_id", id).is("sent_at", null);
  redirect(`/comms?ok=${q("Fil classé sans réponse.")}`);
}

export async function assignThreadAction(form: FormData) {
  const { ctx, db } = await guard("comms", "update");
  const id = String(form.get("thread_id"));
  const emp = str(form.get("employee_id"));
  await db.from("threads").update({ assigned_employee: emp }).eq("id", id);
  if (emp && emp !== ctx.employee_id) await db.rpc("notify_employee", { p_employee: emp, p_title: `${ctx.full_name} vous a confié un échange`, p_body: str(form.get("subject")) ?? "", p_link: `/comms/threads/${id}` });
  redirect(`/comms/threads/${id}?ok=${q("Responsable du fil mis à jour.")}`);
}

/** Régénère le brouillon préparé à partir du dernier message reçu. */
export async function regenerateDraftAction(form: FormData) {
  const { ctx, db } = await guard("comms", "create");
  const id = String(form.get("thread_id"));
  const { data: last } = await db.from("messages").select("body").eq("thread_id", id).eq("direction", "in").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) redirect(`/comms/threads/${id}?err=${q("Aucun message reçu dans ce fil.")}`);
  await prepareDraft(db, ctx.org.id, id, last.body, ctx.full_name);
  redirect(`/comms/threads/${id}?ok=${q("Brouillon préparé à partir du dernier message reçu.")}`);
}

const SIMULATED_INBOUND = [
  "Bonjour, pouvez-vous nous confirmer la date de livraison ? Nous devons planifier la réception.",
  "Bonjour, avez-vous bien reçu notre virement pour la dernière facture ?",
  "Bonjour, pourriez-vous nous transmettre le certificat matière et la traçabilité du lot ?",
  "Bonjour, pouvez-vous nous faire une offre pour une seconde série identique ?",
];

/**
 * Démo sans messagerie connectée : simule la réponse de l'interlocuteur. Le message arrive dans
 * la boîte, un brouillon est préparé et la Map affiche l'événement.
 */
export async function simulateInboundAction(form: FormData) {
  const { ctx, db } = await guard("comms", "create");
  if (sectorConfig.integrations.mode !== "simulated") redirect("/comms");
  const id = String(form.get("thread_id"));
  const c = await threadContext(db, id);
  if (!c || c.thread.channel === "internal") redirect(`/comms?err=${q("Fil introuvable.")}`);
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("thread_id", id).eq("direction", "in");
  const body = SIMULATED_INBOUND[(count ?? 0) % SIMULATED_INBOUND.length];
  const author = c.contact ? `${c.contact.first_name} ${c.contact.last_name} (${c.client?.name})` : (c.supplier?.name ?? c.client?.name ?? "Interlocuteur");
  const now = new Date().toISOString();
  await db.from("messages").insert({ org_id: ctx.org.id, thread_id: id, direction: "in", author, body, sent_at: now });
  await db.from("threads").update({ last_message_at: now, read_at: null }).eq("id", id);
  const owner = c.assigned ? `${c.assigned.first_name} ${c.assigned.last_name}` : ctx.full_name;
  await prepareDraft(db, ctx.org.id, id, body, owner);
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "message.received", entity_type: "thread", entity_id: id, actor: ctx.user_id, payload: { client: c.client?.name ?? c.supplier?.name, subject: c.thread.subject } });
  if (c.assigned && c.assigned.id !== ctx.employee_id) await db.rpc("notify_employee", { p_employee: c.assigned.id, p_title: `Nouveau message de ${author}`, p_body: c.thread.subject, p_link: `/comms/threads/${id}` });
  redirect(`/comms/threads/${id}?ok=${q("Message entrant simulé : un brouillon de réponse est prêt.")}`);
}

/** Nouveau fil : e-mail à un client ou un fournisseur, ou message interne à un collègue sur un dossier. */
export async function newThreadAction(form: FormData) {
  const { ctx, db } = await guard("comms", "create");
  const kind = String(form.get("kind"));
  const subject = str(form.get("subject"));
  const body = str(form.get("body"));
  const workOrderId = str(form.get("work_order_id"));
  const back = `/comms/new?kind=${kind}`;
  if (!subject || !body) redirect(`${back}&err=${q("Sujet et message obligatoires.")}`);

  if (kind === "internal") {
    const to = str(form.get("employee_id"));
    if (!to) redirect(`${back}&err=${q("Choisissez un destinataire.")}`);
    const { data: wo } = workOrderId ? await db.from("work_orders").select("client_id").eq("id", workOrderId).maybeSingle() : { data: null };
    const now = new Date().toISOString();
    const { data: th, error } = await db
      .from("threads")
      .insert({ org_id: ctx.org.id, subject, channel: "internal", work_order_id: workOrderId, client_id: wo?.client_id ?? null, created_by_employee: ctx.employee_id, assigned_employee: to, last_message_at: now })
      .select("id")
      .single();
    if (error) redirect(`${back}&err=${q(error.message)}`);
    await db.from("messages").insert({ org_id: ctx.org.id, thread_id: th.id, direction: "internal", author: ctx.full_name, body, sent_at: now });
    await db.rpc("notify_employee", { p_employee: to, p_title: `${ctx.full_name} vous a écrit`, p_body: subject, p_link: `/comms/threads/${th.id}` });
    redirect(`/comms/threads/${th.id}?ok=${q("Message interne envoyé, votre collègue est notifié·e.")}`);
  }

  const clientId = kind === "client" ? str(form.get("client_id")) : null;
  const supplierId = kind === "supplier" ? str(form.get("supplier_id")) : null;
  if (!clientId && !supplierId) redirect(`${back}&err=${q("Choisissez un destinataire.")}`);
  let to: string | null = null;
  if (clientId) {
    const { data: ct } = await db.from("contacts").select("email").eq("client_id", clientId).order("is_primary", { ascending: false }).limit(1).maybeSingle();
    to = ct?.email ?? null;
  } else {
    const { data: s } = await db.from("suppliers").select("email").eq("id", supplierId!).maybeSingle();
    to = s?.email ?? null;
  }
  const provider = getMailProvider(db, ctx.org.id);
  const res = await provider.send({ to, subject, body, clientId, supplierId, workOrderId, author: ctx.full_name });
  if (!res.ok || !res.threadId) redirect(`${back}&err=${q(res.reason ?? "Envoi impossible.")}`);
  await db.from("threads").update({ assigned_employee: ctx.employee_id, work_order_id: workOrderId }).eq("id", res.threadId);
  redirect(`/comms/threads/${res.threadId}?ok=${q(provider.simulated ? "Message enregistré (envoi simulé)." : "Message envoyé.")}`);
}

// --- Documents ----------------------------------------------------------

const ENTITY_TYPES = ["client", "work_order", "supplier", "employee", "org"];
const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);

/** Dépôt dans le stockage privé : <org>/<type>/<uuid>-<nom>. La RLS du bucket vérifie l'organisation. */
export async function uploadDocumentAction(form: FormData) {
  const { ctx, db } = await guard("comms", "create");
  const back = str(form.get("back")) ?? "/comms/documents";
  const sep = back.includes("?") ? "&" : "?";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`${back}${sep}err=${q("Choisissez un fichier.")}`);
  if (file.size > 20 * 1024 * 1024) redirect(`${back}${sep}err=${q("Fichier trop volumineux (20 Mo maximum).")}`);
  const [type, id] = (str(form.get("entity")) ?? "org:").split(":");
  const entityType = ENTITY_TYPES.includes(type) ? type : "org";
  const path = `${ctx.org.id}/${entityType}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) redirect(`${back}${sep}err=${q(`Dépôt impossible : ${error.message}`)}`);
  // Nouvelle version si un document du même nom existe déjà sur la même fiche.
  const { data: prev } = await db.from("documents").select("version").eq("name", file.name).eq("entity_type", entityType).order("version", { ascending: false }).limit(1).maybeSingle();
  const { error: e2 } = await db.from("documents").insert({ org_id: ctx.org.id, entity_type: entityType, entity_id: id || null, name: file.name, storage_path: path, mime: file.type || null, size_bytes: file.size, uploaded_by: ctx.full_name, version: (prev?.version ?? 0) + 1 });
  if (e2) {
    await db.storage.from("documents").remove([path]);
    redirect(`${back}${sep}err=${q(e2.message)}`);
  }
  revalidatePath("/comms/documents");
  redirect(`${back}${sep}ok=${q(`« ${file.name} » déposé${prev ? ` (version ${prev.version + 1})` : ""}.`)}`);
}

export async function deleteDocumentAction(form: FormData) {
  const { db } = await guard("comms", "delete");
  const id = String(form.get("document_id"));
  const { data: doc } = await db.from("documents").select("storage_path, name").eq("id", id).maybeSingle();
  if (doc) {
    await db.storage.from("documents").remove([doc.storage_path]);
    await db.from("documents").delete().eq("id", id);
  }
  redirect(`${str(form.get("back")) ?? "/comms/documents"}?ok=${q(`Document supprimé.`)}`);
}
