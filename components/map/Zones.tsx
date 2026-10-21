"use client";

import { mat } from "./materials";
import { WALL, WALL_TOP, ZONE_FLOOR } from "@/lib/map/theme";
import { rectOf, type Furniture } from "@/lib/map/layout";
import type { MapZone } from "@/lib/map/types";
import { useMap } from "@/lib/map/store";
import { FurniturePiece } from "./kits/Equipment";
import { HangarArches, OutdoorZone } from "./Environment";

const WALL_H = 1.5;
const T = 0.18;
const wallMat = mat(WALL, { roughness: 0.85 });
const capMat = mat(WALL_TOP, { roughness: 0.6 });
const glassWall = mat("#cfe8f5", { opacity: 0.35, roughness: 0.05 });
const hazard = mat("#facc15", { roughness: 0.6 });

function Wall({ x, z, w, d, glass, h = WALL_H }: { x: number; z: number; w: number; d: number; glass?: boolean; h?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow={!glass} receiveShadow material={glass ? glassWall : wallMat} position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh material={capMat} position={[0, h + 0.02, 0]}>
        <boxGeometry args={[w + 0.01, 0.04, d + 0.01]} />
      </mesh>
    </group>
  );
}

/** Murs coupés à mi-hauteur, avec une ouverture (porte) sur chaque côté long. */
function ZoneWalls({ zone }: { zone: MapZone }) {
  const [x1, z1, x2, z2] = rectOf(zone);
  const glass = zone.type === "cleanroom" || zone.type === "quality" || zone.type === "meeting";
  const h = zone.type === "hangar" ? 2.4 : WALL_H;
  const door = 1.8;
  const w = x2 - x1;
  const d = z2 - z1;
  const seg = (a: number, b: number, horiz: boolean, at: number) => {
    const len = (b - a - door) / 2;
    return [
      horiz ? <Wall key={`${at}a`} x={a + len / 2} z={at} w={len} d={T} glass={glass} h={h} /> : <Wall key={`${at}a`} x={at} z={a + len / 2} w={T} d={len} glass={glass} h={h} />,
      horiz ? <Wall key={`${at}b`} x={b - len / 2} z={at} w={len} d={T} glass={glass} h={h} /> : <Wall key={`${at}b`} x={at} z={b - len / 2} w={T} d={len} glass={glass} h={h} />,
    ];
  };
  return (
    <group>
      {w >= d ? [...seg(x1, x2, true, z1), ...seg(x1, x2, true, z2)] : [<Wall key="n" x={(x1 + x2) / 2} z={z1} w={w} d={T} glass={glass} h={h} />, <Wall key="s" x={(x1 + x2) / 2} z={z2} w={w} d={T} glass={glass} h={h} />]}
      {d > w ? [...seg(z1, z2, false, x1), ...seg(z1, z2, false, x2)] : [<Wall key="w" x={x1} z={(z1 + z2) / 2} w={T} d={d} glass={glass} h={h} />, <Wall key="e" x={x2} z={(z1 + z2) / 2} w={T} d={d} glass={glass} h={h} />]}
    </group>
  );
}

export function Zones({ zones, furniture }: { zones: MapZone[]; furniture: Map<string, Furniture[]> }) {
  const select = useMap((s) => s.select);
  const editMode = useMap((s) => s.editMode);
  return (
    <group>
      <HangarArches zones={zones} />
      {zones.map((zone) => {
        if (zone.outdoor) return <OutdoorZone key={zone.id} zone={zone} />;
        const [x1, z1, x2, z2] = rectOf(zone);
        return (
          <group key={zone.id}>
            <mesh
              receiveShadow
              userData={{ noMerge: true }}
              position={[(x1 + x2) / 2, 0.06, (z1 + z2) / 2]}
              material={mat(ZONE_FLOOR[zone.type] ?? "#d4d4d8", { roughness: zone.type === "office" || zone.type === "meeting" ? 0.75 : 0.55 })}
              onClick={(e) => {
                if (editMode) return;
                e.stopPropagation();
                select({ kind: "zone", id: zone.id });
              }}
            >
              <boxGeometry args={[x2 - x1, 0.12, z2 - z1]} />
            </mesh>
            {zone.type === "restricted" && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x1 + x2) / 2, 0.125, (z1 + z2) / 2]} material={hazard}>
                <ringGeometry args={[Math.min(x2 - x1, z2 - z1) / 2 - 0.6, Math.min(x2 - x1, z2 - z1) / 2 - 0.3, 4, 1, Math.PI / 4]} />
              </mesh>
            )}
            {(zone.type === "production" || zone.type === "hangar") && (
              <gridHelper args={[Math.max(x2 - x1, z2 - z1), Math.floor(Math.max(x2 - x1, z2 - z1) / 2), "#b6bbc3", "#c5c9cf"]} position={[(x1 + x2) / 2, 0.125, (z1 + z2) / 2]} scale={[(x2 - x1) / Math.max(x2 - x1, z2 - z1), 1, (z2 - z1) / Math.max(x2 - x1, z2 - z1)]} />
            )}
            <ZoneWalls zone={zone} />
            {(furniture.get(zone.id) ?? []).map((f, i) => (
              <group key={i} position={[f.position.x, 0.12, f.position.z]} rotation={[0, f.rotation, 0]}>
                <FurniturePiece kind={f.kind} />
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}
