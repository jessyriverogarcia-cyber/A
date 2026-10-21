/**
 * Catalogue des modèles procéduraux de la Map (emprise au sol en mètres).
 * Partagé par le seed (placement initial) et la scène 3D.
 */
export const KIT_FOOTPRINT: Record<string, { w: number; d: number }> = {
  printer_fdm: { w: 2.2, d: 2.2 },
  printer_sla: { w: 1.6, d: 1.6 },
  printer_sls: { w: 3, d: 2.4 },
  printer_metal: { w: 3.2, d: 2.6 },
  gantry_printer: { w: 22, d: 12 },
  equipment: { w: 2.4, d: 2 },
  workstation: { w: 1.8, d: 1.2 },
  room: { w: 5, d: 3 },
  badge_reader: { w: 0.6, d: 0.6 },
  rack: { w: 2, d: 0.8 },
};

export const footprint = (kit: string) => KIT_FOOTPRINT[kit] ?? { w: 2, d: 2 };

/**
 * Range des objets en rangées dans un rectangle de zone [x1, z1, x2, z2].
 * Retourne le centre de chaque objet.
 */
export function packInZone(rect: [number, number, number, number], kits: string[], gap = 1.6) {
  const [x1, z1, x2] = rect;
  let x = x1 + gap;
  let z = z1 + gap;
  let rowDepth = 0;
  return kits.map((kit) => {
    const { w, d } = footprint(kit);
    if (x + w > x2 - gap / 2 && x > x1 + gap) {
      x = x1 + gap;
      z += rowDepth + gap * 1.4;
      rowDepth = 0;
    }
    const center = { x: x + w / 2, y: 0, z: z + d / 2 };
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
    return center;
  });
}
