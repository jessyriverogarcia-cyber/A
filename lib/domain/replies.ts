/**
 * Brouillons de réponse préparés à partir du message reçu et du dossier lié (OF, facture, devis).
 * Règles simples et explicables — l'assistant IA (phase 4) pourra les remplacer. Fonctions pures, testées.
 */

export type ReplyIntent = "delay" | "invoice" | "quote" | "technical" | "thanks" | "other";

const KEYWORDS: [ReplyIntent, RegExp][] = [
  ["invoice", /\b(factur\w*|paiement|r[èe]glement|virement|avoir|relance)\b/i],
  ["quote", /\b(devis|offre|tarif\w*|prix|chiffrage|cotation)\b/i],
  ["delay", /\b(d[ée]lai\w*|livraison|livr\w*|date|quand|planning|exp[ée]di\w*|avancement|retard)\b/i],
  ["technical", /\b(mati[èe]re|tol[ée]ranc\w*|plan|cao|stl|step|certificat\w*|tra[çc]abilit[ée]|rugosit[ée]|cnd)\b/i],
  ["thanks", /^\s*(merci|parfait|bien re[çc]u|super)\b/i],
];

/** Intention principale du message (la première règle qui correspond, par ordre de priorité). */
export function detectIntent(text: string): ReplyIntent {
  for (const [intent, re] of KEYWORDS) if (re.test(text)) return intent;
  return "other";
}

export interface ReplyContext {
  companyName: string;
  senderName: string;
  contactFirstName?: string | null;
  workOrder?: { number: string; stageLabel: string; dueDate: string | null; late: boolean; progress: number } | null;
  invoice?: { number: string; paid: boolean; dueDate: string; balance: string; overdue: boolean } | null;
  quote?: { number: string; status: string; validUntil: string | null } | null;
}

const hello = (first?: string | null) => (first ? `Bonjour ${first},` : "Bonjour,");

function core(intent: ReplyIntent, c: ReplyContext): string[] {
  const wo = c.workOrder;
  switch (intent) {
    case "delay":
      if (!wo) return ["Merci pour votre message. Je vérifie le planning de production et je reviens vers vous aujourd'hui avec une date ferme."];
      return [
        `Votre dossier ${wo.number} est actuellement à l'étape « ${wo.stageLabel} » (avancement ${wo.progress} %).`,
        wo.dueDate
          ? wo.late
            ? `La date initiale du ${wo.dueDate} ne pourra pas être tenue : je reviens vers vous aujourd'hui avec une nouvelle date ferme et la cause du décalage.`
            : `La livraison reste prévue le ${wo.dueDate}. Je vous préviens dès l'expédition, avec le numéro de suivi.`
          : "Je vous confirme la date de livraison dès la fin de l'étape en cours.",
      ];
    case "invoice": {
      const inv = c.invoice;
      if (!inv) return ["Merci pour votre message. Je transmets votre demande à notre service comptable, qui vous répond sous 24 h."];
      if (inv.paid) return [`Nous avons bien reçu le règlement de la facture ${inv.number}, merci. Elle est soldée de notre côté.`];
      return [
        `La facture ${inv.number} présente un solde de ${inv.balance}, ${inv.overdue ? `échu depuis le ${inv.dueDate}` : `à régler avant le ${inv.dueDate}`}.`,
        "Vous trouverez nos coordonnées bancaires en pied de facture. Je peux vous la renvoyer si besoin.",
      ];
    }
    case "quote": {
      const q = c.quote;
      if (!q) return ["Merci pour votre demande. Pouvez-vous nous transmettre les fichiers CAO (STEP ou STL), les quantités et la matière souhaitée ? Nous vous adressons un devis sous 48 h."];
      if (q.status === "accepted") return [`Le devis ${q.number} est validé et la production est lancée. Je vous tiens informé·e de l'avancement.`];
      return [
        `Notre devis ${q.number} est toujours d'actualité${q.validUntil ? ` (valable jusqu'au ${q.validUntil})` : ""}.`,
        "Je peux l'ajuster (quantités, délai, matière) : dites-moi ce qui vous conviendrait le mieux.",
      ];
    }
    case "technical":
      return [
        "Merci pour votre question. Je la transmets à notre bureau d'études, qui vous répond avec les éléments techniques (matière, tolérances, certificats de traçabilité).",
        wo ? `Elle est rattachée au dossier ${wo.number}.` : "",
      ].filter(Boolean);
    case "thanks":
      return ["Merci pour votre retour. N'hésitez pas à revenir vers nous pour la suite."];
    default:
      return ["Merci pour votre message, je m'en occupe et reviens vers vous rapidement."];
  }
}

/** Brouillon de réponse complet (salutation, corps, signature), prêt à relire. */
export function suggestReply(inbound: string, c: ReplyContext): { intent: ReplyIntent; body: string } {
  const intent = detectIntent(inbound);
  return {
    intent,
    body: [hello(c.contactFirstName), "", ...core(intent, c), "", "Bien cordialement,", c.senderName, c.companyName].join("\n"),
  };
}

/** Un fil est « à répondre » si son dernier message est entrant et n'a pas été lu depuis. */
export function needsReply(t: { last_direction: string | null; last_inbound_at: string | null; read_at: string | null }) {
  return t.last_direction === "in" && !!t.last_inbound_at && (!t.read_at || t.read_at < t.last_inbound_at);
}

/** Sujet de réponse : « Re : » ajouté une seule fois. */
export const replySubject = (subject: string) => (/^re\s*:/i.test(subject) ? subject : `Re : ${subject}`);
