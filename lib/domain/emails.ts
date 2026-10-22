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

export interface InvoiceMailInput {
  companyName: string;
  senderName: string;
  contactFirstName?: string | null;
  invoiceNumber: string;
  totalTtc: string;
  remaining: string;
  dueDate: string;
  iban?: string;
}

export function invoiceEmail(i: InvoiceMailInput) {
  return {
    subject: `Facture ${i.invoiceNumber}`,
    body: [
      hello(i.contactFirstName),
      "",
      `Veuillez trouver ci-joint notre facture ${i.invoiceNumber} d'un montant de ${i.totalTtc} TTC, payable au plus tard le ${i.dueDate}.`,
      i.iban ? `Règlement par virement : IBAN ${i.iban}, en rappelant la référence ${i.invoiceNumber}.` : "",
      "",
      "Merci pour votre confiance.",
      "",
      "Bien cordialement,",
      i.senderName,
      i.companyName,
    ]
      .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))
      .join("\n"),
  };
}

/** Relance de paiement : ton adapté au niveau (1 courtois, 2 ferme, 3 mise en demeure). */
export function dunningEmail(i: InvoiceMailInput & { level: 1 | 2 | 3; daysLate: number }) {
  const subjects = { 1: `Rappel — facture ${i.invoiceNumber}`, 2: `Relance — facture ${i.invoiceNumber} impayée`, 3: `Mise en demeure — facture ${i.invoiceNumber}` };
  const bodies = {
    1: [
      `Sauf erreur de notre part, la facture ${i.invoiceNumber} arrivée à échéance le ${i.dueDate} reste à régler (${i.remaining}).`,
      "Il s'agit peut-être d'un simple oubli : pourriez-vous nous indiquer la date de règlement prévue ?",
    ],
    2: [
      `Malgré notre précédent rappel, la facture ${i.invoiceNumber} (échéance ${i.dueDate}) reste impayée depuis ${i.daysLate} jours. Montant restant dû : ${i.remaining}.`,
      "Nous vous remercions de procéder au règlement sous 8 jours.",
    ],
    3: [
      `Malgré nos relances, la facture ${i.invoiceNumber} d'un montant restant dû de ${i.remaining}, échue le ${i.dueDate}, n'a pas été réglée.`,
      "Par la présente, nous vous mettons en demeure de procéder au paiement sous 8 jours. À défaut, des pénalités de retard ainsi que l'indemnité forfaitaire de 40 € pour frais de recouvrement seront appliquées, et nous nous réservons le droit d'engager une procédure de recouvrement.",
    ],
  };
  return {
    subject: subjects[i.level],
    body: [hello(i.contactFirstName), "", ...bodies[i.level], i.iban ? `IBAN : ${i.iban}` : "", "", "Bien cordialement,", i.senderName, i.companyName].join("\n"),
  };
}

export function purchaseOrderEmail(i: { companyName: string; senderName: string; supplierName: string; number: string; lines: { label: string; qty: number; unit: string }[]; expectedOn: string; deliveryAddress: string }) {
  return {
    subject: `Bon de commande ${i.number} — ${i.companyName}`,
    body: [
      "Bonjour,",
      "",
      `Merci de bien vouloir nous livrer la commande ${i.number} :`,
      ...i.lines.map((l) => `  • ${l.label} : ${l.qty} ${l.unit}`),
      "",
      `Livraison souhaitée au plus tard le ${i.expectedOn}, à l'adresse : ${i.deliveryAddress}.`,
      "Merci de nous confirmer le délai et de joindre les certificats matière (traçabilité).",
      "",
      "Bien cordialement,",
      i.senderName,
      i.companyName,
    ].join("\n"),
  };
}
