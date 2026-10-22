"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { M, glow } from "../materials";
import { StatusLamp } from "./Printers";
import { Aircraft } from "./Aircraft";
import type { AircraftModel } from "@/lib/map/types";

/**
 * Portique d'impression grand format (22 × 12 m) : tours sur rails, pont, tête d'extrusion.
 * Sous le portique, l'appareil du dossier en cours « grandit » selon l'avancement.
 */
export function Gantry({ status, progress = 0, model, seed = 0 }: { status: string; progress?: number; model?: AircraftModel; seed?: number }) {
  const bridge = useRef<Group>(null);
  const head = useRef<Group>(null);
  const on = status === "running";
  const build = Math.max(0.1, Math.min(progress, 100) / 100);
  const headX = -9 + build * 18;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    if (bridge.current) bridge.current.position.x = on ? headX + Math.sin(t * 0.6) * 1.2 : headX;
    if (head.current) head.current.position.z = on ? Math.sin(t * 1.4) * 3.2 : 0;
  });

  return (
    <group>
      {/* Plateau et rails */}
      <mesh receiveShadow material={M.darkSteel} position={[0, 0.08, 0]}>
        <boxGeometry args={[20, 0.16, 8.5]} />
      </mesh>
      {[-5.6, 5.6].map((z) => (
        <mesh key={z} receiveShadow castShadow material={M.steel} position={[0, 0.2, z]}>
          <boxGeometry args={[22, 0.4, 0.45]} />
        </mesh>
      ))}
      {/* Pièce en cours */}
      <group position={[0, 0.16, 0]} scale={0.62}>
        {model ? (
          <Aircraft model={model} build={build} />
        ) : (
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-9 + build * 9, 2.4, 0]} material={M.white}>
            <cylinderGeometry args={[2, 2, build * 18, 24]} />
          </mesh>
        )}
      </group>
      {/* Pont mobile */}
      <group ref={bridge}>
        {[-5.6, 5.6].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh castShadow material={M.yellow} position={[0, 3.9, 0]}>
              <boxGeometry args={[0.8, 7, 0.8]} />
            </mesh>
            <mesh material={M.darkSteel} position={[0, 0.55, 0]}>
              <boxGeometry args={[1.6, 0.5, 1]} />
            </mesh>
          </group>
        ))}
        <mesh castShadow material={M.yellow} position={[0, 7.5, 0]}>
          <boxGeometry args={[1, 0.9, 12.2]} />
        </mesh>
        <mesh material={M.black} position={[0.52, 7.5, 0]}>
          <boxGeometry args={[0.04, 0.25, 11.6]} />
        </mesh>
        <group ref={head} position={[0, 6.4, 0]}>
          <mesh castShadow material={M.anthracite}>
            <boxGeometry args={[1.2, 1.4, 1.2]} />
          </mesh>
          <mesh position={[0, -1.4, 0]} material={M.steel}>
            <cylinderGeometry args={[0.12, 0.06, 1.6]} />
          </mesh>
          <mesh position={[0, -2.25, 0]} material={glow("#ffb347", on ? 6 : 0)}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
      </group>
      <StatusLamp status={status} y={8.4} x={10.6} z={5.6} />
      {/* Armoire de commande */}
      <mesh castShadow material={M.anthracite} position={[10.4, 1, -6.6]}>
        <boxGeometry args={[1, 2, 0.8]} />
      </mesh>
      <mesh material={M.screen} position={[10.4, 1.3, -6.19]}>
        <boxGeometry args={[0.6, 0.45, 0.02]} />
      </mesh>
    </group>
  );
}
