import { describe, expect, it } from "vitest";
import { averagePaymentDelay, daysOverdue, depositLine, effectiveStatus, finalInvoiceLines, suggestedDunningLevel } from "@/lib/domain/invoice";
import { dunningEmail, invoiceEmail } from "@/lib/domain/emails";

const today = "2026-10-21";

describe("statut des factures", () => {
  const inv = (status: string, due: string, paid: number, total = 1200) => ({ status, due_date: due, paid_amount: paid, total_ttc: total });
  it("calcule retard, partiel et payé", () => {
    expect(effectiveStatus(inv("sent", "2026-10-30", 0), today)).toBe("sent");
    expect(effectiveStatus(inv("sent", "2026-10-01", 0), today)).toBe("overdue");
    expect(effectiveStatus(inv("sent", "2026-10-30", 600), today)).toBe("partially_paid");
    expect(effectiveStatus(inv("overdue", "2026-10-01", 1200), today)).toBe("paid");
    expect(effectiveStatus(inv("draft", "2026-01-01", 0), today)).toBe("draft");
  });
});

describe("relances", () => {
  it("propose le niveau selon le retard, sans sauter de niveau", () => {
    expect(daysOverdue("2026-10-11", today)).toBe(10);
    expect(suggestedDunningLevel(0, 0)).toBeNull();
    expect(suggestedDunningLevel(5, 0)).toBe(1);
    expect(suggestedDunningLevel(40, 0)).toBe(1);
    expect(suggestedDunningLevel(40, 1)).toBe(2);
    expect(suggestedDunningLevel(20, 2)).toBe(2);
    expect(suggestedDunningLevel(40, 2)).toBe(3);
    expect(suggestedDunningLevel(90, 3)).toBeNull();
  });

  it("rédige des relances au ton gradué", () => {
    const base = { companyName: "Strato Fab", senderName: "Marc Lestrade", invoiceNumber: "FAC-2026-0003", totalTtc: "11 760,00 €", remaining: "11 760,00 €", dueDate: "28 sept. 2026", iban: "FR76 0000" };
    expect(dunningEmail({ ...base, level: 1, daysLate: 23 }).body).toContain("simple oubli");
    expect(dunningEmail({ ...base, level: 3, daysLate: 45 }).subject).toBe("Mise en demeure — facture FAC-2026-0003");
    expect(dunningEmail({ ...base, level: 3, daysLate: 45 }).body).toContain("40 €");
    expect(invoiceEmail(base).body).toContain("IBAN FR76 0000");
  });
});

describe("facture depuis le dossier", () => {
  it("reprend le devis et déduit les acomptes", () => {
    const lines = finalInvoiceLines(
      [
        { description: "Impression métal", quantity: 10, unit_price: 260, discount: 0 },
        { description: "Contrôle CND", quantity: 2, unit_price: 380, discount: 0.1 },
      ],
      [{ number: "FAC-2026-0005", amount: 900 }],
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({ description: "Déduction acompte FAC-2026-0005", unit_price: -900 });
  });

  it("calcule l'acompte au centime", () => {
    expect(depositLine("DEV-2026-0001", 1234.57, 0.3)).toMatchObject({ unit_price: 370.37, description: "Acompte 30 % sur devis DEV-2026-0001" });
  });

  it("calcule le délai moyen de paiement", () => {
    expect(averagePaymentDelay([{ issue_date: "2026-09-01", paid_on: "2026-09-21" }, { issue_date: "2026-09-10", paid_on: "2026-10-10" }, { issue_date: "2026-10-01", paid_on: null }])).toBe(25);
  });
});
