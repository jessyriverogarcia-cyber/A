/**
 * Brouillons d'e-mails pré-remplis (on relit plutôt qu'on écrit). Fonctions pures, testées.
 */

export interface QuoteMailInput {
  companyName: string;
  senderName: string;
  contactFirstName?: string | null;
  quoteNumber: string;
  title: string;
  totalTtc: string;
  validUntil: string;
}

const hello = (first?: string | null) => (first ? `Bonjour ${first},` : "Bonjour,");

export function quoteEmail(i: QuoteMailInput) {
  return {
    subject: `Devis ${i.quoteNumber} — ${i.title}`,
    body: [
      hello(i.contactFirstName),
      "",
      `Suite à nos échanges, vous trouverez ci-joint notre devis ${i.quoteNumber} pour « ${i.title} », d'un montant de ${i.totalTtc} TTC.`,
      `Il est valable jusqu'au ${i.validUntil}.`,
      "",
      "Je reste à votre disposition pour toute question technique (matière, tolérances, traçabilité) ou pour ajuster le planning.",
      "",
      "Bien cordialement,",
      i.senderName,
      i.companyName,
    ].join("\n"),
  };
}

export function followUpEmail(i: QuoteMailInput & { level: number; daysSinceSent: number }) {
  const opening =
    i.level <= 1
      ? `Je reviens vers vous au sujet de notre devis ${i.quoteNumber} (« ${i.title} ») envoyé il y a ${i.daysSinceSent} jours.`
      : `Je me permets de vous relancer une nouvelle fois concernant notre devis ${i.quoteNumber} (« ${i.title} »).`;
  return {
    subject: `Relance — devis ${i.quoteNumber}`,
    body: [
      hello(i.contactFirstName),
      "",
      opening,
      `Il reste valable jusqu'au ${i.validUntil}. Souhaitez-vous que nous en parlions ou que nous l'adaptions (quantités, délais, matière) ?`,
      "",
      "Bien cordialement,",
      i.senderName,
      i.companyName,
    ].join("\n"),
  };
}

/** Un devis envoyé est « à relancer » au bout de 7 jours, puis tous les 7 jours, 3 fois maximum. */
export function needsFollowUp(q: { status: string; sent_at: string | null; last_followup_at: string | null; followups: number }, now = new Date()) {
  if (q.status !== "sent" || !q.sent_at || q.followups >= 3) return false;
  const last = new Date(q.last_followup_at ?? q.sent_at);
  return now.getTime() - last.getTime() >= 7 * 86_400_000;
}

export const daysBetween = (from: string | Date, to: Date = new Date()) =>
  Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
