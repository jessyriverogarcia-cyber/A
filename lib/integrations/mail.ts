import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { configured, PROVIDERS, refresh, type ProviderId, type Tokens } from "./oauth";
import { open, seal } from "./crypto";
import { base64url, buildMime } from "./mime";

type Db = SupabaseClient<Database>;

export interface Attachment {
  name: string;
  /** Lien de consultation dans l'application (rangé dans l'historique). */
  url: string;
  /** Contenu réel, chargé seulement quand un vrai fournisseur envoie le message. */
  load?: () => Promise<{ data: Buffer; mime: string } | null>;
}

export interface OutgoingMail {
  to: string | null;
  subject: string;
  body: string;
  clientId?: string | null;
  supplierId?: string | null;
  workOrderId?: string | null;
  /** Réponse dans un fil existant (sinon le fil est retrouvé par sujet + client/fournisseur). */
  threadId?: string | null;
  author: string;
  attachments?: Attachment[];
}

export interface MailResult {
  ok: boolean;
  simulated: boolean;
  threadId?: string;
  reason?: string;
}

/** Interface commune : Microsoft 365, Google Workspace ou simulation. */
export interface MailProvider {
  readonly name: string;
  readonly simulated: boolean;
  send(mail: OutgoingMail): Promise<MailResult>;
}

/** Range le message envoyé dans le fil de l'interlocuteur (le créé au besoin). */
async function archive(db: Db, orgId: string, mail: OutgoingMail, via: string): Promise<MailResult & { ok: boolean }> {
  const now = new Date().toISOString();
  let threadId = mail.threadId ?? undefined;
  if (!threadId) {
    let find = db.from("threads").select("id").eq("subject", mail.subject.replace(/^Relance — /, ""));
    find = mail.clientId ? find.eq("client_id", mail.clientId) : find.eq("supplier_id", mail.supplierId ?? "00000000-0000-0000-0000-000000000000");
    const { data: existing } = await find.limit(1).maybeSingle();
    threadId = existing?.id;
  }
  if (!threadId) {
    const { data, error } = await db
      .from("threads")
      .insert({ org_id: orgId, subject: mail.subject, channel: "email", client_id: mail.clientId ?? null, supplier_id: mail.supplierId ?? null, work_order_id: mail.workOrderId ?? null, last_message_at: now })
      .select("id")
      .single();
    if (error) return { ok: false, simulated: true, reason: error.message };
    threadId = data.id;
  }
  // Répondre clôt le « à répondre » du fil.
  await db.from("threads").update({ last_message_at: now, read_at: now }).eq("id", threadId);
  const attach = mail.attachments?.length ? `\n\n[Pièces jointes : ${mail.attachments.map((a) => a.name).join(", ")}]` : "";
  const { error } = await db.from("messages").insert({
    org_id: orgId,
    thread_id: threadId,
    direction: "out",
    author: via ? `${mail.author} (${via})` : mail.author,
    body: `À : ${mail.to ?? "(contact manquant)"}\nObjet : ${mail.subject}\n\n${mail.body}${attach}`,
    sent_at: now,
  });
  if (error) return { ok: false, simulated: true, reason: error.message };
  return { ok: true, simulated: true, threadId };
}

/**
 * Fournisseur simulé (aucun compte connecté) : rien ne part réellement, le message est rangé
 * dans le fil de conversation, marqué comme envoyé, pour garder l'historique.
 */
export class MockMailProvider implements MailProvider {
  readonly name = "Simulation";
  readonly simulated = true;
  constructor(
    private db: Db,
    private orgId: string,
  ) {}
  send(mail: OutgoingMail) {
    return archive(this.db, this.orgId, mail, "");
  }
}

/** Envoi réel par Microsoft Graph ou l'API Gmail, avec la boîte connectée de l'organisation. */
export class OAuthMailProvider implements MailProvider {
  readonly simulated = false;
  readonly name: string;
  constructor(
    private db: Db,
    private orgId: string,
    private provider: ProviderId,
    private account: string,
  ) {
    this.name = PROVIDERS[provider].label;
  }

  private async token(): Promise<string> {
    const { data: sealed, error } = await this.db.rpc("integration_secret", { p_provider: this.provider });
    if (error || !sealed) throw new Error("Boîte d'envoi non accessible avec vos droits.");
    let t = open<Tokens>(sealed);
    if (t.expires_at - 60_000 < Date.now()) {
      if (!t.refresh_token) throw new Error("Connexion expirée : reconnectez la boîte d'envoi.");
      t = await refresh(this.provider, t.refresh_token);
      await this.db.rpc("touch_integration", { p_provider: this.provider, p_ciphertext: seal(t), p_error: null as unknown as string });
    }
    return t.access_token;
  }

  async send(mail: OutgoingMail): Promise<MailResult> {
    if (!mail.to) return { ok: false, simulated: false, reason: "Aucune adresse e-mail pour ce contact." };
    try {
      const token = await this.token();
      const files = (await Promise.all((mail.attachments ?? []).map(async (a) => (a.load ? { name: a.name, ...(await a.load()) } : null)))).filter((f): f is { name: string; data: Buffer; mime: string } => !!f?.data);
      const res =
        this.provider === "microsoft"
          ? await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: {
                  subject: mail.subject,
                  body: { contentType: "Text", content: mail.body },
                  toRecipients: [{ emailAddress: { address: mail.to } }],
                  attachments: files.map((f) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.name, contentType: f.mime, contentBytes: f.data.toString("base64") })),
                },
                saveToSentItems: true,
              }),
            })
          : await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: base64url(buildMime({ from: this.account, to: mail.to, subject: mail.subject, body: mail.body, attachments: files.map((f) => ({ name: f.name, mime: f.mime, data: f.data })) })) }),
            });
      if (!res.ok) throw new Error(`${this.name} : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      await this.db.rpc("touch_integration", { p_provider: this.provider, p_ciphertext: null as unknown as string, p_error: null as unknown as string });
      const archived = await archive(this.db, this.orgId, mail, this.account);
      return { ...archived, simulated: false };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Envoi impossible";
      await this.db.rpc("touch_integration", { p_provider: this.provider, p_ciphertext: null as unknown as string, p_error: reason });
      return { ok: false, simulated: false, reason };
    }
  }
}

/** Boîte d'envoi active : un compte connecté (et configuré côté serveur), sinon la simulation. */
export const mailMode = cache(async (db: Db): Promise<{ simulated: boolean; provider: ProviderId | null; account: string | null; label: string }> => {
  const { data } = await db.from("integration_accounts").select("provider, account_email").order("connected_at", { ascending: false });
  const row = (data ?? []).find((r) => configured(r.provider as ProviderId));
  if (!row) return { simulated: true, provider: null, account: null, label: "Simulation" };
  return { simulated: false, provider: row.provider as ProviderId, account: row.account_email, label: PROVIDERS[row.provider as ProviderId].label };
});

export async function getMailProvider(db: Db, orgId: string): Promise<MailProvider> {
  const m = await mailMode(db);
  return m.provider ? new OAuthMailProvider(db, orgId, m.provider, m.account!) : new MockMailProvider(db, orgId);
}
