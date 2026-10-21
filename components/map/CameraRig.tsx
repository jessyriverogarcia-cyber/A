"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useMap } from "@/lib/map/store";
import type { Rect } from "@/lib/map/layout";

/**
 * Caméra « jeu de gestion » : vue aérienne inclinée, survol d'introduction cinématique,
 * recentrage doux sur l'objet sélectionné.
 */
export function CameraRig({ bounds }: { bounds: Rect }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const focus = useMap((s) => s.focus);
  const dragging = useMap((s) => s.dragging);
  const [x1, z1, x2, z2] = bounds;
  const center = new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2);
  const size = Math.max(x2 - x1, z2 - z1);
  const home = useRef(new THREE.Vector3(center.x - size * 0.45, size * 0.72, center.z + size * 0.78));
  const intro = useRef({ t: 0, from: new THREE.Vector3(center.x - size * 1.4, size * 1.6, center.z + size * 1.9) });
  const goal = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    camera.position.copy(intro.current.from);
    camera.lookAt(center);
    intro.current.t = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x1, z1, x2, z2]);

  useEffect(() => {
    goal.current = focus ? new THREE.Vector3(focus.x, 0, focus.z) : null;
  }, [focus]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    // Introduction : descente en courbe vers la vue d'ensemble.
    if (intro.current.t < 1) {
      intro.current.t = Math.min(1, intro.current.t + dt / 3.2);
      const k = 1 - Math.pow(1 - intro.current.t, 3);
      camera.position.lerpVectors(intro.current.from, home.current, k);
      c.target.lerp(center, 0.2);
      c.update();
      return;
    }
    if (goal.current) {
      const before = c.target.clone();
      c.target.lerp(goal.current, Math.min(1, dt * 3));
      camera.position.add(c.target.clone().sub(before));
      if (c.target.distanceTo(goal.current) < 0.05) goal.current = null;
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.25}
      maxPolarAngle={1.12}
      minDistance={12}
      maxDistance={size * 2.2}
      screenSpacePanning={false}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
}
