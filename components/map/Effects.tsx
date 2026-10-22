"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMap, type Effect } from "@/lib/map/store";

/** Onde au sol qui s'élargit et s'efface (signal d'un événement live). */
function Pulse({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: e.color, transparent: true, toneMapped: false, side: THREE.DoubleSide }), [e.color]);
  useFrame(() => {
    const t = (performance.now() - e.bornAt) / 1000;
    if (!ref.current) return;
    const k = (t % 1.6) / 1.6;
    ref.current.scale.setScalar(1 + k * 7);
    mat.opacity = (1 - k) * Math.max(0, 1 - t / 5);
  });
  return (
    <mesh ref={ref} material={mat} position={[e.position.x, 0.2, e.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1.05, 48]} />
    </mesh>
  );
}

/** Colonne lumineuse verte (validé) ou rouge (rejet, panne). */
function Beam({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }), [e.color]);
  useFrame(() => {
    const t = (performance.now() - e.bornAt) / 1000;
    if (!ref.current) return;
    ref.current.scale.y = Math.min(1, t * 2);
    mat.opacity = 0.55 * Math.max(0, 1 - t / 5) * (0.75 + Math.sin(t * 10) * 0.25);
  });
  return (
    <mesh ref={ref} material={mat} position={[e.position.x, 6, e.position.z]}>
      <cylinderGeometry args={[0.9, 1.4, 12, 24, 1, true]} />
    </mesh>
  );
}

/** Gerbe d'étincelles (pièce terminée). */
function Sparkle({ e }: { e: Effect }) {
  const ref = useRef<THREE.Points>(null);
  const { geom, vel } = useMemo(() => {
    const n = 70;
    const pos = new Float32Array(n * 3);
    const v: number[] = [];
    for (let i = 0; i < n; i++) {
      pos.set([0, 0, 0], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      v.push(Math.cos(a) * s, 4 + Math.random() * 4, Math.sin(a) * s);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geom: g, vel: v };
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: e.color, size: 0.35, transparent: true, toneMapped: false }), [e.color]);
  useFrame(() => {
    const t = (performance.now() - e.bornAt) / 1000;
    const p = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, vel[i * 3] * t, Math.max(0, vel[i * 3 + 1] * t - 4.9 * t * t) + 2.5, vel[i * 3 + 2] * t);
    }
    p.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - t / 2.5);
  });
  return <points ref={ref} geometry={geom} material={mat} position={[e.position.x, 0, e.position.z]} />;
}

export function Effects() {
  const effects = useMap((s) => s.effects);
  const prune = useMap((s) => s.pruneEffects);
  useFrame(() => prune(performance.now()));
  return (
    <group>
      {effects.map((e) => {
        if (e.kind === "pulse" || e.kind === "alert") return <Pulse key={e.id} e={e} />;
        if (e.kind === "halo_ok" || e.kind === "halo_ko") return <Beam key={e.id} e={e} />;
        if (e.kind === "sparkle")
          return (
            <group key={e.id}>
              <Sparkle e={e} />
              <Pulse e={e} />
            </group>
          );
        return null;
      })}
    </group>
  );
}
