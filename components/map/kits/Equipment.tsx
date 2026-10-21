"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { M, glow, mat } from "../materials";
import { StatusLamp } from "./Printers";
import type { FurnitureKind } from "@/lib/map/layout";

/** Équipements d'atelier : variante visuelle lue dans assets.specs.visual. */
export function Equipment({ visual, status }: { visual?: string; status: string }) {
  const spin = useRef<Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.x += dt * 0.6;
  });

  switch (visual) {
    case "oven":
    case "oven_uv":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.offWhite} position={[0, 0.9, 0]}>
            <boxGeometry args={[2.2, 1.8, 1.8]} />
          </mesh>
          <mesh position={[0, 1, 0.91]}>
            <boxGeometry args={[1.3, 0.8, 0.02]} />
            <meshStandardMaterial color="#2a1406" emissive={visual === "oven_uv" ? "#8b5cf6" : "#ff6a1a"} emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          <StatusLamp status="running" y={2.1} x={0.9} z={0.7} />
        </group>
      );
    case "glovebox":
    case "blast":
      return (
        <group>
          <mesh castShadow material={M.steel} position={[0, 0.5, 0]}>
            <boxGeometry args={[2.2, 1, 1.6]} />
          </mesh>
          <mesh material={M.glass} position={[0, 1.45, 0]}>
            <boxGeometry args={[2.1, 0.9, 1.5]} />
          </mesh>
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} rotation={[Math.PI / 2, 0, 0]} material={M.rubber} position={[x, 1.3, 0.76]}>
              <torusGeometry args={[0.16, 0.05, 8, 16]} />
            </mesh>
          ))}
          {visual === "blast" && (
            <mesh material={M.darkSteel} position={[0.9, 2.2, -0.5]}>
              <cylinderGeometry args={[0.2, 0.2, 0.6, 12]} />
            </mesh>
          )}
        </group>
      );
    case "safety_cabinet":
      return (
        <group>
          <mesh castShadow material={mat("#f5c400", { roughness: 0.5 })} position={[0, 1, 0]}>
            <boxGeometry args={[1.4, 2, 0.8]} />
          </mesh>
          <mesh material={M.black} position={[0, 1.35, 0.41]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.32, 0.32, 0.01]} />
          </mesh>
          <mesh material={glow("#ef4444", 1.5)} position={[0, 2.08, 0]}>
            <boxGeometry args={[0.3, 0.08, 0.3]} />
          </mesh>
        </group>
      );
    case "cmm":
      return (
        <group>
          <mesh castShadow receiveShadow material={mat("#3d3f44", { roughness: 0.35 })} position={[0, 0.45, 0]}>
            <boxGeometry args={[2.2, 0.9, 1.8]} />
          </mesh>
          {[-0.95, 0.95].map((x) => (
            <mesh key={x} castShadow material={M.steel} position={[x, 1.35, 0]}>
              <boxGeometry args={[0.12, 0.9, 0.12]} />
            </mesh>
          ))}
          <mesh castShadow material={M.steel} position={[0, 1.85, 0]}>
            <boxGeometry args={[2.1, 0.14, 0.18]} />
          </mesh>
          <mesh material={glow("#38bdf8", 2)} position={[0.2, 1.3, 0]}>
            <sphereGeometry args={[0.05]} />
          </mesh>
        </group>
      );
    case "scanner":
      return (
        <group>
          <mesh material={M.darkSteel} position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.4]} />
          </mesh>
          <mesh castShadow material={M.anthracite} position={[0, 1.45, 0]}>
            <boxGeometry args={[0.6, 0.18, 0.2]} />
          </mesh>
          <mesh material={glow("#60a5fa", 3)} position={[0, 1.45, 0.11]}>
            <boxGeometry args={[0.45, 0.04, 0.01]} />
          </mesh>
          <mesh material={M.steel} position={[0, 0.4, 0.9]}>
            <cylinderGeometry args={[0.45, 0.45, 0.8, 20]} />
          </mesh>
        </group>
      );
    case "ct":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.offWhite} position={[0, 0.6, 0]}>
            <boxGeometry args={[2.4, 1.2, 2]} />
          </mesh>
          <group ref={spin} position={[0, 1.9, 0]}>
            <mesh castShadow rotation={[0, Math.PI / 2, 0]} material={M.white}>
              <torusGeometry args={[0.9, 0.22, 12, 32]} />
            </mesh>
          </group>
          <mesh material={glow("#22d3ee", 2)} position={[0, 1.9, 0]}>
            <boxGeometry args={[0.04, 1.4, 0.04]} />
          </mesh>
          <StatusLamp status={status} y={2.9} x={1} z={0.8} />
        </group>
      );
    default:
      return (
        <group>
          <mesh castShadow receiveShadow material={M.offWhite} position={[0, 0.8, 0]}>
            <boxGeometry args={[2.2, 1.6, 1.8]} />
          </mesh>
          <StatusLamp status={status} y={1.9} x={0.9} z={0.7} />
        </group>
      );
  }
}

export function Workstation() {
  return (
    <group>
      <mesh castShadow receiveShadow material={M.wood} position={[0, 0.74, 0]}>
        <boxGeometry args={[1.8, 0.05, 0.8]} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} material={M.darkSteel} position={[x, 0.37, 0]}>
          <boxGeometry args={[0.05, 0.74, 0.7]} />
        </mesh>
      ))}
      {[-0.32, 0.32].map((x) => (
        <group key={x} position={[x, 1.05, -0.2]} rotation={[0, -x * 0.5, 0]}>
          <mesh material={M.black}>
            <boxGeometry args={[0.58, 0.36, 0.03]} />
          </mesh>
          <mesh material={M.screen} position={[0, 0, 0.017]}>
            <planeGeometry args={[0.54, 0.32]} />
          </mesh>
        </group>
      ))}
      <Chair position={[0, 0, 0.75]} />
    </group>
  );
}

export function Chair({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow material={M.fabric} position={[0, 0.48, 0]}>
        <boxGeometry args={[0.48, 0.08, 0.48]} />
      </mesh>
      <mesh castShadow material={M.fabric} position={[0, 0.8, 0.22]}>
        <boxGeometry args={[0.46, 0.55, 0.06]} />
      </mesh>
      <mesh material={M.darkSteel} position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.2, 0.48, 6]} />
      </mesh>
    </group>
  );
}

export function BadgeReader() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 2) * 0.8;
  });
  return (
    <group>
      <mesh castShadow material={M.anthracite} position={[0, 0.6, 0]}>
        <boxGeometry args={[0.22, 1.2, 0.14]} />
      </mesh>
      <mesh ref={ref} position={[0, 1.02, 0.075]}>
        <boxGeometry args={[0.14, 0.14, 0.01]} />
        <meshStandardMaterial color="#16a34a" emissive="#22c55e" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Écran de la salle de réunion (la table vient du mobilier de zone). */
export function RoomDisplay() {
  return (
    <group>
      <mesh castShadow material={M.black} position={[0, 1.4, 0]}>
        <boxGeometry args={[2.2, 1.25, 0.08]} />
      </mesh>
      <mesh position={[0, 1.4, 0.05]}>
        <planeGeometry args={[2.05, 1.12]} />
        <meshStandardMaterial color="#0b3b66" emissive="#1e88e5" emissiveIntensity={0.9} />
      </mesh>
      <mesh material={M.darkSteel} position={[0, 0.4, 0]}>
        <boxGeometry args={[0.1, 0.8, 0.1]} />
      </mesh>
    </group>
  );
}

const CATEGORY_LOOK: Record<string, { color: string; shape: "spool" | "bottle" | "drum" | "box" }> = {
  filament: { color: "#ff6b2c", shape: "spool" },
  resin: { color: "#8b5cf6", shape: "bottle" },
  powder_polymer: { color: "#e5e7eb", shape: "drum" },
  powder_metal: { color: "#64748b", shape: "drum" },
  gas: { color: "#2f6fb0", shape: "bottle" },
  finished_part: { color: "#c7a27a", shape: "box" },
};

/** Rayonnage : son remplissage suit la quantité réelle ; clignote en orange sous le minimum. */
export function Rack({ category, fill, low }: { category: string; fill: number; low: boolean }) {
  const lamp = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (lamp.current) {
      lamp.current.visible = low;
      (lamp.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = Math.sin(clock.elapsedTime * 6) > 0 ? 4 : 0.3;
    }
  });
  const look = CATEGORY_LOOK[category] ?? CATEGORY_LOOK.finished_part;
  const slots = 12;
  const count = Math.max(1, Math.round(Math.min(1, fill) * slots));
  const itemMat = mat(look.color, { roughness: 0.55, metalness: look.shape === "drum" ? 0.4 : 0.1 });
  return (
    <group>
      {[0.12, 0.85, 1.58].map((y) => (
        <mesh key={y} receiveShadow castShadow material={M.steel} position={[0, y, 0]}>
          <boxGeometry args={[2, 0.04, 0.8]} />
        </mesh>
      ))}
      {[-0.98, 0.98].flatMap((x) =>
        [-0.38, 0.38].map((z) => (
          <mesh key={`${x}${z}`} material={mat("#1d4ed8", { metalness: 0.4 })} position={[x, 1.1, z]}>
            <boxGeometry args={[0.05, 2.2, 0.05]} />
          </mesh>
        )),
      )}
      {Array.from({ length: count }, (_, i) => {
        const shelf = Math.floor(i / 4);
        const x = -0.7 + (i % 4) * 0.47;
        const y = [0.14, 0.87, 1.6][shelf];
        return (
          <mesh key={i} castShadow material={itemMat} position={[x, y + 0.2, 0]} rotation={look.shape === "spool" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
            {look.shape === "spool" ? (
              <cylinderGeometry args={[0.19, 0.19, 0.12, 14]} />
            ) : look.shape === "bottle" ? (
              <cylinderGeometry args={[0.11, 0.13, 0.4, 10]} />
            ) : look.shape === "drum" ? (
              <cylinderGeometry args={[0.18, 0.18, 0.4, 14]} />
            ) : (
              <boxGeometry args={[0.4, 0.36, 0.5]} />
            )}
          </mesh>
        );
      })}
      <mesh ref={lamp} position={[0.9, 2.3, 0.35]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={3} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Mobilier décoratif généré par type de zone. */
export function FurniturePiece({ kind }: { kind: FurnitureKind }) {
  switch (kind) {
    case "desk":
      return <Workstation />;
    case "meeting_table":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.darkWood} position={[0, 0.74, 0]}>
            <boxGeometry args={[6, 0.06, 1.5]} />
          </mesh>
          <mesh material={M.darkSteel} position={[0, 0.37, 0]}>
            <boxGeometry args={[4, 0.7, 0.3]} />
          </mesh>
          {Array.from({ length: 4 }, (_, i) => -2.4 + i * 1.6).flatMap((x) => [
            <Chair key={`a${x}`} position={[x, 0, -1.05]} />,
            <group key={`b${x}`} rotation={[0, Math.PI, 0]}>
              <Chair position={[-x, 0, -1.05]} />
            </group>,
          ])}
        </group>
      );
    case "break_table":
      return (
        <group>
          <mesh castShadow material={M.wood} position={[0, 0.74, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 20]} />
          </mesh>
          <mesh material={M.darkSteel} position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.05, 0.25, 0.74, 10]} />
          </mesh>
        </group>
      );
    case "coffee":
      return (
        <group>
          <mesh castShadow material={M.anthracite} position={[0, 0.5, 0]}>
            <boxGeometry args={[1.4, 1, 0.6]} />
          </mesh>
          <mesh castShadow material={M.darkSteel} position={[0.2, 1.25, 0]}>
            <boxGeometry args={[0.45, 0.5, 0.4]} />
          </mesh>
          <mesh material={glow("#ff6b2c", 1.4)} position={[0.2, 1.3, 0.21]}>
            <boxGeometry args={[0.12, 0.05, 0.01]} />
          </mesh>
        </group>
      );
    case "counter":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.white} position={[0, 0.55, 0]}>
            <boxGeometry args={[4, 1.1, 0.7]} />
          </mesh>
          <mesh material={M.orange} position={[0, 0.55, 0.36]}>
            <boxGeometry args={[4, 0.12, 0.02]} />
          </mesh>
        </group>
      );
    case "sofa":
      return (
        <group>
          <mesh castShadow material={mat("#334155", { roughness: 0.95 })} position={[0, 0.3, 0]}>
            <boxGeometry args={[2.4, 0.45, 0.9]} />
          </mesh>
          <mesh castShadow material={mat("#334155", { roughness: 0.95 })} position={[0, 0.65, -0.35]}>
            <boxGeometry args={[2.4, 0.5, 0.2]} />
          </mesh>
        </group>
      );
    case "bench":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.steel} position={[0, 0.9, 0]}>
            <boxGeometry args={[2.4, 0.06, 0.9]} />
          </mesh>
          {[-1.1, 1.1].map((x) => (
            <mesh key={x} material={M.darkSteel} position={[x, 0.45, 0]}>
              <boxGeometry args={[0.06, 0.9, 0.8]} />
            </mesh>
          ))}
          <mesh castShadow material={M.offWhite} position={[-0.5, 1.05, 0]}>
            <boxGeometry args={[0.4, 0.25, 0.3]} />
          </mesh>
        </group>
      );
    case "pallet":
      return (
        <group>
          <mesh castShadow receiveShadow material={M.wood} position={[0, 0.08, 0]}>
            <boxGeometry args={[1.2, 0.15, 1]} />
          </mesh>
          <mesh castShadow material={mat("#c7a27a", { roughness: 0.9 })} position={[0, 0.5, 0]}>
            <boxGeometry args={[1.1, 0.7, 0.9]} />
          </mesh>
          <mesh material={mat("#e8dcc8")} position={[0, 0.5, 0.451]}>
            <planeGeometry args={[0.4, 0.25]} />
          </mesh>
        </group>
      );
    case "plant":
      return (
        <group>
          <mesh castShadow material={M.pot} position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.22, 0.17, 0.5, 12]} />
          </mesh>
          <mesh castShadow material={M.plant} position={[0, 0.85, 0]}>
            <icosahedronGeometry args={[0.42, 0]} />
          </mesh>
        </group>
      );
  }
}
