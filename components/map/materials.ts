import * as THREE from "three";

/** Matériaux partagés (un seul objet GPU par combinaison) pour tenir 60 i/s. */
const cache = new Map<string, THREE.MeshStandardMaterial>();

export interface MatOpts {
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  wireframe?: boolean;
}

export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.metalness ?? 0.1}|${o.roughness ?? 0.7}|${o.emissive ?? ""}|${o.emissiveIntensity ?? 0}|${o.opacity ?? 1}|${o.wireframe ?? false}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      metalness: o.metalness ?? 0.1,
      roughness: o.roughness ?? 0.7,
      ...(o.emissive ? { emissive: new THREE.Color(o.emissive) } : {}),
      emissiveIntensity: o.emissiveIntensity ?? 0,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      wireframe: o.wireframe ?? false,
      depthWrite: (o.opacity ?? 1) >= 1,
    });
    cache.set(key, m);
  }
  return m;
}

/** Matériau émissif « néon » (lampes d'état, lasers, UV) — capté par le bloom. */
export const glow = (color: string, intensity = 3) => mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

export const M = {
  steel: mat("#9aa3ad", { metalness: 0.7, roughness: 0.35 }),
  darkSteel: mat("#3b424b", { metalness: 0.6, roughness: 0.45 }),
  anthracite: mat("#2a2e35", { metalness: 0.3, roughness: 0.55 }),
  white: mat("#eef0f2", { roughness: 0.5 }),
  offWhite: mat("#d9dde2", { roughness: 0.6 }),
  black: mat("#15181c", { roughness: 0.6 }),
  yellow: mat("#f2b705", { metalness: 0.3, roughness: 0.5 }),
  orange: mat("#ff6b2c", { roughness: 0.5 }),
  glass: mat("#a9d6ee", { opacity: 0.28, roughness: 0.05, metalness: 0.1 }),
  amberGlass: mat("#ff9a3c", { opacity: 0.45, roughness: 0.1 }),
  wood: mat("#b58a5e", { roughness: 0.8 }),
  darkWood: mat("#6e4d33", { roughness: 0.8 }),
  fabric: mat("#4b5563", { roughness: 0.95 }),
  plant: mat("#3f7d4a", { roughness: 0.9 }),
  pot: mat("#e2ddd3", { roughness: 0.8 }),
  screen: mat("#1d4ed8", { emissive: "#3b82f6", emissiveIntensity: 1.2 }),
  rubber: mat("#1b1d21", { roughness: 0.9 }),
};
