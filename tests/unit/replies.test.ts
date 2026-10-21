import { describe, expect, it } from "vitest";
import { detectIntent, needsReply, replySubject, suggestReply } from "@/lib/domain/replies";

const base = { companyName: "Strato Fab", senderName: "Karim Benali", contactFirstName: "Claire" };

describe("réponses préparées", () => {
  it("détecte l'intention du message", () => {
    expect(detectIntent("Bonjour, pouvez-vous nous confirmer la date de livraison ? Merci.")).toBe("delay");
    expect(detectIntent("Notre comptabilité n'a pas reçu la facture FAC-2026-0012")).toBe("invoice");
    expect(detectIntent("Pourriez-vous nous faire un devis pour 40 pièces ?")).toBe("quote");
    expect(detectIntent("Quelle tolérance tenez-vous sur ce plan ?")).toBe("technical");
    expect(detectIntent("Merci, bien reçu")).toBe("thanks");
    expect(detectIntent("Bonjour")).toBe("other");
  });

  it("répond sur le délai avec l'étape et la date de l'OF", () => {
    const r = suggestReply("Quand sera-t-elle livrée ?", { ...base, workOrder: { number: "OF-2026-0007", stageLabel: "Impression", dueDate: "28 oct. 2026", late: false, progress: 45 } });
    expect(r.intent).toBe("delay");
    expect(r.body).toContain("Bonjour Claire,");
    expect(r.body).toContain("« Impression » (avancement 45 %)");
    expect(r.body).toContain("prévue le 28 oct. 2026");
    expect(r.body.endsWith("Karim Benali\nStrato Fab")).toBe(true);
  });

  it("annonce honnêtement un retard", () => {
    const r = suggestReply("Où en est la livraison ?", { ...base, workOrder: { number: "OF-1", stageLabel: "Contrôle", dueDate: "10 oct. 2026", late: true, progress: 80 } });
    expect(r.body).toContain("ne pourra pas être tenue");
  });

  it("répond sur une facture selon son solde", () => {
    const due = suggestReply("Où en est notre facture ?", { ...base, invoice: { number: "FAC-9", paid: false, dueDate: "1 oct. 2026", balance: "1 200,00 €", overdue: true } });
    expect(due.body).toContain("solde de 1 200,00 €, échu depuis le 1 oct. 2026");
    const paid = suggestReply("Le virement est parti", { ...base, invoice: { number: "FAC-9", paid: true, dueDate: "1 oct. 2026", balance: "0", overdue: false } });
    expect(paid.body).toContain("soldée");
  });

  it("détecte les fils à répondre et préfixe le sujet une seule fois", () => {
    expect(needsReply({ last_direction: "in", last_inbound_at: "2026-10-21T08:00:00Z", read_at: null })).toBe(true);
    expect(needsReply({ last_direction: "in", last_inbound_at: "2026-10-21T08:00:00Z", read_at: "2026-10-21T09:00:00Z" })).toBe(false);
    expect(needsReply({ last_direction: "out", last_inbound_at: "2026-10-21T08:00:00Z", read_at: null })).toBe(false);
    expect(replySubject("OF-1 — Pièce")).toBe("Re : OF-1 — Pièce");
    expect(replySubject("Re : OF-1")).toBe("Re : OF-1");
  });
});
