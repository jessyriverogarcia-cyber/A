"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { M, glow, mat } from "../materials";
import { STATUS_COLOR } from "@/lib/map/theme";

export interface KitProps {
  status: string;
  /** Avancement du dossier en cours sur la machine (0–100), pour faire « grandir » la pièce. */
  progress?: number;
  seed?: number;
}

const running = (s: string) => s === "running";

/** Lampe d'état sur mât (vert / orange / rouge), clignote si panne. */
export function StatusLamp({ status, y, x = 0, z = 0 }: { status: string; y: number; x?: number; z?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const blink = status === "down" ? (Math.sin(clock.elapsedTime * 8) > 0 ? 1 : 0.15) : status === "maintenance" ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 3) : 1;
    ref.current.scale.setScalar(0.8 + 0.2 * blink);
    (ref.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = 2.5 * blink;
  });
  return (
    <group position={[x, y, z]}>
      <mesh material={M.darkSteel} position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.3]} />
      </mesh>
      <mesh ref={ref}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color={STATUS_COLOR[status] ?? "#94a3b8"} emissive={STATUS_COLOR[status] ?? "#94a3b8"} emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Imprimante FDM grand volume : châssis ouvert, tête qui balaie, pièce qui monte. */
export function PrinterFDM({ status, progress = 40, seed = 0 }: KitProps) {
  const head = useRef<Group>(null);
  const part = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const on = running(status);
    const h = 0.05 + (Math.min(progress, 100) / 100) * 0.7;
    if (head.current) {
      head.current.position.x = on ? Math.sin(t * 2.3) * 0.55 : 0;
      head.current.position.z = on ? Math.cos(t * 1.7) * 0.5 : 0;
      head.current.position.y = 0.75 + h + 0.12;
    }
    if (part.current) {
      part.current.scale.y = h + (on ? (Math.sin(t * 0.5) + 1) * 0.004 : 0);
      part.current.position.y = 0.75 + part.current.scale.y / 2;
    }
  });
  return (
    <group>
      <mesh castShadow receiveShadow material={M.anthracite} position={[0, 0.3, 0]}>
        <boxGeometry args={[2.2, 0.6, 2.2]} />
      </mesh>
      <mesh material={M.screen} position={[0.7, 0.42, 1.11]}>
        <boxGeometry args={[0.4, 0.25, 0.02]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} castShadow material={M.steel} position={[sx * 1.02, 1.4, sz * 1.02]}>
            <boxGeometry args={[0.08, 1.6, 0.08]} />
          </mesh>
        )),
      )}
      <mesh castShadow material={M.steel} position={[0, 2.22, 0]}>
        <boxGeometry args={[2.2, 0.08, 2.2]} />
      </mesh>
      <mesh material={M.darkSteel} position={[0, 0.66, 0]}>
        <boxGeometry args={[1.7, 0.06, 1.7]} />
      </mesh>
      <mesh ref={part} castShadow material={mat("#ff6b2c", { roughness: 0.45 })} position={[0, 0.9, 0]}>
        <boxGeometry args={[0.7, 1, 0.5]} />
      </mesh>
      <group ref={head}>
        <mesh castShadow material={M.yellow}>
          <boxGeometry args={[0.22, 0.2, 0.22]} />
        </mesh>
        <mesh material={glow("#ffb347", running(status) ? 2 : 0)} position={[0, -0.13, 0]}>
          <coneGeometry args={[0.04, 0.08, 8]} />
        </mesh>
      </group>
      <mesh material={M.glass} position={[0, 1.42, 0]}>
        <boxGeometry args={[2.1, 1.55, 2.1]} />
      </mesh>
      <StatusLamp status={status} y={2.6} x={0.95} z={0.95} />
    </group>
  );
}

/** Imprimante SLA : capot ambré, plateau qui remonte de la cuve, lueur UV. */
export function PrinterSLA({ status, seed = 0 }: KitProps) {
  const plate = useRef<Mesh>(null);
  const uv = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const on = running(status);
    if (plate.current) plate.current.position.y = 0.95 + (on ? 0.25 + Math.sin(t * 0.8) * 0.2 : 0.55);
    if (uv.current) (uv.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = on ? 2.5 + Math.sin(t * 25) * 1.2 : 0;
  });
  return (
    <group>
      <mesh castShadow receiveShadow material={M.white} position={[0, 0.45, 0]}>
        <boxGeometry args={[1.5, 0.9, 1.5]} />
      </mesh>
      <mesh material={M.screen} position={[0, 0.65, 0.76]}>
        <boxGeometry args={[0.45, 0.3, 0.02]} />
      </mesh>
      <mesh material={M.darkSteel} position={[0, 0.96, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.7]} />
      </mesh>
      <mesh ref={uv} position={[0, 0.93, 0]}>
        <boxGeometry args={[0.7, 0.02, 0.6]} />
        <meshStandardMaterial color="#7c3aed" emissive="#8b5cf6" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh castShadow material={M.steel} position={[0, 1.4, -0.45]}>
        <boxGeometry args={[0.1, 1, 0.1]} />
      </mesh>
      <mesh ref={plate} material={M.steel}>
        <boxGeometry args={[0.6, 0.05, 0.5]} />
      </mesh>
      <mesh material={M.amberGlass} position={[0, 1.4, 0]}>
        <boxGeometry args={[1.3, 0.95, 1.3]} />
      </mesh>
      <StatusLamp status={status} y={2.15} x={0.6} z={0.6} />
    </group>
  );
}

/** Imprimante SLS : machine fermée, hublot qui rougeoie, racleur de poudre. */
export function PrinterSLS({ status, seed = 0 }: KitProps) {
  const win = useRef<Mesh>(null);
  const recoater = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const on = running(status);
    if (win.current) (win.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = on ? 1.6 + Math.sin(t * 2) * 0.5 : 0.05;
    if (recoater.current) recoater.current.position.x = on ? Math.sin(t * 1.2) * 0.5 : -0.5;
  });
  return (
    <group>
      <mesh castShadow receiveShadow material={M.offWhite} position={[0, 1.05, 0]}>
        <boxGeometry args={[3, 2.1, 2.4]} />
      </mesh>
      <mesh material={M.anthracite} position={[0, 2.15, 0]}>
        <boxGeometry args={[3.05, 0.1, 2.45]} />
      </mesh>
      <mesh ref={win} position={[-0.3, 1.25, 1.21]}>
        <boxGeometry args={[1.3, 0.7, 0.02]} />
        <meshStandardMaterial color="#7a2e0e" emissive="#ff5a1f" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh ref={recoater} material={M.steel} position={[0, 1.02, 1.23]}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
      </mesh>
      <mesh material={M.screen} position={[1.05, 1.4, 1.21]}>
        <boxGeometry args={[0.45, 0.32, 0.02]} />
      </mesh>
      <mesh material={M.darkSteel} position={[1.1, 2.4, -0.7]}>
        <cylinderGeometry args={[0.18, 0.18, 0.5, 12]} />
      </mesh>
      <StatusLamp status={status} y={2.55} x={1.3} z={1} />
    </group>
  );
}

/** Imprimante métal SLM : enceinte anthracite, spot laser au hublot, bouteilles d'argon. */
export function PrinterMetal({ status, seed = 0 }: KitProps) {
  const laser = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 3 + seed;
    const on = running(status);
    if (laser.current) {
      laser.current.visible = on;
      laser.current.position.x = Math.sin(t * 2.1) * 0.35;
      laser.current.position.y = 1.25 + Math.sin(t * 3.7) * 0.18;
    }
    if (flash.current) (flash.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = on ? 0.4 + Math.random() * 0.5 : 0;
  });
  return (
    <group>
      <mesh castShadow receiveShadow material={M.anthracite} position={[0, 1.15, 0]}>
        <boxGeometry args={[2.6, 2.3, 2.4]} />
      </mesh>
      <mesh material={M.orange} position={[0, 2.32, 0]}>
        <boxGeometry args={[2.62, 0.06, 2.42]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={M.steel} position={[0, 1.25, 1.2]}>
        <torusGeometry args={[0.48, 0.06, 10, 28]} />
      </mesh>
      <mesh ref={flash} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.25, 1.19]}>
        <circleGeometry args={[0.46, 28]} />
        <meshStandardMaterial color="#1a1206" emissive="#ffcf70" emissiveIntensity={0.5} transparent opacity={0.85} />
      </mesh>
      <mesh ref={laser} position={[0, 1.25, 1.22]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#fff6d6" emissive="#fff1b8" emissiveIntensity={12} toneMapped={false} />
      </mesh>
      <mesh material={M.screen} position={[0.95, 1.6, 1.21]}>
        <boxGeometry args={[0.4, 0.3, 0.02]} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} castShadow material={mat("#2f6fb0", { metalness: 0.5, roughness: 0.4 })} position={[1.55, 0.7, -0.6 + i * 0.4]}>
          <cylinderGeometry args={[0.13, 0.13, 1.4, 12]} />
        </mesh>
      ))}
      <StatusLamp status={status} y={2.65} x={1.1} z={1} />
    </group>
  );
}
