"use client";

import { create } from "zustand";
import type {
  MapAsset,
  MapEmployee,
  MapEvent,
  MapObject,
  MapPresence,
  MapStock,
  MapWorkOrder,
  MapZone,
  PresenceState,
  Selection,
  SiteSnapshot,
  Vec3,
} from "./types";

export type EffectKind = "pulse" | "sparkle" | "halo_ok" | "halo_ko" | "alert" | "depart" | "takeoff";
export interface Effect {
  id: string;
  kind: EffectKind;
  position: Vec3;
  color: string;
  bornAt: number;
  entityId?: string | null;
}

export interface Toast {
  id: string;
  title: string;
  body: string;
  tone: "info" | "ok" | "warn" | "danger";
  at: number;
  focus?: Selection;
}

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

interface MapState {
  ready: boolean;
  orgId: string;
  site: SiteSnapshot["site"] | null;
  canEdit: boolean;
  canRunScenario: boolean;
  zones: MapZone[];
  objects: Record<string, MapObject>;
  assets: Record<string, MapAsset>;
  employees: MapEmployee[];
  presence: Record<string, MapPresence>;
  workOrders: Record<string, MapWorkOrder>;
  stock: Record<string, MapStock>;
  events: MapEvent[];

  selection: Selection | null;
  hover: Selection | null;
  focus: Vec3 | null;
  editMode: boolean;
  drafts: Record<string, Pick<MapObject, "position" | "rotation">>;
  dragging: string | null;
  effects: Effect[];
  toasts: Toast[];
  departed: Record<string, { kind: EffectKind; at: number }>;
  quality: "high" | "low";
  fps: number;
  /** Choix manuel de qualité : la bascule automatique ne s'applique plus. */
  qualityLocked: boolean;

  init(s: SiteSnapshot): void;
  select(s: Selection | null, focus?: Vec3 | null): void;
  setHover(s: Selection | null): void;
  setEditMode(on: boolean): void;
  moveDraft(id: string, position: Vec3): void;
  rotateDraft(id: string): void;
  setDragging(id: string | null): void;
  commitDrafts(): void;
  discardDrafts(): void;
  upsertWorkOrder(wo: Partial<MapWorkOrder> & { id: string }): void;
  upsertAsset(a: Partial<MapAsset> & { id: string }): void;
  upsertStock(s: Partial<MapStock> & { id: string }): void;
  upsertObject(o: Partial<MapObject> & { id: string }): void;
  setPresence(employeeId: string, status: PresenceState, since: string): void;
  pushEvent(e: MapEvent): void;
  addEffect(e: Omit<Effect, "id" | "bornAt">): void;
  pruneEffects(now: number): void;
  addToast(t: Omit<Toast, "id" | "at">): void;
  dismissToast(id: string): void;
  markDeparted(woId: string, kind: EffectKind): void;
  setQuality(q: "high" | "low", manual?: boolean): void;
  setFps(fps: number): void;
}

let uid = 0;
const nextId = () => `${Date.now()}-${uid++}`;

export const useMap = create<MapState>((set, get) => ({
  ready: false,
  orgId: "",
  site: null,
  canEdit: false,
  canRunScenario: false,
  zones: [],
  objects: {},
  assets: {},
  employees: [],
  presence: {},
  workOrders: {},
  stock: {},
  events: [],
  selection: null,
  hover: null,
  focus: null,
  editMode: false,
  drafts: {},
  dragging: null,
  effects: [],
  toasts: [],
  departed: {},
  quality: "high",
  fps: 0,
  qualityLocked: false,

  init: (s) =>
    set({
      ready: true,
      orgId: s.orgId,
      site: s.site,
      canEdit: s.canEdit,
      canRunScenario: s.canRunScenario,
      zones: s.zones,
      objects: byId(s.objects),
      assets: byId(s.assets),
      employees: s.employees,
      presence: Object.fromEntries(s.presence.map((p) => [p.employee_id, p])),
      workOrders: byId(s.workOrders),
      stock: byId(s.stock),
      events: s.events,
      selection: null,
      focus: null,
      editMode: false,
      drafts: {},
      effects: [],
      departed: {},
    }),
  select: (selection, focus) => set({ selection, focus: focus === undefined ? get().focus : focus }),
  setHover: (hover) => set({ hover }),
  setEditMode: (editMode) => set({ editMode, selection: null, drafts: editMode ? get().drafts : {} }),
  moveDraft: (id, position) =>
    set((st) => ({
      drafts: { ...st.drafts, [id]: { position, rotation: st.drafts[id]?.rotation ?? st.objects[id].rotation } },
    })),
  rotateDraft: (id) =>
    set((st) => {
      const cur = st.drafts[id] ?? st.objects[id];
      return { drafts: { ...st.drafts, [id]: { position: cur.position, rotation: (cur.rotation + Math.PI / 2) % (Math.PI * 2) } } };
    }),
  setDragging: (dragging) => set({ dragging }),
  commitDrafts: () =>
    set((st) => {
      const objects = { ...st.objects };
      for (const [id, d] of Object.entries(st.drafts)) objects[id] = { ...objects[id], ...d };
      return { objects, drafts: {} };
    }),
  discardDrafts: () => set({ drafts: {} }),
  upsertWorkOrder: (wo) =>
    set((st) => ({ workOrders: { ...st.workOrders, [wo.id]: { ...(st.workOrders[wo.id] ?? ({} as MapWorkOrder)), ...wo } } })),
  upsertAsset: (a) => set((st) => (st.assets[a.id] ? { assets: { ...st.assets, [a.id]: { ...st.assets[a.id], ...a } } } : {})),
  upsertStock: (s) => set((st) => (st.stock[s.id] ? { stock: { ...st.stock, [s.id]: { ...st.stock[s.id], ...s } } } : {})),
  upsertObject: (o) =>
    set((st) => (st.objects[o.id] ? { objects: { ...st.objects, [o.id]: { ...st.objects[o.id], ...o } } } : {})),
  setPresence: (employeeId, status, since) =>
    set((st) => ({
      presence: {
        ...st.presence,
        [employeeId]: { ...(st.presence[employeeId] ?? { current_activity: null }), employee_id: employeeId, status, since },
      },
    })),
  pushEvent: (e) => set((st) => (st.events.some((x) => x.id === e.id) ? {} : { events: [e, ...st.events].slice(0, 40) })),
  addEffect: (e) => set((st) => ({ effects: [...st.effects, { ...e, id: nextId(), bornAt: performance.now() }] })),
  pruneEffects: (now) => {
    const effects = get().effects.filter((e) => now - e.bornAt < 6000);
    if (effects.length !== get().effects.length) set({ effects });
  },
  addToast: (t) => set((st) => ({ toasts: [{ ...t, id: nextId(), at: Date.now() }, ...st.toasts].slice(0, 4) })),
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  markDeparted: (woId, kind) => set((st) => ({ departed: { ...st.departed, [woId]: { kind, at: performance.now() } } })),
  setQuality: (quality, manual) => set((st) => ({ quality, qualityLocked: st.qualityLocked || !!manual })),
  setFps: (fps) => set({ fps }),
}));

/** Position effective d'un objet (brouillon d'édition prioritaire). */
export const objectPose = (st: Pick<MapState, "objects" | "drafts">, id: string) => {
  const o = st.objects[id];
  const d = st.drafts[id];
  return { position: d?.position ?? o.position, rotation: d?.rotation ?? o.rotation };
};
