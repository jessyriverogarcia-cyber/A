import { describe, expect, it } from "vitest";
import { packInZone, footprint } from "@/lib/map/kits";
import { boundsOf, furnitureFor, rectOf, stationsFor, workOrderAnchor } from "@/lib/map/layout";
import { computeKpis, kpiTone } from "@/lib/domain/kpis";
import { renderTemplate } from "@/lib/map/live";
import type { MapEmployee, MapObject, MapZone } from "@/lib/map/types";

const zone = (id: string, type: string, rect: [number, number, number, number], extra: Partial<MapZone> = {}): MapZone => ({
  id,
  key: id,
  name: id,
  type,
  polygon: [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]],
  capacity: null,
  restricted: false,
  outdoor: false,
  ...extra,
});

describe("placement", () => {
  it("range les objets dans la zone sans chevauchement", () => {
    const rect: [number, number, number, number] = [0, 0, 36, 22];
    const kits = ["printer_fdm", "printer_fdm", "printer_sls", "printer_sla", "printer_metal", "printer_fdm", "printer_fdm", "printer_fdm"];
    const centers = packInZone(rect, kits);
    const boxes = centers.map((c, i) => {
      const { w, d } = footprint(kits[i]);
      return [c.x - w / 2, c.z - d / 2, c.x + w / 2, c.z + d / 2];
    });
    for (const b of boxes) {
      expect(b[0]).toBeGreaterThanOrEqual(rect[0]);
      expect(b[2]).toBeLessThanOrEqual(rect[2]);
      expect(b[3]).toBeLessThanOrEqual(rect[3]);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        expect(overlap).toBe(false);
      }
  });

  it("calcule les rectangles et l'emprise du site", () => {
    const zones = [zone("a", "office", [0, 0, 10, 8]), zone("b", "production", [10, -4, 30, 8])];
    expect(rectOf(zones[1])).toEqual([10, -4, 30, 8]);
    expect(boundsOf(zones)).toEqual([0, -4, 30, 8]);
  });
});

describe("mobilier et postes", () => {
  it("meuble les zones selon leur type, pas leur nom", () => {
    expect(furnitureFor(zone("x", "office", [0, 0, 10, 12])).filter((f) => f.kind === "desk").length).toBeGreaterThan(4);
    expect(furnitureFor(zone("y", "meeting", [0, 0, 10, 8]))[0].kind).toBe("meeting_table");
    expect(furnitureFor(zone("z", "break", [0, 0, 20, 6])).some((f) => f.kind === "coffee")).toBe(true);
    expect(furnitureFor(zone("w", "production", [0, 0, 20, 6]))).toEqual([]);
  });

  it("place un opérateur devant une machine et un employé de bureau à un bureau", () => {
    const zones = [zone("prod", "production", [0, 0, 20, 10]), zone("off", "office", [0, 10, 10, 20])];
    const objects: MapObject[] = [
      { id: "m1", zone_id: "prod", type: "machine", kit: "printer_fdm", position: { x: 5, y: 0, z: 5 }, rotation: 0, scale: 1, entity_type: "asset", entity_id: "a1", visual_state: "running" },
    ];
    const furniture = new Map([["off", furnitureFor(zones[1])]]);
    const emp = (id: string, z: string): MapEmployee => ({ id, first_name: id, last_name: "", job_title: "", role_key: null, avatar_color: null, appearance: {}, home_zone_id: z, site_id: null });
    const stations = stationsFor([emp("op", "prod"), emp("desk", "off")], zones, objects, furniture);
    expect(stations.get("op")!.z).toBeGreaterThan(5); // devant la machine
    const seat = stations.get("desk")!;
    expect(seat.z).toBeGreaterThan(10);
    expect(seat.z).toBeLessThan(20);
  });

  it("ancre un dossier sur sa machine, sinon dans sa zone", () => {
    const zones = [zone("q", "quality", [0, 0, 10, 10])];
    const objects: MapObject[] = [
      { id: "m", zone_id: "q", type: "machine", kit: "printer_sla", position: { x: 2, y: 0, z: 3 }, rotation: 0, scale: 1, entity_type: "asset", entity_id: "asset-1", visual_state: "running" },
    ];
    const base = { id: "w", number: "OF", title: "", stage: "printing", stage_progress: 0, progress: 0, status: "active", site_id: null, due_date: null, priority: "normal", product_family: null, physical_object: null, client_name: null, traceability: {} };
    expect(workOrderAnchor({ ...base, asset_id: "asset-1", zone_id: null }, objects, zones)).toEqual({ x: 2, y: 0, z: 3 });
    expect(workOrderAnchor({ ...base, asset_id: null, zone_id: "q" }, objects, zones)).toEqual({ x: 5, y: 0, z: 5 });
  });
});

describe("KPI et notifications", () => {
  it("calcule utilisation, OF en cours et délais", () => {
    const k = computeKpis({
      machines: [{ status: "running" }, { status: "running" }, { status: "idle" }, { status: "down" }],
      orders: [
        { status: "active", due_date: "2026-10-25" },
        { status: "active", due_date: "2026-10-01" },
        { status: "done", due_date: "2026-09-01" },
      ],
      today: "2026-10-20",
    });
    expect(k.machines_active.value).toBe(50);
    expect(k.orders_in_progress.value).toBe(2);
    expect(k.on_time_rate.value).toBe(50);
    expect(kpiTone(96, 95, 85)).toBe("ok");
    expect(kpiTone(90, 95, 85)).toBe("warn");
    expect(kpiTone(50, 95, 85)).toBe("danger");
  });

  it("remplit les gabarits de la fiche secteur", () => {
    expect(renderTemplate("{piece} prête sur {machine}", { piece: "Carter", machine: "SLS-01" })).toBe("Carter prête sur SLS-01");
    expect(renderTemplate("Stock bas : {matiere}", {})).toBe("Stock bas : …");
  });
});
