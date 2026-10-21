"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import { useShallow } from "zustand/react/shallow";
import { useMap, objectPose } from "@/lib/map/store";
import { footprint } from "@/lib/map/kits";
import { AIRCRAFT_FAMILIES, centerOf, rectOf, hashSeed } from "@/lib/map/layout";
import type { MapObject, MapWorkOrder, Selection } from "@/lib/map/types";
import { PrinterFDM, PrinterMetal, PrinterSLA, PrinterSLS } from "./kits/Printers";
import { Gantry } from "./kits/Gantry";
import { BadgeReader, Equipment, Rack, RoomDisplay, Workstation } from "./kits/Equipment";
import { Aircraft } from "./kits/Aircraft";
import { Truck } from "./Environment";

function selectionOf(o: MapObject): Selection | null {
  if (o.entity_type === "asset" && o.entity_id) return { kind: "asset", id: o.entity_id };
  if (o.entity_type === "stock_item" && o.entity_id) return { kind: "stock_item", id: o.entity_id };
  return null;
}

const same = (a: Selection | null, b: Selection | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

function SelectionRing({ w, d, color = "#ff6b2c" }: { w: number; d: number; color?: string }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.03);
  });
  const r = Math.max(w, d) / 2 + 0.5;
  return (
    <group ref={ref} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[r, r + 0.18, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function KitFor({ o }: { o: MapObject }) {
  const asset = useMap((s) => (o.entity_type === "asset" && o.entity_id ? s.assets[o.entity_id] : undefined));
  const stock = useMap((s) => (o.entity_type === "stock_item" && o.entity_id ? s.stock[o.entity_id] : undefined));
  const wo = useMap((s) =>
    o.entity_type === "asset" && o.entity_id
      ? Object.values(s.workOrders).find((w) => w.asset_id === o.entity_id && w.status === "active" && w.stage === "printing")
      : undefined,
  );
  const status = asset?.status ?? o.visual_state;
  const seed = useMemo(() => (hashSeed(o.id) % 1000) / 100, [o.id]);
  const progress = wo?.stage_progress ?? 35;
  switch (o.kit) {
    case "printer_fdm":
      return <PrinterFDM status={status} progress={progress} seed={seed} />;
    case "printer_sla":
      return <PrinterSLA status={status} seed={seed} />;
    case "printer_sls":
      return <PrinterSLS status={status} seed={seed} />;
    case "printer_metal":
      return <PrinterMetal status={status} seed={seed} />;
    case "gantry_printer":
      return <Gantry status={status} progress={wo?.stage_progress ?? 0} model={wo?.traceability?.model} seed={seed} />;
    case "workstation":
      return <Workstation />;
    case "badge_reader":
      return <BadgeReader />;
    case "room":
      return <RoomDisplay />;
    case "rack":
      return stock ? <Rack category={stock.category} fill={stock.quantity / Math.max(stock.min_quantity * 2.5, 1)} low={stock.quantity < stock.min_quantity} /> : <Rack category="finished_part" fill={0.5} low={false} />;
    default:
      return <Equipment visual={asset?.specs?.visual as string | undefined} status={status} />;
  }
}

function PlacedObject({ o }: { o: MapObject }) {
  const pose = useMap(useShallow((s) => objectPose(s, o.id)));
  const sel = selectionOf(o);
  const selected = useMap((s) => same(s.selection, sel));
  const hovered = useMap((s) => same(s.hover, sel));
  const editMode = useMap((s) => s.editMode);
  const dragging = useMap((s) => s.dragging === o.id);
  const hasDraft = useMap((s) => !!s.drafts[o.id]);
  const { select, setHover, setDragging } = useMap.getState();
  const fp = footprint(o.kit);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!editMode) return;
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    setDragging(o.id);
    useMap.setState({ selection: sel });
  };

  return (
    <group
      position={[pose.position.x, 0.12, pose.position.z]}
      rotation={[0, pose.rotation, 0]}
      scale={o.scale}
      onPointerDown={onDown}
      onClick={(e) => {
        if (editMode || !sel) return;
        e.stopPropagation();
        select(sel, pose.position);
      }}
      onPointerOver={(e) => {
        if (!sel) return;
        e.stopPropagation();
        setHover(sel);
        document.body.style.cursor = editMode ? "grab" : "pointer";
      }}
      onPointerOut={() => {
        setHover(null);
        document.body.style.cursor = "";
      }}
    >
      <KitFor o={o} />
      {(selected || hovered || dragging) && <SelectionRing w={fp.w} d={fp.d} color={editMode ? "#38bdf8" : "#ff6b2c"} />}
      {editMode && hasDraft && !selected && <SelectionRing w={fp.w} d={fp.d} color="#a3e635" />}
    </group>
  );
}

export function MapObjects({ objects }: { objects: MapObject[] }) {
  return (
    <group>
      {objects.map((o) => (
        <PlacedObject key={o.id} o={o} />
      ))}
    </group>
  );
}

/**
 * Appareils aéronautiques des dossiers : hologramme en conception, appareil complet en
 * assemblage / contrôle, sur le tarmac ou la cale à l'expédition. Décollage à l'expédition.
 */
export function AircraftFleet() {
  const workOrders = useMap((s) => s.workOrders);
  const zones = useMap((s) => s.zones);
  const departed = useMap((s) => s.departed);
  const list = useMemo(
    () => Object.values(workOrders).filter((w) => w.traceability?.model && AIRCRAFT_FAMILIES.has(w.product_family ?? "") && !(w.stage === "printing" && w.asset_id)),
    [workOrders],
  );

  // Plusieurs appareils dans la même zone : on les décale.
  const placed = useMemo(() => {
    const perZone = new Map<string, number>();
    return list
      .map((w) => {
        const zone = zones.find((z) => z.id === w.zone_id);
        if (!zone) return null;
        const n = perZone.get(zone.id) ?? 0;
        perZone.set(zone.id, n + 1);
        const r = rectOf(zone);
        const c = centerOf(r);
        const spread = (r[2] - r[0]) / 2.2;
        return { w, x: c.x + (n % 2 ? spread / 2 : -spread / 2) * (list.length > 1 ? 1 : 0), z: c.z, zone };
      })
      .filter(Boolean) as { w: MapWorkOrder; x: number; z: number; zone: (typeof zones)[number] }[];
  }, [list, zones]);

  return (
    <group>
      {placed.map(({ w, x, z, zone }) => (
        <Plane key={w.id} wo={w} x={x} z={z} water={zone.type === "water"} departedAt={departed[w.id]?.at} />
      ))}
    </group>
  );
}

const EARLY = new Set(["intake", "feasibility", "slicing"]);

function Plane({ wo, x, z, water, departedAt }: { wo: MapWorkOrder; x: number; z: number; water: boolean; departedAt?: number }) {
  const ref = useRef<Group>(null);
  const selected = useMap((s) => s.selection?.kind === "work_order" && s.selection.id === wo.id);
  const select = useMap((s) => s.select);
  const setHover = useMap((s) => s.setHover);
  const editMode = useMap((s) => s.editMode);
  const done = wo.status === "done";
  const model = wo.traceability.model!;
  const scale = model.type === "flying_wing" ? 0.78 : model.variant === "private" ? 0.9 : 0.75;

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (departedAt !== undefined) {
      // Décollage : accélération au sol (ou sur l'eau), montée, sortie de champ.
      const t = (performance.now() - departedAt) / 1000;
      const dist = t * t * 2.2;
      g.position.set(x + dist, water ? 0.2 + Math.max(0, t - 3.2) ** 2 * 1.6 : Math.max(0, t - 3) ** 2 * 1.8, z);
      g.rotation.z = t > 3 ? Math.min(0.25, (t - 3) * 0.12) : 0;
      g.visible = t < 14;
      return;
    }
    g.visible = !done;
    g.position.set(x, water ? 0.25 + Math.sin(clock.elapsedTime * 1.1) * 0.08 : 0.12, z);
    g.rotation.z = water ? Math.sin(clock.elapsedTime * 0.8) * 0.01 : 0;
  });

  return (
    <group
      ref={ref}
      scale={scale}
      onClick={(e) => {
        if (editMode) return;
        e.stopPropagation();
        select({ kind: "work_order", id: wo.id }, { x, y: 0, z });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover({ kind: "work_order", id: wo.id });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(null);
        document.body.style.cursor = "";
      }}
    >
      <Aircraft model={model} hologram={EARLY.has(wo.stage)} />
      {selected && <SelectionRing w={model.type === "flying_wing" ? 30 : 24} d={4} />}
    </group>
  );
}

/** Camion transporteur qui quitte le quai après une expédition. */
export function DepartingTruck() {
  const effects = useMap(useShallow((s) => s.effects.filter((e) => e.kind === "depart")));
  return (
    <group>
      {effects.map((e) => (
        <MovingTruck key={e.id} x={e.position.x} z={e.position.z} bornAt={e.bornAt} />
      ))}
    </group>
  );
}

function MovingTruck({ x, z, bornAt }: { x: number; z: number; bornAt: number }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const t = (performance.now() - bornAt) / 1000;
    if (!ref.current) return;
    ref.current.position.set(x + 4, 0.12, z + Math.min(t, 1.2) * 0 - t * t * 1.6);
    ref.current.rotation.y = Math.PI;
    ref.current.visible = t < 6;
  });
  return (
    <group ref={ref}>
      <Truck />
    </group>
  );
}
