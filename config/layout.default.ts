/**
 * Géométrie par défaut des zones (mètres, rectangles x1, z1, x2, z2), par identifiant de zone de la
 * fiche secteur. Point de départ du plan, ajusté ensuite dans le mode édition de la Map.
 */
export const DEFAULT_RECTS: Record<string, [number, number, number, number]> = {
  print_floor: [0, 0, 36, 22],
  post_processing: [36, 0, 48, 11],
  materials: [36, 11, 48, 22],
  cleanroom: [0, 22, 12, 32],
  quality_lab: [12, 22, 24, 32],
  shipping: [24, 22, 48, 32],
  reception: [0, 32, 10, 40],
  cad_office: [10, 32, 20, 44],
  offices: [0, 40, 10, 52],
  meeting_room: [10, 44, 20, 52],
  break_room: [0, 52, 20, 58],
  atex_metal: [56, 0, 70, 14],
  parking: [-26, 32, -4, 58],
  dock: [48, 22, 58, 32],
  gantry_bay: [0, 0, 50, 30],
  assembly_line: [50, 0, 90, 30],
  model_shop: [0, 30, 20, 40],
  hangar_quality: [20, 30, 40, 40],
  tarmac: [0, -60, 90, -6],
  slipway: [96, -24, 132, 40],
};

/** Polygone (sens horaire) d'une zone ; carré de 10 m si la zone n'a pas de géométrie par défaut. */
export function zonePolygon(key: string): [number, number][] {
  const [x1, z1, x2, z2] = DEFAULT_RECTS[key] ?? [0, 0, 10, 10];
  return [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
}
