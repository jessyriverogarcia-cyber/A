import { describe, expect, it } from "vitest";
import { computeVat, roundToStep, toCents } from "@/lib/domain/money";
import { computeQuoteTotals, formatDocumentNumber } from "@/lib/domain/quote";
import { budgetAlert, nextStage, overallProgress, transitionStage } from "@/lib/domain/workOrder";
import { presenceFromBadges, workedHours } from "@/lib/domain/presence";
import { sectorConfig } from "@/config/sector.config";

describe("money", () => {
  it("arrondit au centime ou aux 5 centimes", () => {
    expect(roundToStep(12345, 0.01)).toBe(12345);
    expect(roundToStep(12342, 0.05)).toBe(12340);
    expect(roundToStep(12343, 0.05)).toBe(12345);
    expect(roundToStep(-12343, 0.05)).toBe(-12345);
  });

  it("calcule la TVA française à 20 %", () => {
    expect(computeVat(toCents(1234.56), 0.2, 0.01)).toEqual({ net: 123456, vat: 24691, gross: 148147 });
  });

  it("garde HT + TVA = TTC avec un arrondi suisse", () => {
    const r = computeVat(toCents(99.99), 0.081, 0.05);
    expect(r.gross % 5).toBe(0);
    expect(r.net + r.vat).toBe(r.gross);
  });
});

describe("quote", () => {
  it("calcule totaux et marge", () => {
    const t = computeQuoteTotals(
      [
        { quantity: 10, unitPrice: 4500, unitCost: 1800 },
        { quantity: 1, unitPrice: 25000, unitCost: 9000, discount: 0.1 },
      ],
      0.2,
      0.01,
    );
    expect(t.net).toBe(45000 + 22500);
    expect(t.cost).toBe(18000 + 9000);
    expect(t.gross).toBe(81000);
    expect(t.marginRate).toBeCloseTo(0.6);
  });

  it("numérote les documents", () => {
    expect(formatDocumentNumber("DEV", 2026, 42)).toBe("DEV-2026-0042");
  });
});

describe("workOrder", () => {
  const stages = sectorConfig.workOrder.stages;

  it("avance d'une étape et refuse les sauts", () => {
    expect(transitionStage(stages, "printing", "post_processing")).toMatchObject({ ok: true });
    expect(transitionStage(stages, "printing", "shipping")).toMatchObject({ ok: false, reason: "skip_not_allowed" });
  });

  it("autorise le retour en arrière (rejet CQ)", () => {
    expect(transitionStage(stages, "quality", "printing")).toMatchObject({ ok: true });
  });

  it("donne l'étape suivante et l'avancement", () => {
    expect(nextStage(stages, "intake")?.id).toBe("feasibility");
    expect(nextStage(stages, "shipping")).toBeNull();
    expect(overallProgress(stages, "intake", 0)).toBe(0);
    expect(overallProgress(stages, "shipping", 100)).toBe(100);
  });

  it("alerte sur le budget d'heures", () => {
    expect(budgetAlert(5, 10)).toBe("ok");
    expect(budgetAlert(8, 10)).toBe("warning");
    expect(budgetAlert(10.5, 10)).toBe("exceeded");
  });
});

describe("presence", () => {
  const d = (h: number, m = 0) => new Date(2026, 9, 20, h, m);

  it("déduit les pauses des heures travaillées", () => {
    const events = [
      { kind: "in" as const, at: d(8) },
      { kind: "break_start" as const, at: d(12) },
      { kind: "break_end" as const, at: d(12, 45) },
      { kind: "out" as const, at: d(17) },
    ];
    expect(workedHours(events)).toBe(8.25);
    expect(presenceFromBadges(events)).toBe("absent");
  });

  it("compte un pointage ouvert jusqu'à maintenant", () => {
    expect(workedHours([{ kind: "in", at: d(8) }], d(10, 30))).toBe(2.5);
    expect(presenceFromBadges([{ kind: "in", at: d(8) }, { kind: "break_start", at: d(10) }])).toBe("on_break");
  });
});
