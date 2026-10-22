import { describe, expect, it } from "vitest";
import { ambienceAt, lightDirection, solarPosition } from "@/lib/map/daylight";

const BDX = { lat: 44.84, lon: -0.58 };

describe("solarPosition", () => {
  it("donne la hauteur du soleil à midi solaire aux solstices (Bordeaux)", () => {
    // midi solaire à Bordeaux ≈ 12 h 02 UTC (longitude -0,58°)
    const june = solarPosition(new Date("2026-06-21T12:04:00Z"), BDX.lat, BDX.lon);
    const dec = solarPosition(new Date("2026-12-21T12:00:00Z"), BDX.lat, BDX.lon);
    expect(june.elevation).toBeCloseTo(68.6, 0);
    expect(dec.elevation).toBeCloseTo(21.7, 0);
    expect(Math.abs(june.azimuth - 180)).toBeLessThan(3);
  });

  it("est sous l'horizon la nuit, à l'est le matin et à l'ouest le soir", () => {
    expect(solarPosition(new Date("2026-10-21T23:38:00Z"), BDX.lat, BDX.lon).elevation).toBeLessThan(-30);
    const morning = solarPosition(new Date("2026-06-21T06:00:00Z"), BDX.lat, BDX.lon);
    const evening = solarPosition(new Date("2026-06-21T18:00:00Z"), BDX.lat, BDX.lon);
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
  });
});

describe("ambienceAt", () => {
  it("passe du jour à la nuit de façon continue", () => {
    expect(ambienceAt(45).nightness).toBe(0);
    expect(ambienceAt(-30).nightness).toBe(1);
    expect(ambienceAt(-30).background).toBe("#0f1726");
    let prev = -1;
    for (let e = 30; e >= -15; e -= 0.5) {
      const n = ambienceAt(e).nightness;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(ambienceAt(13).background).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("lightDirection", () => {
  it("vise depuis le soleil le jour et depuis la lune la nuit", () => {
    const [x, y, z] = lightDirection({ elevation: 30, azimuth: 90 });
    expect(x).toBeGreaterThan(0.8); // est
    expect(y).toBeGreaterThan(0.4);
    expect(Math.abs(z)).toBeLessThan(1e-9);
    const [, yn, zn] = lightDirection({ elevation: -30, azimuth: 0 });
    expect(zn).toBeGreaterThan(0); // lune au sud quand le soleil est au nord
    expect(yn).toBeGreaterThan(0.5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
  });
});
