/**
 * E-mails entrants : normalisation des messages Microsoft Graph et Gmail, rattachement à un
 * client ou un fournisseur connu, et au bon fil. Fonctions pures, testées.
 */

export interface InboundMail {
  externalId: string;
  from: string; // adresse, en minuscules
  fromName: string | null;
  subject: string;
  text: string;
  receivedAt: string; // ISO
}

/** Message Graph (/me/messages, corps demandé en texte). */
export function fromGraph(m: { id: string; subject?: string | null; receivedDateTime: string; from?: { emailAddress?: { address?: string; name?: string } }; body?: { content?: string }; bodyPreview?: string }): InboundMail | null {
  const addr = m.from?.emailAddress?.address?.toLowerCase();
  if (!addr) return null;
  return { externalId: `ms:${m.id}`, from: addr, fromName: m.from?.emailAddress?.name ?? null, subject: m.subject ?? "(sans objet)", text: cleanBody(m.body?.content ?? m.bodyPreview ?? ""), receivedAt: new Date(m.receivedDateTime).toISOString() };
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function textPart(p: GmailPart): string | null {
  if (p.mimeType === "text/plain" && p.body?.data) return b64url(p.body.data);
  for (const c of p.parts ?? []) {
    const t = textPart(c);
    if (t) return t;
  }
  return null;
}

/** Message Gmail (users.messages.get, format « full »). */
export function fromGmail(m: { id: string; internalDate: string; snippet?: string; payload: GmailPart & { headers?: { name: string; value: string }[] } }): InboundMail | null {
  const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
  const from = h("from");
  const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  if (!addr.includes("@")) return null;
  const name = from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? null;
  return { externalId: `gm:${m.id}`, from: addr, fromName: name, subject: h("subject") || "(sans objet)", text: cleanBody(textPart(m.payload) ?? m.snippet ?? ""), receivedAt: new Date(Number(m.internalDate)).toISOString() };
}

/** Retire la citation du message précédent et les signatures longues. */
export function cleanBody(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l) => /^\s*>/.test(l) || /^(Le .+ a écrit|On .+ wrote)\s*:?\s*$/i.test(l.trim()) || /^-{2,}\s*(Original Message|Message d'origine)/i.test(l.trim()) || /^(De|From)\s*:/.test(l.trim()));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim().slice(0, 8000);
}

/** Sujet de fil : sans « Re : », « TR : », « Fwd: »… pour retrouver la conversation. */
export const threadSubject = (s: string) => s.replace(/^\s*((re|tr|fw|fwd|réf)\s*:\s*)+/i, "").trim();

/** Expéditeur connu : contact d'un client, ou adresse d'un fournisseur. Les inconnus sont ignorés. */
export function matchSender(from: string, contacts: { email: string | null; client_id: string; first_name?: string; last_name?: string }[], suppliers: { id: string; email: string | null }[]) {
  const c = contacts.find((x) => x.email?.toLowerCase() === from);
  if (c) return { kind: "client" as const, clientId: c.client_id, supplierId: null };
  const s = suppliers.find((x) => x.email?.toLowerCase() === from);
  if (s) return { kind: "supplier" as const, clientId: null, supplierId: s.id };
  return null;
}
