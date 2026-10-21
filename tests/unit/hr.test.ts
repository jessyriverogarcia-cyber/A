import { describe, expect, it } from "vitest";
import { zonedToIso, badgeAnomaly, businessDays, easterSunday, frenchHolidays, hoursByDay, leaveBalance, leavePeriodStart, mondayOf, overtime } from "@/lib/domain/hr";

describe("calendrier", () => {
  it("calcule Pâques et les fériés", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    const h = frenchHolidays(2026);
    expect(h.size).toBe(11);
    expect(h.has("2026-04-06")).toBe(true); // lundi de Pâques
    expect(h.has("2026-05-14")).toBe(true); // Ascension
    expect(h.has("2026-05-25")).toBe(true); // Pentecôte
  });

  it("compte les jours ouvrés hors week-ends et fériés", () => {
    expect(businessDays("2026-10-19", "2026-10-23")).toBe(5);
    expect(businessDays("2026-10-19", "2026-10-25")).toBe(5);
    expect(businessDays("2026-11-09", "2026-11-13")).toBe(4); // 11 novembre
    expect(businessDays("2026-12-24", "2027-01-04")).toBe(6);
  });
});

describe("congés", () => {
  it("démarre la période au 1er juin", () => {
    expect(leavePeriodStart("2026-10-21")).toBe("2026-06-01");
    expect(leavePeriodStart("2027-03-01")).toBe("2026-06-01");
  });

  it("calcule acquis, pris, en attente", () => {
    const b = leaveBalance({
      today: "2026-10-21",
      startDate: "2020-01-01",
      workRate: 1,
      carryover: 3,
      leaves: [
        { kind: "paid", status: "approved", starts_on: "2026-08-03", days: 10 },
        { kind: "paid", status: "pending", starts_on: "2026-11-02", days: 2 },
        { kind: "rtt", status: "approved", starts_on: "2026-09-01", days: 1 },
        { kind: "paid", status: "approved", starts_on: "2026-03-01", days: 5 }, // période précédente
      ],
    });
    // 4 mois × 25/12 = 8,33 + 3 = 11,3
    expect(b).toEqual({ acquired: 11.3, taken: 10, pending: 2, available: -0.7 });
  });

  it("proratise le temps partiel et l'embauche récente", () => {
    expect(leaveBalance({ today: "2026-10-21", startDate: "2026-09-01", workRate: 0.8, carryover: 0, leaves: [] }).acquired).toBe(1.7); // 1 mois complet × 25/12 × 0,8
  });
});

describe("badges", () => {
  it("additionne les heures par jour", () => {
    const d = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 19, h, m));
    const m = hoursByDay([
      { kind: "in", at: d(7), day: "2026-10-19" },
      { kind: "break_start", at: d(11), day: "2026-10-19" },
      { kind: "break_end", at: d(11, 30), day: "2026-10-19" },
      { kind: "out", at: d(15), day: "2026-10-19" },
    ]);
    expect(m.get("2026-10-19")).toBe(7.5);
  });

  it("n'étire pas un oubli de sortie d'un jour passé jusqu'à maintenant", () => {
    const d = (day: number, h: number) => new Date(Date.UTC(2026, 9, day, h));
    const ev = [
      { kind: "in" as const, at: d(20, 7), day: "2026-10-20" },
      { kind: "break_start" as const, at: d(20, 11), day: "2026-10-20" },
      { kind: "break_end" as const, at: d(20, 12), day: "2026-10-20" },
      { kind: "in" as const, at: d(21, 7), day: "2026-10-21" },
    ];
    const m = hoursByDay(ev, d(21, 10), "2026-10-21");
    expect(m.get("2026-10-20")).toBe(4); // 7h→11h, la session ouverte après 12h n'est pas comptée
    expect(m.get("2026-10-21")).toBe(3); // aujourd'hui : jusqu'à maintenant
  });

  it("détecte les anomalies", () => {
    expect(badgeAnomaly(["in", "break_start", "break_end", "out"])).toBeNull();
    expect(badgeAnomaly(["in", "break_start", "break_end"])).toBe("missing_out");
    expect(badgeAnomaly(["in", "break_start"])).toBe("open_break");
    expect(badgeAnomaly(["out"])).toBe("no_in");
    expect(badgeAnomaly([])).toBeNull();
  });

  it("calcule les heures sup et le lundi", () => {
    expect(overtime(38.5, 35)).toBe(3.5);
    expect(overtime(30, 35)).toBe(0);
    expect(mondayOf("2026-10-21")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  });
});

describe("fuseau", () => {
  it("convertit l'heure de Paris en UTC (été et hiver)", () => {
    expect(zonedToIso("2026-10-20", "17:00", "Europe/Paris")).toBe("2026-10-20T15:00:00.000Z");
    expect(zonedToIso("2026-12-01", "17:00", "Europe/Paris")).toBe("2026-12-01T16:00:00.000Z");
  });
});

describe("RTT", () => {
  const rules = { referenceWeeklyHours: 35, workedWeeksPerYear: 47, forfaitDays: 218, paidLeaveDays: 25 };
  it("forfait jours : 365 − 104 week-ends − 9 fériés en semaine − 25 CP − 218 = 9 jours en 2026", async () => {
    const { rttAnnualDays } = await import("@/lib/domain/hr");
    expect(rttAnnualDays({ regime: "forfait_jours", weeklyHours: 0, workRate: 1, year: 2026 }, rules)).toBe(9);
  });
  it("horaire : 39 h → 4 h × 47 semaines / 7,8 h par jour ≈ 24,1 jours ; rien à 35 h", async () => {
    const { rttAnnualDays } = await import("@/lib/domain/hr");
    expect(rttAnnualDays({ regime: "hours", weeklyHours: 39, workRate: 1, year: 2026 }, rules)).toBe(24.1);
    expect(rttAnnualDays({ regime: "hours", weeklyHours: 35, workRate: 1, year: 2026 }, rules)).toBe(0);
  });
  it("solde : prorata des mois, pris et en attente déduits ; embauche en cours d'année", async () => {
    const { rttBalance } = await import("@/lib/domain/hr");
    const b = rttBalance({ today: "2026-10-21", startDate: "2020-01-01", regime: "forfait_jours", weeklyHours: 0, workRate: 1, leaves: [{ kind: "rtt", status: "approved", starts_on: "2026-05-15", days: 2 }, { kind: "rtt", status: "pending", starts_on: "2026-11-02", days: 1 }, { kind: "rtt", status: "approved", starts_on: "2025-12-26", days: 1 }] }, rules);
    expect(b).toEqual({ annual: 9, acquired: 7.5, taken: 2, pending: 1, available: 4.5 });
    expect(rttBalance({ today: "2026-10-21", startDate: "2026-09-01", regime: "hours", weeklyHours: 39, workRate: 1, leaves: [] }, rules).acquired).toBe(4);
  });
});
