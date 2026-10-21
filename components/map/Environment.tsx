"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M, mat } from "./materials";
import { daylight } from "./DayNight";
import { PLINTH } from "@/lib/map/theme";
import { hashSeed, rectOf, seeded, type Rect } from "@/lib/map/layout";
import type { MapZone } from "@/lib/map/types";

const asphalt = mat("#4a4f57", { roughness: 0.95 });
const lineWhite = mat("#f3f4f6", { roughness: 0.6 });
const lineYellow = mat("#facc15", { roughness: 0.6 });
const grass = mat("#7f9a6a", { roughness: 1 });
const concrete = mat("#b9bcc1", { roughness: 0.9 });

/** Socle de maquette : dalle sombre biseautée, pelouse, arbres. */
export function Plinth({ bounds }: { bounds: Rect }) {
  const [x1, z1, x2, z2] = bounds;
  const m = 14;
  const w = x2 - x1 + m * 2;
  const d = z2 - z1 + m * 2;
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const trees = useMemo(() => {
    const rnd = seeded(hashSeed(`${x1}${z1}`));
    const out: { x: number; z: number; s: number }[] = [];
    const perimeter = Math.floor((w + d) / 5);
    for (let i = 0; i < perimeter; i++) {
      const side = i % 4;
      const t = rnd();
      const inset = 4 + rnd() * 5;
      const x = side < 2 ? x1 - m + t * w : side === 2 ? x1 - m + inset : x2 + m - inset;
      const z = side === 0 ? z1 - m + inset : side === 1 ? z2 + m - inset : z1 - m + t * d;
      out.push({ x, z, s: 0.8 + rnd() * 0.7 });
    }
    return out;
  }, [x1, z1, x2, z2, w, d]);

  return (
    <group>
      <mesh receiveShadow position={[cx, -0.65, cz]} material={mat(PLINTH, { roughness: 0.6, metalness: 0.2 })}>
        <boxGeometry args={[w + 1.2, 1.2, d + 1.2]} />
      </mesh>
      <mesh receiveShadow position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]} material={grass}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh castShadow material={M.darkWood} position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.15, 0.22, 1.8, 6]} />
          </mesh>
          <mesh castShadow material={mat(i % 3 ? "#4d7c4f" : "#5f8f52", { roughness: 0.9 })} position={[0, 2.8, 0]}>
            <icosahedronGeometry args={[1.4, 0]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying float vWave;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    vec4 w0 = modelMatrix * vec4(p, 1.0);
    float w = sin(dot(w0.xz, vec2(0.31, 0.12)) + uTime * 1.1) * 0.1 + sin(dot(w0.xz, vec2(-0.14, 0.42)) + uTime * 0.75) * 0.07;
    p.z += w;
    vWave = w;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying float vWave;
  varying vec3 vWorld;
  void main() {
    // Trois trains de vagues d'orientations et de vitesses différentes : pas de motif en damier.
    vec2 p = vWorld.xz;
    p += vec2(sin(p.y * 0.13 + uTime * 0.2), cos(p.x * 0.11 - uTime * 0.15)) * 2.5; // déformation douce : casse la régularité
    float r = sin(dot(p, vec2(0.93, 0.36)) * 1.3 + uTime * 1.4) * 0.5
            + sin(dot(p, vec2(-0.39, 0.92)) * 2.3 - uTime * 1.05) * 0.32
            + sin(dot(p, vec2(0.71, -0.70)) * 3.9 + uTime * 2.1 + sin(p.x * 0.21) * 2.0) * 0.18;
    float glint = smoothstep(0.66, 0.98, r) * mix(1.0, 0.6, uNight);
    vec3 deep = mix(vec3(0.09, 0.33, 0.43), vec3(0.02, 0.06, 0.11), uNight);
    vec3 shallow = mix(vec3(0.24, 0.58, 0.65), vec3(0.06, 0.13, 0.2), uNight);
    vec3 spark = mix(vec3(0.2), vec3(0.55, 0.42, 0.24), uNight); // reflets du ciel, ou des lampadaires la nuit
    vec3 c = mix(deep, shallow, clamp(0.55 + vWave * 1.6 + r * 0.08, 0.3, 0.85)) + glint * spark;
    // Couleurs pensées en sRGB : passage en linéaire puis conversion de sortie du moteur (mêmes teintes avec ou sans post-traitement)
    gl_FragColor = vec4(pow(c, vec3(2.2)), 0.94);
    #include <colorspace_fragment>
  }
`;

/** Bras de Garonne animé (shader de vagues). */
export function Water({ rect }: { rect: Rect }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.uniforms.uTime.value = clock.elapsedTime;
    ref.current.uniforms.uNight.value = daylight.nightness;
  });
  const [x1, z1, x2, z2] = rect;
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uNight: { value: 0 } }), []);
  return (
    <group userData={{ noMerge: true }}>
      <mesh position={[(x1 + x2) / 2, -0.15, (z1 + z2) / 2]} material={mat("#0d3442")}>
        <boxGeometry args={[x2 - x1, 0.5, z2 - z1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x1 + x2) / 2, 0.32, (z1 + z2) / 2]}>
        <planeGeometry args={[x2 - x1, z2 - z1, 48, 48]} />
        <shaderMaterial ref={ref} vertexShader={waterVertex} fragmentShader={waterFragment} uniforms={uniforms} transparent />
      </mesh>
      {/* Cale de mise à l'eau */}
      <mesh receiveShadow position={[x1 + 5, 0.3, (z1 + z2) / 2]} rotation={[0, 0, -0.04]} material={concrete}>
        <boxGeometry args={[10, 0.3, 18]} />
      </mesh>
    </group>
  );
}

function Car({ color }: { color: string }) {
  const body = mat(color, { metalness: 0.5, roughness: 0.35 });
  return (
    <group>
      <mesh castShadow material={body} position={[0, 0.45, 0]}>
        <boxGeometry args={[1.8, 0.55, 4.2]} />
      </mesh>
      <mesh castShadow material={mat("#1f2937", { metalness: 0.6, roughness: 0.2 })} position={[0, 0.9, -0.2]}>
        <boxGeometry args={[1.6, 0.45, 2.2]} />
      </mesh>
      {[-0.8, 0.8].flatMap((x) =>
        [-1.3, 1.3].map((z) => (
          <mesh key={`${x}${z}`} rotation={[0, 0, Math.PI / 2]} material={M.rubber} position={[x, 0.3, z]}>
            <cylinderGeometry args={[0.3, 0.3, 0.2, 12]} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Truck({ color = "#e5e7eb" }: { color?: string }) {
  return (
    <group>
      <mesh castShadow material={mat(color, { roughness: 0.5 })} position={[0, 1.7, -1]}>
        <boxGeometry args={[2.5, 2.8, 8]} />
      </mesh>
      <mesh castShadow material={M.orange} position={[0, 1.4, 3.9]}>
        <boxGeometry args={[2.4, 2.2, 2]} />
      </mesh>
      <mesh material={mat("#0f172a", { metalness: 0.7, roughness: 0.2 })} position={[0, 1.9, 4.91]}>
        <boxGeometry args={[2.1, 0.8, 0.02]} />
      </mesh>
      {[-1.1, 1.1].flatMap((x) =>
        [-3.5, -1.5, 3.8].map((z) => (
          <mesh key={`${x}${z}`} rotation={[0, 0, Math.PI / 2]} material={M.rubber} position={[x, 0.45, z]}>
            <cylinderGeometry args={[0.45, 0.45, 0.35, 14]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Habillage des zones extérieures selon leur clé de type (parking, quai, tarmac, eau). */
export function OutdoorZone({ zone }: { zone: MapZone }) {
  const r = rectOf(zone);
  const [x1, z1, x2, z2] = r;
  const w = x2 - x1;
  const d = z2 - z1;
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const rnd = useMemo(() => seeded(hashSeed(zone.id)), [zone.id]);
  const cars = useMemo(() => {
    const colors = ["#e5e7eb", "#1f2937", "#9ca3af", "#b91c1c", "#1d4ed8", "#f8fafc", "#475569"];
    const out: { x: number; z: number; c: string }[] = [];
    for (let i = 0; i < Math.floor(w / 2.8); i++)
      for (const row of [0, 1]) if (rnd() > 0.3) out.push({ x: x1 + 1.6 + i * 2.8, z: row ? z2 - 3.2 : z1 + 3.2, c: colors[Math.floor(rnd() * colors.length)] });
    return out;
  }, [rnd, w, x1, z1, z2]);

  if (zone.type === "water") return <Water rect={r} />;

  const isTarmac = zone.type === "runway";
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.05, cz]} material={asphalt}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {isTarmac ? (
        <>
          {Array.from({ length: Math.floor(w / 8) }, (_, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x1 + 4 + i * 8, 0.08, cz]} material={lineWhite}>
              <planeGeometry args={[4, 0.5]} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.08, z2 - 3]} material={lineYellow}>
            <planeGeometry args={[w - 4, 0.3]} />
          </mesh>
          {[x1 + 1, x2 - 1].map((x) => (
            <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.08, cz]} material={lineWhite}>
              <planeGeometry args={[0.4, d - 2]} />
            </mesh>
          ))}
        </>
      ) : zone.type === "parking" ? (
        <>
          {Array.from({ length: Math.floor(w / 2.8) + 1 }, (_, i) =>
            [z1 + 3.2, z2 - 3.2].map((z) => (
              <mesh key={`${i}${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[x1 + 0.2 + i * 2.8, 0.08, z]} material={lineWhite}>
                <planeGeometry args={[0.12, 4.8]} />
              </mesh>
            )),
          )}
          {cars.map((c, i) => (
            <group key={i} position={[c.x, 0, c.z]}>
              <Car color={c.c} />
            </group>
          ))}
        </>
      ) : (
        <>
          <mesh receiveShadow position={[cx, 0.6, cz]} material={concrete}>
            <boxGeometry args={[w, 1.2, d]} />
          </mesh>
          <mesh position={[x2 - 0.15, 1.22, cz]} material={lineYellow}>
            <boxGeometry args={[0.3, 0.02, d]} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Arches de toiture (charpente) au-dessus des zones de hangar : effet « coupe » de maquette. */
export function HangarArches({ zones }: { zones: MapZone[] }) {
  const hangars = zones.filter((z) => z.type === "hangar");
  if (!hangars.length) return null;
  const rects = hangars.map(rectOf);
  const x1 = Math.min(...rects.map((r) => r[0]));
  const x2 = Math.max(...rects.map((r) => r[2]));
  const z1 = Math.min(...rects.map((r) => r[1]));
  const z2 = Math.max(...rects.map((r) => r[3]));
  const radius = (z2 - z1) / 2;
  const n = Math.floor((x2 - x1) / 10);
  const truss = mat("#cbd5e1", { metalness: 0.6, roughness: 0.4 });
  return (
    <group>
      {Array.from({ length: n + 1 }, (_, i) => (
        <mesh key={i} castShadow position={[x1 + (i * (x2 - x1)) / n, 2.4, (z1 + z2) / 2]} rotation={[0, Math.PI / 2, 0]} material={truss}>
          <torusGeometry args={[radius, 0.18, 6, 40, Math.PI]} />
        </mesh>
      ))}
      {[0.35, 0.65].map((f) => (
        <mesh key={f} position={[(x1 + x2) / 2, 2.4 + Math.sin(Math.PI * f) * radius, z1 + radius - Math.cos(Math.PI * f) * radius]} material={truss}>
          <boxGeometry args={[x2 - x1, 0.2, 0.2]} />
        </mesh>
      ))}
    </group>
  );
}

export { THREE };
