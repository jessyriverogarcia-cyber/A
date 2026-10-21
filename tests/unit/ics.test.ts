import { describe, expect, it } from "vitest";
import { buildIcs, fold } from "@/lib/domain/ics";

describe("iCalendar", () => {
  const ics = buildIcs("Agenda — Karim", [
    { uid: "a@strato", title: "Revue, conception; Cargo", start: "2026-10-21T08:00:00Z", end: "2026-10-21T09:30:00Z", location: "Salle Garonne", description: "Ligne 1\nLigne 2" },
    { uid: "b@strato", title: "Congés payés", start: "2026-11-02", end: "2026-11-06", allDay: true },
  ], new Date("2026-10-21T06:00:00Z"));

  it("structure, dates UTC et journées entières (fin exclusive)", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
    expect(ics).toContain("DTSTART:20261021T080000Z\r\nDTEND:20261021T093000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261107");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("échappe virgules, points-virgules et retours à la ligne", () => {
    expect(ics).toContain("SUMMARY:Revue\\, conception\; Cargo");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2");
  });

  it("replie les lignes longues à 75 octets sans couper un caractère", () => {
    const long = "SUMMARY:" + "Réunion très importante ".repeat(8);
    const folded = fold(long);
    for (const l of folded.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(long);
  });
});
