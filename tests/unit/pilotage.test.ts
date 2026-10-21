import { describe, expect, it } from "vitest";
import { auditDiff, backlog, cashProjection, hoursOverruns, lastMonths, quoteConversion, quotedMargin, receivables, revenueByMonth, sortAlerts, variation, weightedPipeline } from "@/lib/domain/pilotage";

describe("pilotage", () => {
  it("liste les derniers mois, y compris à cheval sur l'année", () => {
    expect(lastMonths("2026-02-15", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("CA par mois : émises seulement, avoirs déduits", () => {
    const r = revenueByMonth(
      [
        { issue_date: "2026-10-02", total_ht: 1000, status: "sent" },
        { issue_date: "2026-10-20", total_ht: -200, status: "paid" },
        { issue_date: "2026-10-21", total_ht: 5000, status: "draft" },
        { issue_date: "2026-09-10", total_ht: 300, status: "overdue" },
        { issue_date: "2026-09-11", total_ht: 300, status: "cancelled" },
      ],
      ["2026-09", "2026-10"],
    );
    expect(r).toEqual([{ month: "2026-09", value: 300 }, { month: "2026-10", value: 800 }]);
    expect(variation(800, 300)).toBeCloseTo(1.667, 2);
    expect(variation(5, 0)).toBeNull();
  });

  it("pipeline pondéré hors gagné/perdu", () => {
    const p = weightedPipeline(
      [{ stage: "lead", value: 1000, probability: 0.1 }, { stage: "negotiation", value: 2000, probability: 0.75 }, { stage: "won", value: 9999, probability: 1 }],
      [{ id: "lead", label: "Prospect", outcome: "open" }, { id: "negotiation", label: "Négo" }, { id: "won", label: "Gagné", outcome: "won" }],
    );
    expect(p.total).toBe(3000);
    expect(p.weighted).toBe(1600);
    expect(p.byStage).toHaveLength(2);
  });

  it("transformation et marge des devis", () => {
    const qs = [
      { status: "accepted", total_ht: 1000, total_cost: 600 },
      { status: "accepted", total_ht: 1000, total_cost: 400 },
      { status: "rejected", total_ht: 500, total_cost: 0 },
      { status: "sent", total_ht: 800, total_cost: 0 },
    ];
    expect(quoteConversion(qs).rate).toBeCloseTo(2 / 3);
    expect(quotedMargin(qs)).toEqual({ ht: 2000, margin: 1000, rate: 0.5 });
  });

  it("carnet de commandes net de ce qui est facturé", () => {
    expect(
      backlog(
        [{ id: "a", status: "active", quote_ht: 10000 }, { id: "b", status: "done", quote_ht: 5000 }, { id: "c", status: "active", quote_ht: 1000 }],
        [{ work_order_id: "a", total_ht: 3000, status: "sent" }, { work_order_id: "a", total_ht: 9000, status: "draft" }, { work_order_id: "c", total_ht: 1500, status: "paid" }],
      ),
    ).toBe(7000);
  });

  it("encours et part échue", () => {
    const r = receivables(
      [
        { status: "overdue", due_date: "2026-10-01", total_ttc: 1200, paid_amount: 200 },
        { status: "sent", due_date: "2026-11-30", total_ttc: 600, paid_amount: 0 },
        { status: "paid", due_date: "2026-09-01", total_ttc: 900, paid_amount: 900 },
      ],
      "2026-10-21",
    );
    expect(r).toEqual({ open: 1600, overdue: 1000 });
  });

  it("dépassements d'heures et trésorerie cumulée", () => {
    const o = hoursOverruns([{ id: "a", number: "OF-1", title: "x", hours_budget: 10, status: "active" }, { id: "b", number: "OF-2", title: "y", hours_budget: 10, status: "active" }], new Map([["a", 12], ["b", 9]]));
    expect(o.map((x) => x.number)).toEqual(["OF-1"]);
    const c = cashProjection([{ month: "2026-11-01", inflow: 100, outflow: 150 }, { month: "2026-10-01", inflow: 300, outflow: 100 }], 1000);
    expect(c.map((x) => x.balance)).toEqual([1200, 1150]);
  });

  it("alertes triées par gravité ; différences d'audit", () => {
    const s = sortAlerts([
      { level: "warning", module: "b", title: "", detail: "", href: "" },
      { level: "critical", module: "z", title: "", detail: "", href: "" },
    ]);
    expect(s[0].level).toBe("critical");
    expect(auditDiff({ id: "1", status: "sent", paid_amount: 0, updated_at: "x" }, { id: "1", status: "paid", paid_amount: 100, updated_at: "y" })).toEqual([
      { field: "status", before: "sent", after: "paid" },
      { field: "paid_amount", before: 0, after: 100 },
    ]);
    expect(auditDiff(null, { id: "1", number: "FAC-1", notes: null })).toEqual([{ field: "number", before: null, after: "FAC-1" }]);
  });
});
