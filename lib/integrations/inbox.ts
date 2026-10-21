import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fromGmail, fromGraph, matchSender, threadSubject, type InboundMail } from "@/lib/domain/inbound";
import { prepareDraft } from "@/lib/services/comms";
import { configured, refresh, type ProviderId, type Tokens } from "./oauth";
import { open, seal } from "./crypto";

type Db = SupabaseClient<Database>;

/** Jeton de la boîte (lecture directe : appelé côté serveur avec la clé service, org vérifiée). */
async function token(admin: Db, orgId: string, provider: ProviderId) {
  const { data } = await admin.from("integration_accounts").select("token_ciphertext").eq("org_id", orgId).eq("provider", provider).single();
  let t = open<Tokens>(data!.token_ciphertext);
  if (t.expires_at - 60_000 < Date.now()) {
    if (!t.refresh_token) throw new Error("Connexion expirée : reconnectez la boîte.");
    t = await refresh(provider, t.refresh_token);
    await admin.from("integration_accounts").update({ token_ciphertext: seal(t) }).eq("org_id", orgId).eq("provider", provider);
  }
  return t.access_token;
}

/** Messages reçus depuis le curseur (50 au plus par relève). */
export async function fetchInbound(provider: ProviderId, accessToken: string, since: Date): Promise<InboundMail[]> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  if (provider === "microsoft") {
    // OData : espaces encodés en %20 (URLSearchParams mettrait des « + », mal lus par Graph)
    const q = Object.entries({ $filter: `receivedDateTime ge ${since.toISOString()}`, $orderby: "receivedDateTime", $top: "50", $select: "id,subject,from,receivedDateTime,body,bodyPreview" })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const r = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${q}`, { headers: { ...auth, Prefer: 'outlook.body-content-type="text"' } });
    if (!r.ok) throw new Error(`Microsoft Graph : HTTP ${r.status}`);
    const j = (await r.json()) as { value: Parameters<typeof fromGraph>[0][] };
    return j.value.map(fromGraph).filter((m): m is InboundMail => !!m);
  }
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: `in:inbox after:${Math.floor(since.getTime() / 1000)}`, maxResults: "50" })}`, { headers: auth });
  if (!list.ok) throw new Error(`Gmail : HTTP ${list.status}`);
  const ids = (((await list.json()) as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id);
  const full = await Promise.all(ids.map(async (id) => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: auth });
    return r.ok ? fromGmail((await r.json()) as Parameters<typeof fromGmail>[0]) : null;
  }));
  return full.filter((m): m is InboundMail => !!m).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/**
 * Relève la boîte connectée de l'organisation : seuls les messages de contacts clients ou de
 * fournisseurs connus sont rangés (fil existant ou nouveau), avec un brouillon de réponse préparé
 * et le responsable du fil notifié. Idempotent (identifiant du message chez le fournisseur).
 */
export async function syncInbox(admin: Db, orgId: string): Promise<{ provider: ProviderId | null; fetched: number; stored: number; ignored: number }> {
  const { data: acc } = await admin.from("integration_accounts").select("provider, account_email, connected_at, inbox_synced_at").eq("org_id", orgId).order("connected_at", { ascending: false });
  const account = (acc ?? []).find((a) => configured(a.provider as ProviderId));
  if (!account) return { provider: null, fetched: 0, stored: 0, ignored: 0 };
  const provider = account.provider as ProviderId;
  const since = new Date(account.inbox_synced_at ?? account.connected_at);
  const mails = await fetchInbound(provider, await token(admin, orgId, provider), since);
  const [{ data: contacts }, { data: suppliers }, { data: orgRow }] = await Promise.all([
    admin.from("contacts").select("email, client_id, first_name, last_name").eq("org_id", orgId),
    admin.from("suppliers").select("id, email").eq("org_id", orgId),
    admin.from("orgs").select("name").eq("id", orgId).single(),
  ]);
  let stored = 0;
  let ignored = 0;
  let cursor = since;
  for (const m of mails) {
    if (new Date(m.receivedAt) > cursor) cursor = new Date(m.receivedAt);
    if (m.from === account.account_email.toLowerCase()) continue; // nos propres envois
    const who = matchSender(m.from, (contacts ?? []) as { email: string | null; client_id: string }[], suppliers ?? []);
    if (!who) {
      ignored++;
      continue;
    }
    const { data: dup } = await admin.from("messages").select("id").eq("org_id", orgId).eq("external_id", m.externalId).maybeSingle();
    if (dup) continue;

    const subject = threadSubject(m.subject);
    let q = admin.from("threads").select("id, subject, assigned_employee").eq("org_id", orgId).neq("channel", "internal");
    q = who.clientId ? q.eq("client_id", who.clientId) : q.eq("supplier_id", who.supplierId!);
    const { data: candidates } = await q.order("last_message_at", { ascending: false }).limit(50);
    let thread = (candidates ?? []).find((t) => threadSubject(t.subject) === subject) ?? null;
    if (!thread) {
      const owner = who.clientId ? (await admin.from("clients").select("owner_employee_id").eq("id", who.clientId).single()).data?.owner_employee_id ?? null : null;
      const { data: created, error } = await admin.from("threads").insert({ org_id: orgId, subject, channel: "email", client_id: who.clientId, supplier_id: who.supplierId, assigned_employee: owner, last_message_at: m.receivedAt }).select("id, subject, assigned_employee").single();
      if (error) throw new Error(error.message);
      thread = created;
    }
    const { error: e2 } = await admin.from("messages").insert({ org_id: orgId, thread_id: thread.id, direction: "in", author: m.fromName ? `${m.fromName} <${m.from}>` : m.from, body: m.text, sent_at: m.receivedAt, external_id: m.externalId });
    if (e2) continue; // course avec une autre relève : déjà rangé
    await admin.from("threads").update({ last_message_at: m.receivedAt, read_at: null }).eq("id", thread.id);
    let ownerName = orgRow?.name ?? "";
    if (thread.assigned_employee) {
      const { data: e } = await admin.from("employees").select("first_name, last_name").eq("id", thread.assigned_employee).single();
      if (e) ownerName = `${e.first_name} ${e.last_name}`;
      const { data: prof } = await admin.from("profiles").select("user_id").eq("employee_id", thread.assigned_employee).maybeSingle();
      if (prof) await admin.from("notifications").insert({ org_id: orgId, user_id: prof.user_id, title: `Nouveau message de ${m.fromName ?? m.from}`, body: subject, link: `/comms/threads/${thread.id}` });
    }
    await prepareDraft(admin, orgId, thread.id, m.text, ownerName);
    await admin.from("activity_events").insert({ org_id: orgId, type: "message.received", entity_type: "thread", entity_id: thread.id, payload: { subject, from: m.from } });
    stored++;
  }
  await admin.from("integration_accounts").update({ inbox_synced_at: cursor.toISOString() }).eq("org_id", orgId).eq("provider", provider);
  return { provider, fetched: mails.length, stored, ignored };
}
