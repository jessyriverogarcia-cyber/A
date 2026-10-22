import type { MapEmployee, MapObject, MapWorkOrder, MapZone, Vec3 } from "./types";
import { footprint } from "./kits";

export type Rect = [x1: number, z1: number, x2: number, z2: number];

export function rectOf(zone: Pick<MapZone, "polygon">): Rect {
  const xs = zone.polygon.map((p) => p[0]);
  const zs = zone.polygon.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

export const centerOf = (r: Rect): Vec3 => ({ x: (r[0] + r[2]) / 2, y: 0, z: (r[1] + r[3]) / 2 });

export function boundsOf(zones: MapZone[]): Rect {
  const rects = zones.map(rectOf);
  return [
    Math.min(...rects.map((r) => r[0])),
    Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])),
    Math.max(...rects.map((r) => r[3])),
  ];
}

/** Générateur pseudo-aléatoire déterministe (même plan à chaque chargement). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type FurnitureKind = "desk" | "meeting_table" | "break_table" | "coffee" | "counter" | "sofa" | "bench" | "pallet" | "plant";
export interface Furniture {
  kind: FurnitureKind;
  position: Vec3;
  rotation: number;
  /** Places assises / debout associées (pour les personnes). */
  seats: Vec3[];
}

/**
 * Mobilier décoratif généré à partir du type de zone (jamais du nom) :
 * un nouveau secteur obtient automatiquement des bureaux, salles et pauses meublés.
 */
export function furnitureFor(zone: MapZone, occupied: Rect[] = []): Furniture[] {
  const r = rectOf(zone);
  const [x1, z1, x2, z2] = r;
  const w = x2 - x1;
  const d = z2 - z1;
  const c = centerOf(r);
  const out: Furniture[] = [];
  const free = (x: number, z: number, m = 1.2) =>
    !occupied.some(([a, b, cc, dd]) => x > a - m && x < cc + m && z > b - m && z < dd + m);

  switch (zone.type) {
    case "office": {
      const cols = Math.max(1, Math.floor((w - 1.5) / 3.2));
      const rows = Math.max(1, Math.floor((d - 1.5) / 3));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = x1 + 1.9 + i * 3.2;
          const z = z1 + 1.8 + j * 3;
          if (!free(x, z, 0.4)) continue;
          out.push({ kind: "desk", position: { x, y: 0, z }, rotation: 0, seats: [{ x, y: 0, z: z + 0.85 }] });
        }
      if (w > 6) out.push({ kind: "plant", position: { x: x2 - 0.6, y: 0, z: z1 + 0.6 }, rotation: 0, seats: [] });
      break;
    }
    case "meeting": {
      const len = Math.min(w - 3, 6);
      const seats: Vec3[] = [];
      for (let i = 0; i < 4; i++) {
        const x = c.x - len / 2 + 0.6 + (i * (len - 1.2)) / 3;
        seats.push({ x, y: 0, z: c.z - 1.05 }, { x, y: 0, z: c.z + 1.05 });
      }
      out.push({ kind: "meeting_table", position: c, rotation: 0, seats });
      break;
    }
    case "break": {
      const n = Math.max(1, Math.floor((w - 3) / 4));
      for (let i = 0; i < n; i++) {
        const x = x1 + 2.5 + i * 4;
        out.push({
          kind: "break_table",
          position: { x, y: 0, z: c.z },
          rotation: 0,
          seats: [
            { x: x - 0.8, y: 0, z: c.z },
            { x: x + 0.8, y: 0, z: c.z },
          ],
        });
      }
      out.push({ kind: "coffee", position: { x: x2 - 0.8, y: 0, z: z1 + 0.7 }, rotation: 0, seats: [{ x: x2 - 0.8, y: 0, z: z1 + 1.6 }] });
      out.push({ kind: "plant", position: { x: x1 + 0.6, y: 0, z: z2 - 0.6 }, rotation: 0, seats: [] });
      break;
    }
    case "reception":
      out.push({ kind: "counter", position: { x: c.x, y: 0, z: z1 + 2 }, rotation: 0, seats: [{ x: c.x, y: 0, z: z1 + 1.1 }] });
      out.push({ kind: "sofa", position: { x: c.x, y: 0, z: z2 - 1.3 }, rotation: Math.PI, seats: [{ x: c.x - 0.6, y: 0, z: z2 - 1.4 }, { x: c.x + 0.6, y: 0, z: z2 - 1.4 }] });
      out.push({ kind: "plant", position: { x: x1 + 0.6, y: 0, z: z2 - 0.6 }, rotation: 0, seats: [] });
      break;
    case "quality":
    case "post_processing":
    case "cleanroom": {
      const z = z2 - 1.2;
      for (let x = x1 + 2; x < x2 - 1.5; x += 3.2) {
        if (!free(x, z, 0.3)) continue;
        out.push({ kind: "bench", position: { x, y: 0, z }, rotation: 0, seats: [{ x, y: 0, z: z - 0.9 }] });
      }
      break;
    }
    case "shipping": {
      const rnd = seeded(hashSeed(zone.id));
      for (let i = 0; i < Math.min(10, Math.floor(w / 2.4)); i++) {
        const x = x1 + 1.6 + i * 2.2;
        const z = z1 + 1.6 + (i % 2) * 1.6;
        if (!free(x, z, 0.3)) continue;
        out.push({ kind: "pallet", position: { x, y: 0, z }, rotation: rnd() * 0.3, seats: [] });
      }
      break;
    }
  }
  return out;
}

/** Emprise au sol d'un objet de la map (rectangle aligné). */
export function objectRect(o: MapObject): Rect {
  const { w, d } = footprint(o.kit);
  const rot = Math.abs(Math.round(o.rotation / (Math.PI / 2))) % 2 === 1;
  const hw = ((rot ? d : w) * o.scale) / 2;
  const hd = ((rot ? w : d) * o.scale) / 2;
  return [o.position.x - hw, o.position.z - hd, o.position.x + hw, o.position.z + hd];
}

/**
 * Poste de chaque employé : une place assise (bureaux, salle blanche, CQ) ou un point
 * debout devant une machine de sa zone. Déterministe pour un même plan.
 */
export function stationsFor(
  employees: MapEmployee[],
  zones: MapZone[],
  objects: MapObject[],
  furniture: Map<string, Furniture[]>,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const used = new Map<string, number>();
  for (const e of employees) {
    const zone = zones.find((z) => z.id === e.home_zone_id);
    if (!zone) continue;
    const n = used.get(zone.id) ?? 0;
    used.set(zone.id, n + 1);
    const seats = (furniture.get(zone.id) ?? []).flatMap((f) => (f.kind === "plant" || f.kind === "coffee" ? [] : f.seats));
    const machines = objects.filter((o) => o.zone_id === zone.id && o.type === "machine");
    if (machines.length && (zone.type === "production" || zone.type === "restricted" || zone.type === "hangar" || n >= seats.length)) {
      const m = machines[n % machines.length];
      const { d } = footprint(m.kit);
      result.set(e.id, { x: m.position.x + (n >= machines.length ? 1 : -0.6), y: 0, z: m.position.z + (d * m.scale) / 2 + 0.7 });
    } else if (seats.length) {
      result.set(e.id, seats[n % seats.length]);
    } else {
      const c = centerOf(rectOf(zone));
      result.set(e.id, { x: c.x + (n % 3) - 1, y: 0, z: c.z + Math.floor(n / 3) });
    }
  }
  return result;
}

/** Places disponibles pour un état de présence donné (pause, réunion). */
export function seatsInZoneType(zones: MapZone[], furniture: Map<string, Furniture[]>, type: string): Vec3[] {
  return zones.filter((z) => z.type === type).flatMap((z) => (furniture.get(z.id) ?? []).flatMap((f) => f.seats));
}

/** Point d'entrée du site (accueil, sinon bord de la première zone). */
export function entranceOf(zones: MapZone[]): Vec3 {
  const reception = zones.find((z) => z.type === "reception") ?? zones.find((z) => z.type === "hangar") ?? zones[0];
  const r = rectOf(reception);
  return { x: r[0] - 1.5, y: 0, z: (r[1] + r[3]) / 2 };
}

/** Position d'un dossier (OF) sur la map : sur sa machine, sinon dans sa zone. */
export function workOrderAnchor(wo: MapWorkOrder, objects: MapObject[], zones: MapZone[]): Vec3 | null {
  const machine = wo.asset_id ? objects.find((o) => o.entity_type === "asset" && o.entity_id === wo.asset_id) : null;
  if (machine) return machine.position;
  const zone = zones.find((z) => z.id === wo.zone_id);
  return zone ? centerOf(rectOf(zone)) : null;
}

export const AIRCRAFT_FAMILIES = new Set(["oblique_wing_supersonic", "flying_wing_seaplane"]);
