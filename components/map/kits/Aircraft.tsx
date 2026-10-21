"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { M, glow, mat } from "../materials";
import type { AircraftModel } from "@/lib/map/types";

const holo = mat("#38bdf8", { emissive: "#38bdf8", emissiveIntensity: 1.6, opacity: 0.35, wireframe: true });
const livery = mat("#f4f6f8", { metalness: 0.35, roughness: 0.3 });
const stripe = mat("#ff6b2c", { roughness: 0.4 });
const cockpit = mat("#0f172a", { metalness: 0.8, roughness: 0.15 });

const SIZES = {
  private: { length: 14, radius: 1, span: 15 },
  airliner: { length: 26, radius: 1.8, span: 28 },
  cargo: { length: 24, radius: 2.15, span: 27 },
};

interface Props {
  model: AircraftModel;
  /** 0–1 : part imprimée (tronçons visibles). 1 = appareil complet. */
  build?: number;
  hologram?: boolean;
}

/** Supersonique à aile oblique (aile pivotante unique, inspirée des études d'aile oblique). */
export function ObliqueJet({ model, build = 1, hologram }: Props) {
  const s = SIZES[model.variant ?? "airliner"];
  const segs = 10;
  const shown = Math.max(1, Math.round(build * segs));
  const body = hologram ? holo : livery;
  const segLen = s.length / segs;
  return (
    <group>
      {/* Fuselage en tronçons : c'est ainsi qu'il sort du portique d'impression */}
      {Array.from({ length: segs }, (_, i) =>
        i < shown ? (
          <mesh
            key={i}
            castShadow
            rotation={[0, 0, Math.PI / 2]}
            position={[-s.length / 2 + segLen * (i + 0.5), s.radius + 1.2, 0]}
            material={!hologram && build < 1 && i === shown - 1 ? glow("#ff8a3d", 0.8) : body}
          >
            <cylinderGeometry args={[s.radius, s.radius, segLen * 0.98, 20]} />
          </mesh>
        ) : null,
      )}
      {build >= 1 && (
        <>
          <mesh castShadow rotation={[0, 0, -Math.PI / 2]} position={[s.length / 2 + s.radius * 1.6, s.radius + 1.2, 0]} material={body}>
            <coneGeometry args={[s.radius, s.radius * 3.2, 20]} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 2]} position={[s.length / 2 + s.radius * 0.6, s.radius * 1.55 + 1.2, 0]} material={hologram ? holo : cockpit}>
            <sphereGeometry args={[s.radius * 0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-s.length / 2 - s.radius * 1.2, s.radius + 1.2, 0]} material={body}>
            <coneGeometry args={[s.radius, s.radius * 2.4, 20]} />
          </mesh>
          {/* Aile oblique : une seule aile, pivotée d'environ 30° */}
          <mesh castShadow rotation={[0, 0.52, 0]} position={[0.5, s.radius * 1.9 + 1.2, 0]} material={body}>
            <boxGeometry args={[s.span * 0.12, 0.22, s.span]} />
          </mesh>
          <mesh rotation={[0, 0.52, 0]} position={[0.5, s.radius * 1.9 + 1.32, 0]} material={hologram ? holo : stripe}>
            <boxGeometry args={[0.35, 0.05, s.span * 0.98]} />
          </mesh>
          <mesh castShadow position={[-s.length / 2 + 1, s.radius * 2.6 + 1.2, 0]} material={body}>
            <boxGeometry args={[s.radius * 2.2, s.radius * 2.4, 0.18]} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[-s.length / 4, s.radius * 0.6 + 1.2, side * s.radius * 1.35]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]} material={hologram ? holo : M.darkSteel}>
                <cylinderGeometry args={[s.radius * 0.45, s.radius * 0.38, s.length * 0.28, 14]} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]} position={[-s.length * 0.145, 0, 0]} material={hologram ? holo : glow("#ff7a2f", 1.4)}>
                <circleGeometry args={[s.radius * 0.36, 14]} />
              </mesh>
            </group>
          ))}
          {/* Train d'atterrissage */}
          {!hologram &&
            [s.length / 3, -s.length / 6].map((x, i) => (
              <mesh key={i} position={[x, 0.6, 0]} material={M.rubber}>
                <cylinderGeometry args={[0.08, 0.08, 1.2]} />
              </mesh>
            ))}
        </>
      )}
      {!hologram && (
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, s.radius + 1.2, s.radius + 0.01]} material={stripe}>
          <planeGeometry args={[0.3, s.length * Math.min(build, 1) * 0.9]} />
        </mesh>
      )}
    </group>
  );
}

function wingShape(): THREE.Shape {
  // Vue de dessus de l'aile volante (x = avant), bord de fuite en W.
  const pts: [number, number][] = [
    [8, 0], [-2, 15], [-5.5, 15.5], [-3.5, 6], [-6, 0], [-3.5, -6], [-5.5, -15.5], [-2, -15],
  ];
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  return shape;
}

/** Hydravion aile volante qui porte une ou plusieurs fusées sur le dos. */
export function FlyingWingSeaplane({ model, build = 1, hologram }: Props) {
  const wing = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.9, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.3, bevelSegments: 2 });
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const body = hologram ? holo : livery;
  const rockets = model.rockets?.length ? model.rockets : [1];
  return (
    <group position={[0, 3.4, 0]}>
      <group scale={[1, 1, Math.max(0.08, build)]}>
        <mesh castShadow receiveShadow geometry={wing} material={body} />
      </group>
      {build >= 1 && (
        <>
          {/* Flotteurs */}
          {[-5.5, 5.5].map((z) => (
            <group key={z} position={[0, -2.4, z]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]} material={body}>
                <capsuleGeometry args={[0.8, 10, 6, 14]} />
              </mesh>
              <mesh position={[0, 1.3, 0]} material={hologram ? holo : M.darkSteel}>
                <boxGeometry args={[0.3, 1.6, 0.2]} />
              </mesh>
            </group>
          ))}
          {/* Dérives jumelles */}
          {[-3.2, 3.2].map((z) => (
            <mesh key={z} castShadow position={[-4.5, 1.7, z]} rotation={[0, 0, 0.35]} material={body}>
              <boxGeometry args={[2.6, 3, 0.2]} />
            </mesh>
          ))}
          {/* Moteurs dorsaux */}
          {[-8, -3, 3, 8].map((z) => (
            <group key={z} position={[-1.2 - Math.abs(z) * 0.3, 0.9, z]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]} material={hologram ? holo : M.darkSteel}>
                <cylinderGeometry args={[0.55, 0.45, 2.6, 14]} />
              </mesh>
              <mesh rotation={[0, -Math.PI / 2, 0]} position={[-1.31, 0, 0]} material={hologram ? holo : glow("#ff7a2f", 1.2)}>
                <circleGeometry args={[0.42, 14]} />
              </mesh>
            </group>
          ))}
          {/* Fusées portées */}
          {rockets.map((size, i) => {
            const z = rockets.length === 1 ? 0 : (i - (rockets.length - 1) / 2) * 3.4;
            const len = 11 * size;
            const r = 0.75 * size;
            return (
              <group key={i} position={[0.5, 1.6 + r, z]}>
                <mesh castShadow rotation={[0, 0, Math.PI / 2]} material={hologram ? holo : M.white}>
                  <cylinderGeometry args={[r, r, len, 18]} />
                </mesh>
                <mesh castShadow rotation={[0, 0, -Math.PI / 2]} position={[len / 2 + r * 1.2, 0, 0]} material={hologram ? holo : M.white}>
                  <coneGeometry args={[r, r * 2.4, 18]} />
                </mesh>
                {[-0.3, 0.15].map((f) => (
                  <mesh key={f} rotation={[0, 0, Math.PI / 2]} position={[len * f, 0, 0]} material={hologram ? holo : M.black}>
                    <cylinderGeometry args={[r * 1.01, r * 1.01, 0.5, 18]} />
                  </mesh>
                ))}
                <mesh position={[-len / 2 + 0.6, r * 0.9, 0]} material={hologram ? holo : stripe}>
                  <boxGeometry args={[1.2, r, 0.08]} />
                </mesh>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

export function Aircraft(props: Props) {
  return props.model.type === "flying_wing" ? <FlyingWingSeaplane {...props} /> : <ObliqueJet {...props} />;
}
