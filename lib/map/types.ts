/** Vue « map » des tables partagées avec le back-office (aucune donnée propre hors géométrie). */

export type Vec3 = { x: number; y: number; z: number };

export interface MapZone {
  id: string;
  key: string;
  name: string;
  type: string;
  polygon: [number, number][];
  capacity: number | null;
  restricted: boolean;
  outdoor: boolean;
}

export interface MapObject {
  id: string;
  zone_id: string | null;
  type: string;
  kit: string;
  position: Vec3;
  rotation: number;
  scale: number;
  entity_type: string | null;
  entity_id: string | null;
  visual_state: string;
}

export interface MapAsset {
  id: string;
  code: string;
  name: string;
  kind: string;
  technology: string | null;
  status: string;
  zone_id: string | null;
  next_maintenance_on: string | null;
  specs: Record<string, unknown>;
}

export interface MapEmployee {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  role_key: string | null;
  avatar_color: string | null;
  appearance: { skin?: number; hair?: number; hairColor?: string; outfit?: string };
  home_zone_id: string | null;
  site_id: string | null;
}

export type PresenceState = "at_station" | "on_break" | "in_meeting" | "absent" | "remote" | "travel";

export interface MapPresence {
  employee_id: string;
  status: PresenceState;
  since: string | null;
  current_activity: string | null;
}

export interface AircraftModel {
  type: "oblique_jet" | "flying_wing";
  variant?: "private" | "airliner" | "cargo";
  rockets?: number[];
}

export interface MapWorkOrder {
  id: string;
  number: string;
  title: string;
  stage: string;
  stage_progress: number;
  progress: number;
  status: string;
  asset_id: string | null;
  zone_id: string | null;
  site_id: string | null;
  due_date: string | null;
  priority: string;
  product_family: string | null;
  physical_object: string | null;
  client_name: string | null;
  traceability: { model?: AircraftModel; norme?: string; lot_matiere?: string };
}

export interface MapStock {
  id: string;
  sku: string;
  label: string;
  category: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  location_zone_id: string | null;
  supplier_name: string | null;
}

export interface MapEvent {
  id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  at: string;
}

export interface SiteSnapshot {
  orgId: string;
  site: { id: string; key: string; name: string };
  zones: MapZone[];
  objects: MapObject[];
  assets: MapAsset[];
  employees: MapEmployee[];
  presence: MapPresence[];
  workOrders: MapWorkOrder[];
  stock: MapStock[];
  events: MapEvent[];
  canEdit: boolean;
  canRunScenario: boolean;
}

export type Selection =
  | { kind: "asset"; id: string }
  | { kind: "employee"; id: string }
  | { kind: "stock_item"; id: string }
  | { kind: "work_order"; id: string }
  | { kind: "zone"; id: string };
