"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useMap } from "@/lib/map/store";
import { boundsOf, furnitureFor, objectRect, rectOf, type Furniture } from "@/lib/map/layout";
import { CameraRig } from "./CameraRig";
import { Plinth, Truck } from "./Environment";
import { Zones } from "./Zones";
import { StaticMerge } from "./StaticMerge";
import { AircraftFleet, DepartingTruck, MapObjects } from "./Objects";
import { People, Visitors } from "./People";
import { Effects } from "./Effects";
import { LabelProjector } from "./hud/Labels";
import { livePositions } from "@/lib/map/labels";
import { visitorsOnSite } from "@/lib/map/visitors";
import { DayNight, daylight } from "./DayNight";
import { NightLights } from "./NightLights";

const snap = (v: number) => Math.round(v * 2) / 2;

/** Plan invisible qui reçoit le glisser-déposer du mode édition. */
function DragPlane() {
  const dragging = useMap((s) => s.dragging);
  const { moveDraft, setDragging } = useMap.getState();
  return (
    <mesh
      visible={false}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.12, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging) return;
        e.stopPropagation();
        moveDraft(dragging, { x: snap(e.point.x), y: 0, z: snap(e.point.z) });
      }}
      onPointerUp={() => dragging && setDragging(null)}
    >
      <planeGeometry args={[2000, 2000]} />
    </mesh>
  );
}

/** Aide aux tests de bout en bout (mode démo) : projette un point 3D en coordonnées écran. */
function TestProbe() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return;
    const w = window as unknown as { __mapProbe?: unknown };
    w.__mapProbe = {
      project: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
      },
      stats: () => {
        let meshes = 0;
        scene.traverseVisible((o) => {
          if ((o as THREE.Mesh).isMesh) meshes++;
        });
        return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, meshes };
      },
      daylight: () => ({ ...daylight }),
      visitors: () =>
        visitorsOnSite(useMap.getState().visitors, Date.now()).map((v) => ({ id: v.id, client: v.client_name, pos: livePositions.get(`visitor:${v.id}`) ?? null })),
      objects: () => Object.values(useMap.getState().objects).map((o) => ({ id: o.id, kit: o.kit, entity: o.entity_id, ...o.position })),
    };
  }, [camera, size, gl, scene]);
  return null;
}

/** Mesure des images par seconde (affichée dans le HUD) et bascule auto en qualité rapide. */
function FpsMeter() {
  const acc = useRef({ frames: 0, t: performance.now(), slow: 0 });
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    const now = performance.now();
    if (now - a.t >= 1000) {
      const fps = Math.round((a.frames * 1000) / (now - a.t));
      const st = useMap.getState();
      st.setFps(fps);
      // 5 secondes d'affilée sous 30 i/s en qualité cinéma : on allège (ombres, bloom, résolution).
      a.slow = fps < 30 && st.quality === "high" ? a.slow + 1 : 0;
      if (a.slow >= 5 && !st.qualityLocked) {
        st.setQuality("low");
        a.slow = 0;
      }
      a.frames = 0;
      a.t = now;
    }
  });
  return null;
}

function DockTruck() {
  const zones = useMap((s) => s.zones);
  const departing = useMap((s) => s.effects.some((e) => e.kind === "depart"));
  const dock = zones.find((z) => z.type === "dock");
  if (!dock || departing) return null;
  const [, z1, x2, z2] = rectOf(dock);
  return (
    <group position={[x2 + 4, 0.12, (z1 + z2) / 2]} rotation={[0, Math.PI / 2, 0]}>
      <Truck />
    </group>
  );
}

function World() {
  const zones = useMap((s) => s.zones);
  const objectsById = useMap((s) => s.objects);
  const editMode = useMap((s) => s.editMode);
  const objects = useMemo(() => Object.values(objectsById), [objectsById]);
  const bounds = useMemo(() => boundsOf(zones), [zones]);

  // Le mobilier évite les machines déjà placées ; recalculé seulement quand le plan change.
  const furniture = useMemo(() => {
    const m = new Map<string, Furniture[]>();
    for (const z of zones) if (!z.outdoor) m.set(z.id, furnitureFor(z, objects.filter((o) => o.zone_id === z.id).map(objectRect)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, objects.length]);

  return (
    <>
      <CameraRig bounds={bounds} />
      <StaticMerge version={`${zones.map((z) => z.id).join()}|${objects.length}`}>
        <Plinth bounds={bounds} />
        <Zones zones={zones} furniture={furniture} />
      </StaticMerge>
      <NightLights zones={zones} bounds={bounds} />
      <MapObjects objects={objects} />
      <People zones={zones} objects={objects} furniture={furniture} />
      <Visitors zones={zones} furniture={furniture} />
      <AircraftFleet />
      <DockTruck />
      <DepartingTruck />
      <Effects />
      <TestProbe />
      <FpsMeter />
      <LabelProjector />
      {editMode && <DragPlane />}
      {editMode && <gridHelper args={[400, 400, "#38bdf8", "#7dd3fc"]} position={[(bounds[0] + bounds[2]) / 2, 0.13, (bounds[1] + bounds[3]) / 2]} />}
    </>
  );
}

export default function Scene() {
  const quality = useMap((s) => s.quality);
  const select = useMap((s) => s.select);
  const editMode = useMap((s) => s.editMode);
  const zones = useMap((s) => s.zones);
  const bounds = useMemo(() => boundsOf(zones), [zones]);
  const size = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const cx = (bounds[0] + bounds[2]) / 2;
  const cz = (bounds[1] + bounds[3]) / 2;
  const high = quality === "high";

  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 2] : 1}
      camera={{ fov: 32, near: 1, far: size * 8, position: [cx, size, cz + size] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => !editMode && select(null, null)}
      data-testid="map-canvas"
    >
      <DayNight cx={cx} cz={cz} size={size} shadows={high} />
      <World />
      {high && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.25} darkness={0.45} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
