import { describe, expect, it } from "vitest";
import { addDays, averageDailyUse, daysOfCover, maintenanceState, reorderQuantity, stockLevel } from "@/lib/domain/stock";
import { purchaseOrderEmail } from "@/lib/domain/emails";

describe("stock", () => {
  it("classe le niveau", () => {
    expect(stockLevel(0, 10)).toBe("out");
    expect(stockLevel(4, 6)).toBe("low");
    expect(stockLevel(6, 6)).toBe("ok");
  });

  it("calcule la consommation et la couverture", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const mv = [
      { delta: -6, at: "2026-10-20T10:00:00Z" },
      { delta: -8, at: "2026-10-15T10:00:00Z" },
      { delta: +50, at: "2026-10-16T10:00:00Z" },
      { delta: -100, at: "2026-08-01T10:00:00Z" },
    ];
    expect(averageDailyUse(mv, 14, now)).toBe(1);
    expect(daysOfCover(9, 1)).toBe(9);
    expect(daysOfCover(9, 0)).toBeNull();
  });

  it("propose une quantité de réassort au conditionnement", () => {
    // min 30 → cible max(60, 30 + 2×21×1,5 = 93) = 93 ; besoin 93-18 = 75 → par 25 = 75
    expect(reorderQuantity({ quantity: 18, min: 30, dailyUse: 2, leadTimeDays: 21, packSize: 25 })).toBe(75);
    // sans consommation : retour au double du minimum
    expect(reorderQuantity({ quantity: 4, min: 6, dailyUse: 0, leadTimeDays: 6 })).toBe(8);
    expect(reorderQuantity({ quantity: 100, min: 6, dailyUse: 0, leadTimeDays: 6 })).toBe(0);
  });
});

describe("maintenance", () => {
  it("signale retard et échéance proche", () => {
    expect(maintenanceState("2026-10-20", "2026-10-21")).toBe("overdue");
    expect(maintenanceState("2026-10-25", "2026-10-21")).toBe("due_soon");
    expect(maintenanceState("2026-12-01", "2026-10-21")).toBe("ok");
    expect(maintenanceState(null, "2026-10-21")).toBe("unknown");
    expect(addDays("2026-10-21", 90)).toBe("2027-01-19");
  });
});

describe("bon de commande", () => {
  it("liste les lignes et demande les certificats", () => {
    const m = purchaseOrderEmail({ companyName: "Strato Fab", senderName: "Julien Ferrand", supplierName: "MétalAtome", number: "CMD-2026-0033", lines: [{ label: "Poudre AlSi10Mg", qty: 75, unit: "kg" }], expectedOn: "11 nov. 2026", deliveryAddress: "12 rue des Fictions" });
    expect(m.subject).toBe("Bon de commande CMD-2026-0033 — Strato Fab");
    expect(m.body).toContain("• Poudre AlSi10Mg : 75 kg");
    expect(m.body).toContain("certificats matière");
  });
});
