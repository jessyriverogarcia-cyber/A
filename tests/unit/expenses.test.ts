import { describe, expect, it } from "vitest";
import { sectorConfig } from "@/config/sector.config";
import { expenseAmounts, policyWarnings, rebillLines, toReimburse } from "@/lib/domain/expenses";

const p = sectorConfig.expenses;

describe("notes de frais", () => {
  it("calcule HT et TVA ; TVA d'hébergement non récupérable", () => {
    expect(expenseAmounts(p, { category: "meal", amount: 22 })).toEqual({ ttc: 22, ht: 20, vat: 2, recoverableVat: 2 });
    expect(expenseAmounts(p, { category: "lodging", amount: 110 })).toEqual({ ttc: 110, ht: 100, vat: 10, recoverableVat: 0 });
    expect(expenseAmounts(p, { category: "supplies", amount: 60 })).toMatchObject({ ht: 50, vat: 10 });
  });

  it("indemnités kilométriques : km × barème, sans TVA", () => {
    expect(expenseAmounts(p, { category: "mileage", km: 100 })).toEqual({ ttc: 63.6, ht: 63.6, vat: 0, recoverableVat: 0 });
    expect(() => expenseAmounts(p, { category: "inconnue", amount: 1 })).toThrow();
  });

  it("signale plafond, justificatif manquant, ancienneté et date future", () => {
    expect(policyWarnings(p, { category: "meal", amount: 45, spent_on: "2026-10-20", receipt: false }, "2026-10-21")).toEqual(["over_ceiling", "missing_receipt"]);
    expect(policyWarnings(p, { category: "mileage", amount: 63.6, spent_on: "2026-06-01", receipt: false }, "2026-10-21")).toEqual(["too_old"]);
    expect(policyWarnings(p, { category: "transport", amount: 80, spent_on: "2026-10-25", receipt: true }, "2026-10-21")).toEqual(["future_date"]);
  });

  it("totalise le remboursement et prépare la refacturation HT", () => {
    const r = toReimburse([
      { employee_id: "a", amount: 10.1, status: "approved" },
      { employee_id: "a", amount: 5.2, status: "approved" },
      { employee_id: "a", amount: 99, status: "pending" },
      { employee_id: "b", amount: 7, status: "reimbursed" },
    ]);
    expect(r.get("a")).toBe(15.3);
    expect(r.has("b")).toBe(false);
    expect(rebillLines(p, [{ label: "Train Toulouse", amount: 110, category: "transport", spent_on: "2026-10-15" }])[0]).toMatchObject({ unit_price: 100, description: "Frais refacturés — Train Toulouse (15/10/2026)" });
  });
});
