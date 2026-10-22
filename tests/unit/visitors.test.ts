import { describe, expect, it } from "vitest";
import { ARRIVAL_MARGIN_MS, visitorAvatar, visitorsOnSite } from "@/lib/map/visitors";
import type { MapVisitor } from "@/lib/map/types";

const v = (id: string, start: string, end: string, contact: string | null = "Claire Dupuy"): MapVisitor => ({
  id, client_id: "c1", client_name: "Atelier Garonne Composites", contact_name: contact, title: "Revue", starts_at: start, ends_at: end, host_employee_id: null,
});

describe("visitorsOnSite", () => {
  const meeting = v("a", "2026-10-22T08:00:00Z", "2026-10-22T09:30:00Z");
  it("présent pendant le rendez-vous, et un peu avant", () => {
    expect(visitorsOnSite([meeting], Date.parse("2026-10-22T08:30:00Z"))).toHaveLength(1);
    expect(visitorsOnSite([meeting], Date.parse("2026-10-22T08:00:00Z") - ARRIVAL_MARGIN_MS)).toHaveLength(1);
  });
  it("absent avant l'arrivée et après la fin", () => {
    expect(visitorsOnSite([meeting], Date.parse("2026-10-22T07:40:00Z"))).toHaveLength(0);
    expect(visitorsOnSite([meeting], Date.parse("2026-10-22T09:30:00Z"))).toHaveLength(0);
  });
});

describe("visitorAvatar", () => {
  it("porte le nom du contact et celui de son entreprise, avec un identifiant distinct des salariés", () => {
    const a = visitorAvatar(v("abc", "2026-10-22T08:00:00Z", "2026-10-22T09:00:00Z"));
    expect(a.id).toBe("visitor:abc");
    expect(`${a.first_name} ${a.last_name}`).toBe("Claire Dupuy");
    expect(a.job_title).toBe("Atelier Garonne Composites");
    expect(visitorAvatar(v("x", "2026-10-22T08:00:00Z", "2026-10-22T09:00:00Z", null)).first_name).toBe("Visiteur");
  });
});
