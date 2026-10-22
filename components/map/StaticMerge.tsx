"use client";

import { useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Fusionne les meshes statiques d'un sous-arbre en un mesh par matériau (quelques appels de
 * dessin au lieu de centaines). Les meshes marqués userData.noMerge (sols cliquables, eau animée)
 * restent intacts. À recalculer quand `version` change (plan modifié).
 */
export function StaticMerge({ children, version }: { children: React.ReactNode; version: string | number }) {
  const ref = useRef<THREE.Group>(null);
  const [merged, setMerged] = useState<THREE.Mesh[]>([]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
    const sources: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.noMerge || Array.isArray(m.material)) return;
      let skip = false;
      for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) if (p.userData.noMerge) skip = true;
      if (skip) return;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(inv.clone().multiply(m.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      const entry = groups.get(m.material) ?? { geos: [], cast: false };
      entry.geos.push(g);
      entry.cast ||= m.castShadow;
      groups.set(m.material, entry);
      sources.push(m);
    });
    const out: THREE.Mesh[] = [];
    for (const [material, { geos, cast }] of groups) {
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.raycast = () => {}; // décor : jamais cliquable
      out.push(mesh);
    }
    sources.forEach((m) => (m.visible = false));
    setMerged(out);
    return () => {
      sources.forEach((m) => (m.visible = true));
      out.forEach((m) => m.geometry.dispose());
    };
  }, [version]);

  return (
    <>
      <group ref={ref}>{children}</group>
      {merged.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}
