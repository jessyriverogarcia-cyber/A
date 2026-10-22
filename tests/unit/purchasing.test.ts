import { describe, expect, it } from "vitest";
import { planReceipt, remaining, supplierPerformance } from "@/lib/domain/purchasing";

const lines = [
  { stock_item_id: "a", qty: 60 },
  { stock_item_id: "b", qty: 10, received: 4 },
];

describe("réception partielle", () => {
  it("reçoit une partie, plafonne au reste et donne le statut", () => {
    expect(remaining(lines[1])).toBe(6);
    const p = planReceipt(lines, { a: 20, b: 50 });
    expect(p.take).toEqual([{ stock_item_id: "a", qty: 20 }, { stock_item_id: "b", qty: 6 }]);
    expect(p.capped).toBe(true);
    expect(p.status).toBe("partially_received");
    expect(p.lines.map((l) => l.received)).toEqual([20, 10]);
  });

  it("solde la commande quand tout est reçu ; ignore les quantités nulles ou négatives", () => {
    const p = planReceipt([{ stock_item_id: "a", qty: 5, received: 2 }], { a: 3 });
    expect(p.status).toBe("received");
    expect(planReceipt([{ stock_item_id: "a", qty: 5 }], { a: -2 }).take).toEqual([]);
    expect(planReceipt([{ stock_item_id: "a", qty: 5 }], {}).status).toBe("sent");
  });
});

describe("performance fournisseur", () => {
  it("taux à l'heure, retard moyen et encours en retard", () => {
    const perf = supplierPerformance(
      [
        { status: "received", expected_on: "2026-10-01", received_at: "2026-09-30T10:00:00Z", total: 100 },
        { status: "received", expected_on: "2026-10-05", received_at: "2026-10-09T10:00:00Z", total: 100 },
        { status: "sent", expected_on: "2026-10-10", received_at: null, total: 300 },
        { status: "partially_received", expected_on: "2026-11-10", received_at: null, total: 200 },
        { status: "cancelled", expected_on: null, received_at: null, total: 999 },
      ],
      "2026-10-21",
    );
    expect(perf).toEqual({ orders: 4, onTimeRate: 0.5, averageDelay: 2, open: 2, openValue: 500, lateOpen: 1 });
  });
});
