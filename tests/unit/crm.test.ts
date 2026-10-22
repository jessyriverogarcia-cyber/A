import { describe, expect, it } from "vitest";
import { followUpEmail, needsFollowUp, quoteEmail } from "@/lib/domain/emails";

const base = { companyName: "Strato Fab", senderName: "Karim Ouali", contactFirstName: "Camille", quoteNumber: "DEV-2026-0042", title: "Carters PA12", totalTtc: "1 200,00 €", validUntil: "20 nov. 2026" };

describe("e-mails pré-remplis", () => {
  it("rédige l'envoi du devis avec le montant et la validité", () => {
    const m = quoteEmail(base);
    expect(m.subject).toBe("Devis DEV-2026-0042 — Carters PA12");
    expect(m.body).toContain("Bonjour Camille,");
    expect(m.body).toContain("1 200,00 € TTC");
    expect(m.body).toContain("20 nov. 2026");
    expect(m.body.trim().endsWith("Strato Fab")).toBe(true);
  });

  it("adapte la relance au niveau", () => {
    expect(followUpEmail({ ...base, level: 1, daysSinceSent: 9 }).body).toContain("il y a 9 jours");
    expect(followUpEmail({ ...base, level: 2, daysSinceSent: 7 }).body).toContain("une nouvelle fois");
    expect(quoteEmail({ ...base, contactFirstName: null }).body.startsWith("Bonjour,")).toBe(true);
  });
});

describe("devis à relancer", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  const q = (sent: string | null, last: string | null = null, followups = 0, status = "sent") => ({ status, sent_at: sent, last_followup_at: last, followups });
  it("relance au bout de 7 jours, puis tous les 7 jours, 3 fois maximum", () => {
    expect(needsFollowUp(q("2026-10-10T10:00:00Z"), now)).toBe(true);
    expect(needsFollowUp(q("2026-10-18T10:00:00Z"), now)).toBe(false);
    expect(needsFollowUp(q("2026-10-01T10:00:00Z", "2026-10-19T10:00:00Z", 1), now)).toBe(false);
    expect(needsFollowUp(q("2026-09-01T10:00:00Z", "2026-10-01T10:00:00Z", 3), now)).toBe(false);
    expect(needsFollowUp(q("2026-10-01T10:00:00Z", null, 0, "accepted"), now)).toBe(false);
  });
});
