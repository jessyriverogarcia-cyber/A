/**
 * Position du soleil et ambiance lumineuse de la maquette, calculées à partir de l'heure réelle
 * et des coordonnées du site. Module pur (aucune dépendance 3D) : testable et partagé.
 */

const RAD = Math.PI / 180;

export interface SolarPosition {
  /** Hauteur au-dessus de l'horizon, en degrés (négative la nuit). */
  elevation: number;
  /** Azimut en degrés, compté depuis le nord dans le sens horaire (90 = est). */
  azimuth: number;
}

/** Position apparente du soleil (précision ~0,5°, largement suffisante pour l'éclairage). */
export function solarPosition(date: Date, lat: number, lon: number): SolarPosition {
  const d = date.getTime() / 86_400_000 - 10_957.5; // jours depuis J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = 18.697374558 + 24.06570982441908 * d; // heures
  const H = ((gmst * 15 + lon) * RAD - ra) % (2 * Math.PI);
  const phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi));
  return { elevation: elevation / RAD, azimuth: ((azimuth / RAD) % 360 + 360) % 360 };
}

export type TimeMode = "auto" | "day" | "night";

/** Soleil imposé par les modes manuels : fin d'après-midi au sud-ouest, ou pleine nuit. */
export const FIXED_SUN: Record<Exclude<TimeMode, "auto">, SolarPosition> = {
  day: { elevation: 50, azimuth: 235 },
  night: { elevation: -20, azimuth: 330 },
};

export interface Ambience {
  background: string;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  /** 0 en plein jour, 1 en pleine nuit : pilote éclairages, lampadaires et balisage. */
  nightness: number;
}

const KEYS: [number, Ambience][] = [
  [-12, { background: "#0f1726", sunColor: "#9db4ff", sunIntensity: 0.45, hemiSky: "#39507a", hemiGround: "#1a1d24", hemiIntensity: 0.32, ambient: 0.12, nightness: 1 }],
  [-6, { background: "#3b4866", sunColor: "#8fa6d8", sunIntensity: 0.3, hemiSky: "#5a6d96", hemiGround: "#2a2a30", hemiIntensity: 0.38, ambient: 0.14, nightness: 0.8 }],
  [-3, { background: "#6f6a80", sunColor: "#ff9b6a", sunIntensity: 0.15, hemiSky: "#8a8fb0", hemiGround: "#3d3434", hemiIntensity: 0.45, ambient: 0.16, nightness: 0.55 }],
  [0, { background: "#b89c9a", sunColor: "#ff8a4c", sunIntensity: 1.1, hemiSky: "#c4b8d0", hemiGround: "#54443c", hemiIntensity: 0.6, ambient: 0.2, nightness: 0.3 }],
  [6, { background: "#d6c4b4", sunColor: "#ffb47a", sunIntensity: 1.9, hemiSky: "#d8dcf0", hemiGround: "#62523f", hemiIntensity: 0.8, ambient: 0.23, nightness: 0.05 }],
  [20, { background: "#c9d4de", sunColor: "#ffe3c2", sunIntensity: 2.4, hemiSky: "#dbe7ff", hemiGround: "#6b5a4a", hemiIntensity: 0.9, ambient: 0.25, nightness: 0 }],
];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a: string, b: string, t: number) =>
  "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ambiance interpolée selon la hauteur du soleil. */
export function ambienceAt(elevation: number): Ambience {
  if (elevation <= KEYS[0][0]) return KEYS[0][1];
  const last = KEYS[KEYS.length - 1];
  if (elevation >= last[0]) return last[1];
  const i = KEYS.findIndex(([e]) => e > elevation);
  const [e0, a] = KEYS[i - 1];
  const [e1, b] = KEYS[i];
  const t = (elevation - e0) / (e1 - e0);
  return {
    background: mixHex(a.background, b.background, t),
    sunColor: mixHex(a.sunColor, b.sunColor, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, t),
    ambient: mix(a.ambient, b.ambient, t),
    nightness: mix(a.nightness, b.nightness, t),
  };
}

/**
 * Direction (vecteur unitaire, repère de la maquette : +x est, -z nord, +y haut) de la source
 * principale : le soleil tant qu'il est près de l'horizon ou au-dessus, sinon la lune (opposée).
 * La hauteur est bornée pour garder des ombres lisibles.
 */
export function lightDirection({ elevation, azimuth }: SolarPosition): [number, number, number] {
  const moon = elevation < -3;
  const az = (moon ? azimuth + 180 : azimuth) * RAD;
  const el = Math.max(moon ? 35 : 6, Math.min(70, moon ? -elevation + 20 : elevation)) * RAD;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
