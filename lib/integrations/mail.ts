import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface OutgoingMail {
  to: string | null;
  subject: string;
  body: string;
  clientId: string;
  workOrderId?: string | null;
  author: string;
  attachments?: { name: string; url: string }[];
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

/**
 * Fournisseur simulé (aucun compte connecté) : rien ne part réellement, le message est rangé
 * dans le fil de conversation du client, marqué comme envoyé, pour garder l'historique.
 */
export class MockMailProvider implements MailProvider {
  readonly name = "Simulation";
  readonly simulated = true;
  constructor(
    private db: SupabaseClient<Database>,
    private orgId: string,
  ) {}

  async send(mail: OutgoingMail): Promise<MailResult> {
    const now = new Date().toISOString();
    const { data: existing } = await this.db
      .from("threads")
      .select("id")
      .eq("client_id", mail.clientId)
      .eq("subject", mail.subject.replace(/^Relance — /, ""))
      .limit(1)
      .maybeSingle();
    let threadId = existing?.id;
    if (!threadId) {
      const { data, error } = await this.db
        .from("threads")
        .insert({ org_id: this.orgId, subject: mail.subject, channel: "email", client_id: mail.clientId, work_order_id: mail.workOrderId ?? null, last_message_at: now })
        .select("id")
        .single();
      if (error) return { ok: false, simulated: true, reason: error.message };
      threadId = data.id;
    } else {
      await this.db.from("threads").update({ last_message_at: now }).eq("id", threadId);
    }
    const attach = mail.attachments?.length ? `\n\n[Pièces jointes : ${mail.attachments.map((a) => a.name).join(", ")}]` : "";
    const { error } = await this.db.from("messages").insert({
      org_id: this.orgId,
      thread_id: threadId,
      direction: "out",
      author: mail.author,
      body: `À : ${mail.to ?? "(contact manquant)"}\nObjet : ${mail.subject}\n\n${mail.body}${attach}`,
      sent_at: now,
    });
    if (error) return { ok: false, simulated: true, reason: error.message };
    return { ok: true, simulated: true, threadId };
  }
}

export function getMailProvider(db: SupabaseClient<Database>, orgId: string): MailProvider {
  // Phase 4 : Microsoft Graph / Gmail quand un compte est connecté. D'ici là : simulation.
  return new MockMailProvider(db, orgId);
}
