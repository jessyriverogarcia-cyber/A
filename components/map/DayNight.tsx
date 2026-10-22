"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { sectorConfig } from "@/config/sector.config";
import { useMap } from "@/lib/map/store";
import { ambienceAt, FIXED_SUN, lightDirection, solarPosition, type SolarPosition, type TimeMode } from "@/lib/map/daylight";

/** État lumineux courant, lu à chaque image par les éclairages nocturnes et l'eau (pas de rendu React). */
export const daylight = { elevation: 50, azimuth: 235, nightness: 0 };

const coords = sectorConfig.company.coordinates;

function target(mode: TimeMode, now: Date): SolarPosition {
  if (mode !== "auto" || !coords) return FIXED_SUN[mode === "auto" ? "day" : mode];
  return solarPosition(now, coords.lat, coords.lon);
}

/**
 * Ciel, brouillard, lumières d'ambiance et soleil (ou lune) suivant l'heure réelle du site.
 * Au changement de mode, le soleil glisse vers sa nouvelle position en quelques secondes.
 */
export function DayNight({ cx, cz, size, shadows }: { cx: number; cz: number; size: number; shadows: boolean }) {
  const mode = useMap((s) => s.timeMode);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const scene = useThree((s) => s.scene);
  const goal = useRef<SolarPosition>(target(mode, new Date()));
  const first = useRef(true);
  const bg = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    goal.current = target(mode, new Date());
    if (mode !== "auto") return;
    const t = setInterval(() => (goal.current = target("auto", new Date())), 30_000);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.set(cx, 0, cz);
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [cx, cz, scene]);

  useFrame((_, dt) => {
    const g = goal.current;
    const k = first.current ? 1 : 1 - Math.exp(-dt * 1.6);
    first.current = false;
    const dAz = ((g.azimuth - daylight.azimuth + 540) % 360) - 180; // plus court chemin
    if (Math.abs(g.elevation - daylight.elevation) < 0.01 && Math.abs(dAz) < 0.01 && k < 1) return;
    daylight.elevation += (g.elevation - daylight.elevation) * k;
    daylight.azimuth = (daylight.azimuth + dAz * k + 360) % 360;
    const a = ambienceAt(daylight.elevation);
    daylight.nightness = a.nightness;

    bg.set(a.background);
    if (scene.background instanceof THREE.Color) scene.background.copy(bg);
    if (scene.fog) scene.fog.color.copy(bg);
    if (hemi.current) {
      hemi.current.color.set(a.hemiSky);
      hemi.current.groundColor.set(a.hemiGround);
      hemi.current.intensity = a.hemiIntensity;
    }
    if (amb.current) amb.current.intensity = a.ambient;
    if (sun.current) {
      const [x, y, z] = lightDirection(daylight);
      sun.current.position.set(cx + x * size * 1.2, y * size * 1.2, cz + z * size * 1.2);
      sun.current.color.set(a.sunColor);
      sun.current.intensity = a.sunIntensity;
    }
  });

  return (
    <>
      <color attach="background" args={["#c9d4de"]} />
      <fog attach="fog" args={["#c9d4de", size * 1.6, size * 4.2]} />
      <hemisphereLight ref={hemi} args={["#dbe7ff", "#6b5a4a", 0.9]} />
      <ambientLight ref={amb} intensity={0.25} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        position={[cx - size * 0.5, size * 0.8, cz + size * 0.35]}
        intensity={2.4}
        color="#ffe3c2"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size * 0.75}
        shadow-camera-right={size * 0.75}
        shadow-camera-top={size * 0.75}
        shadow-camera-bottom={-size * 0.75}
        shadow-camera-far={size * 3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}
