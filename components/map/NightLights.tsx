"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { rectOf, type Rect } from "@/lib/map/layout";
import type { MapZone } from "@/lib/map/types";
import { daylight } from "./DayNight";
import { M } from "./materials";

type P = [number, number, number];

/** Un seul appel de dessin pour toute une série de lampes identiques. */
function Instanced({ points, geometry, material, rotation }: { points: P[]; geometry: THREE.BufferGeometry; material: THREE.Material; rotation?: THREE.Euler }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    points.forEach((p, i) => {
      o.position.set(...p);
      if (rotation) o.rotation.copy(rotation);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [points, rotation]);
  if (!points.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, points.length]} userData={{ noMerge: true }} frustumCulled={false} />;
}

/** Halo radial (texture générée une fois) pour les flaques de lumière au sol. */
function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const glowFragment = /* glsl */ `
  uniform float uNight;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float a = smoothstep(0.0, 0.12, edge);
    // Plafonniers : flaques plus claires tous les 6 m environ
    vec2 f = abs(fract(vWorld.xz / 6.0) - 0.5);
    float pool = 0.65 + 0.35 * (1.0 - smoothstep(0.05, 0.4, length(f)));
    gl_FragColor = vec4(uColor * pool, a * uNight * 0.42);
    #include <colorspace_fragment>
  }
`;

/**
 * Éclairage nocturne : intérieurs allumés, lampadaires en périphérie et le long des parkings,
 * balisage de piste. Tout est piloté par `daylight.nightness` (0 le jour : rien n'est dessiné).
 */
export function NightLights({ zones, bounds }: { zones: MapZone[]; bounds: Rect }) {
  const pool = useMemo(() => radialTexture(), []);
  const mats = useMemo(
    () => ({
      lamp: new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: new THREE.Color("#ffd49a"), emissiveIntensity: 0, roughness: 0.4 }),
      edge: new THREE.MeshStandardMaterial({ color: "#f8fafc", emissive: new THREE.Color("#e0ecff"), emissiveIntensity: 0 }),
      green: new THREE.MeshStandardMaterial({ color: "#16a34a", emissive: new THREE.Color("#22c55e"), emissiveIntensity: 0 }),
      red: new THREE.MeshStandardMaterial({ color: "#b91c1c", emissive: new THREE.Color("#ef4444"), emissiveIntensity: 0 }),
      ground: new THREE.MeshBasicMaterial({ map: pool, color: "#ffcf8a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      interior: new THREE.ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: { uNight: { value: 0 }, uColor: { value: new THREE.Color("#ffe2b0") } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [pool],
  );
  const geo = useMemo(
    () => ({
      pole: new THREE.CylinderGeometry(0.08, 0.12, 5, 6).translate(0, 2.5, 0),
      head: new THREE.BoxGeometry(0.9, 0.18, 0.4),
      bulb: new THREE.SphereGeometry(0.22, 8, 6),
      disc: new THREE.PlaneGeometry(9, 9),
    }),
    [],
  );
  const flat = useMemo(() => new THREE.Euler(-Math.PI / 2, 0, 0), []);

  const layout = useMemo(() => {
    const [x1, z1, x2, z2] = bounds;
    const lamps: P[] = [];
    const along = (ax: number, az: number, bx: number, bz: number, step: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
      for (let i = 0; i <= n; i++) lamps.push([ax + ((bx - ax) * i) / n, 0, az + ((bz - az) * i) / n]);
    };
    const o = 3;
    along(x1 - o, z1 - o, x2 + o, z1 - o, 18);
    along(x1 - o, z2 + o, x2 + o, z2 + o, 18);
    along(x1 - o, z1 - o + 18, x1 - o, z2 + o - 18, 18);
    along(x2 + o, z1 - o + 18, x2 + o, z2 + o - 18, 18);
    const edge: P[] = [];
    const green: P[] = [];
    const red: P[] = [];
    const interiors: { cx: number; cz: number; w: number; d: number }[] = [];
    for (const z of zones) {
      const [a, b, c, d] = rectOf(z);
      if (!z.outdoor) {
        interiors.push({ cx: (a + c) / 2, cz: (b + d) / 2, w: c - a, d: d - b });
        continue;
      }
      if (z.type === "parking") along(a + 2, (b + d) / 2, c - 2, (b + d) / 2, 14);
      if (z.type === "runway") {
        for (let x = a + 2; x <= c - 2; x += 5) for (const zz of [b + 0.6, d - 0.6]) edge.push([x, 0.18, zz]);
        for (let zz = b + 1.5; zz <= d - 1.5; zz += 2) {
          green.push([a + 0.5, 0.18, zz]);
          red.push([c - 0.5, 0.18, zz]);
        }
      }
    }
    return {
      poles: lamps,
      heads: lamps.map(([x, , z]) => [x, 5.05, z] as P),
      pools: lamps.map(([x, , z]) => [x, 0.16, z] as P),
      edge,
      green,
      red,
      interiors,
    };
  }, [zones, bounds]);

  const groundRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const n = daylight.nightness;
    const on = n > 0.02;
    mats.lamp.emissiveIntensity = 0.15 + n * 4.5;
    mats.edge.emissiveIntensity = n * 5;
    // Seuil vert fixe, extrémité rouge qui pulse doucement
    mats.green.emissiveIntensity = n * 5;
    mats.red.emissiveIntensity = n * (3.5 + 2 * Math.sin(clock.elapsedTime * 3));
    mats.ground.opacity = n * 0.5;
    mats.interior.uniforms.uNight.value = n;
    if (groundRef.current) groundRef.current.visible = on;
  });

  return (
    <group>
      <Instanced points={layout.poles} geometry={geo.pole} material={M.darkSteel} />
      <Instanced points={layout.heads} geometry={geo.head} material={mats.lamp} />
      <Instanced points={layout.edge} geometry={geo.bulb} material={mats.edge} />
      <Instanced points={layout.green} geometry={geo.bulb} material={mats.green} />
      <Instanced points={layout.red} geometry={geo.bulb} material={mats.red} />
      <group ref={groundRef} visible={false}>
        <Instanced points={layout.pools} geometry={geo.disc} material={mats.ground} rotation={flat} />
        {layout.interiors.map((r, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[r.cx, 0.15, r.cz]} material={mats.interior} userData={{ noMerge: true }}>
            <planeGeometry args={[r.w, r.d]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
