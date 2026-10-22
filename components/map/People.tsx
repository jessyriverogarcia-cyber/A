"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { mat } from "./materials";
import { SKIN, PRESENCE_LABEL } from "@/lib/map/theme";
import { hashSeed, seeded, type Furniture, entranceOf, seatsInZoneType, stationsFor } from "@/lib/map/layout";
import { useMap } from "@/lib/map/store";
import { livePositions } from "@/lib/map/labels";
import type { MapEmployee, MapObject, MapZone, Selection, Vec3 } from "@/lib/map/types";
import { visitorAvatar, visitorsOnSite } from "@/lib/map/visitors";
import { footprint } from "@/lib/map/kits";

const SPEED = 1.7; // m/s (légèrement accéléré pour la démo)
const SCALE = 1.25; // personnages un peu agrandis pour rester lisibles vue du ciel

type Target = { pos: Vec3; seated: boolean; visible: boolean };

interface Look {
  top: string;
  bottom: string;
  accent?: string;
  hood?: boolean;
  /** Badge « visiteur » porté en sautoir. */
  badge?: boolean;
}

function lookFor(e: MapEmployee, zoneType: string | undefined): Look {
  if (zoneType === "cleanroom") return { top: "#f8fafc", bottom: "#f1f5f9", accent: "#93c5fd", hood: true };
  if (zoneType === "restricted") return { top: "#6b7280", bottom: "#4b5563", accent: "#ff6b2c" };
  if (zoneType === "quality") return { top: "#f8fafc", bottom: "#334155" };
  if (e.appearance.outfit === "workwear") return { top: "#1e3a5f", bottom: "#1e3a5f", accent: "#f97316" };
  return { top: e.avatar_color ?? "#64748b", bottom: "#27303b" };
}

function Person({
  e,
  target,
  entrance,
  wander,
  look,
  sel = { kind: "employee", id: e.id },
}: {
  e: MapEmployee;
  target: Target;
  entrance: Vec3;
  wander: Vec3[];
  look: Look;
  sel?: Selection;
}) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const rnd = useMemo(() => seeded(hashSeed(e.id)), [e.id]);
  const st = useRef({
    pos: { ...(target.visible ? target.pos : entrance) },
    visible: target.visible,
    leaving: false,
    phase: rnd() * 6,
    heading: 0,
    wanderTarget: null as Vec3 | null,
    nextWander: 8 + rnd() * 30,
    dwell: 0,
  });
  const selected = useMap((s) => s.selection?.kind === sel.kind && s.selection.id === sel.id);
  const hovered = useMap((s) => s.hover?.kind === sel.kind && s.hover.id === sel.id);
  const select = useMap((s) => s.select);
  const setHover = useMap((s) => s.setHover);
  const editMode = useMap((s) => s.editMode);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    // Apparition à l'entrée (badge d'arrivée) ou départ vers la sortie.
    if (target.visible && !s.visible) {
      s.visible = true;
      s.leaving = false;
      s.pos = { ...entrance };
    }
    if (!target.visible && s.visible) s.leaving = true;

    // Ronde des opérateurs : de temps en temps, aller voir une autre machine de la zone.
    if (!s.leaving && target.visible && !target.seated && wander.length) {
      s.nextWander -= dt;
      if (!s.wanderTarget && s.nextWander <= 0) {
        s.wanderTarget = wander[Math.floor(rnd() * wander.length)];
        s.dwell = 4 + rnd() * 4;
      }
    }
    const goal = s.leaving ? entrance : (s.wanderTarget ?? target.pos);
    const dx = goal.x - s.pos.x;
    const dz = goal.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.06;
    if (moving) {
      const step = Math.min(dist, SPEED * dt);
      s.pos.x += (dx / dist) * step;
      s.pos.z += (dz / dist) * step;
      const h = Math.atan2(dx, dz);
      let diff = h - s.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.heading += diff * Math.min(1, dt * 10);
      s.phase += dt * 9;
    } else if (s.leaving) {
      s.visible = false;
    } else if (s.wanderTarget) {
      s.dwell -= dt;
      if (s.dwell <= 0) {
        s.wanderTarget = null;
        s.nextWander = 20 + rnd() * 40;
      }
    }

    const seated = !moving && target.seated && !s.wanderTarget && !s.leaving;
    if (root.current) {
      root.current.visible = s.visible;
      root.current.position.set(s.pos.x, 0.12, s.pos.z);
      livePositions.set(e.id, s.pos);
      root.current.rotation.y = seated ? Math.PI : s.heading;
    }
    const swing = moving ? Math.sin(s.phase) * 0.6 : 0;
    const t = performance.now() / 1000;
    if (body.current) body.current.position.y = seated ? -0.38 : moving ? Math.abs(Math.sin(s.phase)) * 0.04 : Math.sin(t * 1.5 + s.phase) * 0.01;
    if (legL.current) legL.current.rotation.x = seated ? -1.5 : swing;
    if (legR.current) legR.current.rotation.x = seated ? -1.5 : -swing;
    // Au poste debout, les bras s'activent (manipulation machine).
    const work = !moving && !seated && !s.leaving ? Math.sin(t * 3 + s.phase) * 0.25 - 0.5 : 0;
    if (armL.current) armL.current.rotation.x = moving ? -swing : seated ? -0.6 : work;
    if (armR.current) armR.current.rotation.x = moving ? swing : seated ? -0.6 : -work * 0.6 - 0.3;
  });

  const skin = mat(SKIN[e.appearance.skin ?? 0] ?? SKIN[0], { roughness: 0.8 });
  const top = mat(look.top, { roughness: 0.85 });
  const bottom = mat(look.bottom, { roughness: 0.9 });
  const hair = mat(e.appearance.hairColor ?? "#2b2b2b", { roughness: 0.9 });
  const accent = look.accent ? mat(look.accent, { roughness: 0.6 }) : null;
  const ring = selected || hovered;

  return (
    <group
      ref={root}
      scale={SCALE}
      onClick={(ev) => {
        if (editMode) return;
        ev.stopPropagation();
        select(sel, { x: st.current.pos.x, y: 0, z: st.current.pos.z });
      }}
      onPointerOver={(ev) => {
        ev.stopPropagation();
        setHover(sel);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(null);
        document.body.style.cursor = "";
      }}
    >
      {ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.32, 0.42, 24]} />
          <meshStandardMaterial color="#ff6b2c" emissive="#ff6b2c" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      )}
      <group ref={body}>
        {[
          [legL, -0.1],
          [legR, 0.1],
        ].map(([ref, x], i) => (
          <group key={i} ref={ref as React.RefObject<Group>} position={[x as number, 0.82, 0]}>
            <mesh castShadow material={bottom} position={[0, -0.4, 0]}>
              <boxGeometry args={[0.16, 0.8, 0.18]} />
            </mesh>
          </group>
        ))}
        <mesh castShadow material={top} position={[0, 1.18, 0]}>
          <boxGeometry args={[0.46, 0.66, 0.26]} />
        </mesh>
        {accent && (
          <mesh material={accent} position={[0, 1.12, 0]}>
            <boxGeometry args={[0.47, 0.08, 0.27]} />
          </mesh>
        )}
        {look.badge && (
          <>
            <mesh material={mat("#ff6b2c", { roughness: 0.6 })} position={[0, 1.36, 0.135]}>
              <boxGeometry args={[0.2, 0.3, 0.01]} />
            </mesh>
            <mesh material={mat("#f8fafc", { emissive: "#f8fafc", emissiveIntensity: 0.4, roughness: 0.5 })} position={[0, 1.2, 0.145]}>
              <boxGeometry args={[0.16, 0.11, 0.015]} />
            </mesh>
          </>
        )}
        {[
          [armL, -0.3],
          [armR, 0.3],
        ].map(([ref, x], i) => (
          <group key={i} ref={ref as React.RefObject<Group>} position={[x as number, 1.46, 0]}>
            <mesh castShadow material={top} position={[0, -0.28, 0]}>
              <boxGeometry args={[0.12, 0.58, 0.14]} />
            </mesh>
            <mesh material={skin} position={[0, -0.6, 0]}>
              <sphereGeometry args={[0.065, 8, 6]} />
            </mesh>
          </group>
        ))}
        <mesh castShadow material={look.hood ? top : skin} position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.17, 14, 12]} />
        </mesh>
        {look.hood ? (
          <mesh material={mat("#93c5fd", { opacity: 0.7, roughness: 0.1 })} position={[0, 1.7, -0.13]}>
            <boxGeometry args={[0.22, 0.1, 0.04]} />
          </mesh>
        ) : (
          <mesh castShadow material={hair} position={[0, 1.79 + (e.appearance.hair ?? 0) * 0.005, 0.02]} scale={[1, 0.55 + (e.appearance.hair ?? 0) * 0.08, 1]}>
            <sphereGeometry args={[0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Équipe du site : chaque personne suit son état de présence (badges, agenda) en temps réel. */
export function People({ zones, objects, furniture }: { zones: MapZone[]; objects: MapObject[]; furniture: Map<string, Furniture[]> }) {
  const employees = useMap((s) => s.employees);
  const presence = useMap((s) => s.presence);
  const stations = useMemo(() => stationsFor(employees, zones, objects, furniture), [employees, zones, objects, furniture]);
  const entrance = useMemo(() => entranceOf(zones), [zones]);
  const breakSeats = useMemo(() => seatsInZoneType(zones, furniture, "break"), [zones, furniture]);
  const meetingSeats = useMemo(() => seatsInZoneType(zones, furniture, "meeting"), [zones, furniture]);

  const wanderByZone = useMemo(() => {
    const map = new Map<string, Vec3[]>();
    for (const o of objects) {
      if (o.type !== "machine" && o.type !== "equipment") continue;
      const { d } = footprint(o.kit);
      const list = map.get(o.zone_id ?? "") ?? [];
      list.push({ x: o.position.x + 0.8, y: 0, z: o.position.z + (d * o.scale) / 2 + 0.6 });
      map.set(o.zone_id ?? "", list);
    }
    return map;
  }, [objects]);

  let breakIdx = 0;
  let meetIdx = 0;
  return (
    <group>
      {employees.map((e) => {
        const station = stations.get(e.id);
        if (!station) return null;
        const status = presence[e.id]?.status ?? "absent";
        const zone = zones.find((z) => z.id === e.home_zone_id);
        const seatedAtStation = !(zone?.type === "production" || zone?.type === "restricted" || zone?.type === "hangar" || zone?.type === "post_processing" || zone?.type === "shipping");
        let target: Target = { pos: station, seated: seatedAtStation && zone?.type !== "cleanroom", visible: true };
        if (status === "on_break" && breakSeats.length) target = { pos: breakSeats[breakIdx++ % breakSeats.length], seated: true, visible: true };
        else if (status === "in_meeting" && meetingSeats.length) target = { pos: meetingSeats[meetIdx++ % meetingSeats.length], seated: true, visible: true };
        else if (status === "absent" || status === "remote" || status === "travel") target = { ...target, visible: false };
        const wander = !seatedAtStation ? (wanderByZone.get(e.home_zone_id ?? "") ?? []) : [];
        return <Person key={e.id} e={e} target={target} entrance={entrance} wander={wander} look={lookFor(e, zone?.type)} />;
      })}
    </group>
  );
}

const VISITOR_LOOK: Look = { top: "#2b3a55", bottom: "#1f2937", accent: "#e5e7eb", badge: true };

/**
 * Clients en visite : pendant un rendez-vous client de l'agenda, le contact du client arrive par
 * l'accueil, rejoint la salle de réunion et repart à la fin. Rien n'est inventé : sans rendez-vous,
 * personne n'apparaît.
 */
export function Visitors({ zones, furniture }: { zones: MapZone[]; furniture: Map<string, Furniture[]> }) {
  const visitors = useMap((s) => s.visitors);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const entrance = useMemo(() => entranceOf(zones), [zones]);
  // Places prises depuis la fin : les salariés en réunion occupent les premières.
  const seats = useMemo(() => {
    const meeting = seatsInZoneType(zones, furniture, "meeting");
    return (meeting.length ? meeting : seatsInZoneType(zones, furniture, "reception")).slice().reverse();
  }, [zones, furniture]);
  const present = useMemo(() => new Set(visitorsOnSite(visitors, now).map((v) => v.id)), [visitors, now]);
  if (!visitors.length) return null;
  const fallback = { x: entrance.x + 3, y: 0, z: entrance.z };
  return (
    <group>
      {visitors.map((v, i) => (
        <Person
          key={v.id}
          e={visitorAvatar(v)}
          target={{ pos: seats[i % Math.max(seats.length, 1)] ?? fallback, seated: seats.length > 0, visible: present.has(v.id) }}
          entrance={entrance}
          wander={[]}
          look={VISITOR_LOOK}
          sel={{ kind: "visitor", id: v.id }}
        />
      ))}
    </group>
  );
}

export { PRESENCE_LABEL };
