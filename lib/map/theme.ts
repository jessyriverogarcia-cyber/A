/** Palette de la maquette : sols par type de zone, couleurs d'état. Indépendant du secteur. */

export const ZONE_FLOOR: Record<string, string> = {
  production: "#d9dce1",
  post_processing: "#d4d2cc",
  storage: "#cfd3d9",
  office: "#c9b79c",
  reception: "#cdb894",
  quality: "#dfe6ec",
  shipping: "#c8ccd2",
  cleanroom: "#eef4f8",
  restricted: "#c9c3b5",
  meeting: "#bfa98a",
  break: "#c7ad86",
  hangar: "#c3c7cd",
  outdoor: "#6f747b",
  water: "#2a6f86",
};

export const WALL = "#f1f2f4";
export const WALL_TOP = "#3a3f47";
export const PLINTH = "#2b2f36";

export const STATUS_COLOR: Record<string, string> = {
  running: "#22c55e",
  idle: "#94a3b8",
  maintenance: "#f59e0b",
  down: "#ef4444",
  offline: "#475569",
  ok: "#22c55e",
  low: "#f59e0b",
};

export const PRESENCE_LABEL: Record<string, string> = {
  at_station: "Au poste",
  on_break: "En pause",
  in_meeting: "En réunion",
  absent: "Absent·e",
  remote: "Télétravail",
  travel: "En déplacement",
};

export const ASSET_STATUS_LABEL: Record<string, string> = {
  running: "En production",
  idle: "Disponible",
  maintenance: "Maintenance",
  down: "En panne",
  offline: "Hors ligne",
};

export const SKIN = ["#f5d0b5", "#e6b48f", "#c98f65", "#9b6544", "#6b4430"];
