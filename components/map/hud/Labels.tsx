"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMap } from "@/lib/map/store";
import { rectOf } from "@/lib/map/layout";
import { labelAnchors, labelElements, livePositions } from "@/lib/map/labels";

const v = new THREE.Vector3();

/** Dans le canvas : projette chaque ancre et déplace l'élément DOM correspondant. */
export function LabelProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    for (const [id, el] of labelElements) {
      const p = labelAnchors.get(id)?.();
      if (!p) {
        el.style.visibility = "hidden";
        continue;
      }
      v.set(p.x, p.y, p.z).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

const register = (id: string) => (el: HTMLElement | null) => {
  if (el) labelElements.set(id, el);
  else labelElements.delete(id);
};

/** Hors du canvas : étiquettes de zones et carte de la personne survolée. */
export function Labels() {
  const zones = useMap((s) => s.zones);
  const employees = useMap((s) => s.employees);
  const visitors = useMap((s) => s.visitors);
  const presence = useMap((s) => s.presence);
  const select = useMap((s) => s.select);
  const hover = useMap((s) => s.hover);
  const selection = useMap((s) => s.selection);
  const workOrders = useMap((s) => s.workOrders);
  const objects = useMap((s) => s.objects);
  const effects = useMap((s) => s.effects);
  const departed = useMap((s) => s.departed);
  const person = [hover, selection].find((x) => x?.kind === "employee" || x?.kind === "visitor");
  const visitor = person?.kind === "visitor" ? visitors.find((v) => v.id === person.id) : undefined;
  const employee = person?.kind === "employee" ? employees.find((e) => e.id === person.id) : undefined;
  const emp = useMemo(
    () =>
      visitor
        ? { id: `visitor:${visitor.id}`, first_name: visitor.contact_name ?? "Visiteur", last_name: "", job_title: `Visiteur · ${visitor.client_name}` }
        : employee,
    [visitor, employee],
  );

  // Pour qui l'atelier travaille : nom du client au-dessus de chaque machine en impression.
  const printing = useMemo(() => {
    const out: { id: string; client: string; pos: { x: number; y: number; z: number } }[] = [];
    for (const w of Object.values(workOrders)) {
      if (w.status !== "active" || w.stage !== "printing" || !w.asset_id || !w.client_name) continue;
      const o = Object.values(objects).find((x) => x.entity_type === "asset" && x.entity_id === w.asset_id);
      if (o) out.push({ id: w.id, client: w.client_name, pos: { x: o.position.x, y: 2.6, z: o.position.z } });
    }
    return out;
  }, [workOrders, objects]);
  // Livraisons en cours : camion ou appareil qui part, au nom du client livré.
  const departures = [
    ...effects.filter((e) => e.kind === "depart" && e.label).map((e) => ({ key: `fx:${e.id}`, label: e.label! })),
    ...Object.keys(departed)
      .map((id) => ({ key: `plane:${id}`, label: workOrders[id]?.client_name ?? "" }))
      .filter((d) => d.label),
  ];

  useEffect(() => {
    for (const p of printing) labelAnchors.set(`wo:${p.id}`, () => p.pos);
    return () => {
      for (const p of printing) labelAnchors.delete(`wo:${p.id}`);
    };
  }, [printing]);

  const departureKeys = departures.map((d) => d.key).join("|");
  useEffect(() => {
    const keys = departureKeys ? departureKeys.split("|") : [];
    for (const k of keys)
      labelAnchors.set(k, () => {
        const p = livePositions.get(k);
        return p ? { x: p.x, y: p.y + 4.5, z: p.z } : null;
      });
    return () => {
      for (const k of keys) labelAnchors.delete(k);
    };
  }, [departureKeys]);

  useEffect(() => {
    for (const z of zones) {
      const [x1, z1, x2] = rectOf(z);
      const pos = { x: (x1 + x2) / 2, y: z.type === "hangar" ? 3.2 : 2.2, z: z1 + 0.2 };
      labelAnchors.set(`zone:${z.id}`, () => pos);
    }
    return () => {
      for (const z of zones) labelAnchors.delete(`zone:${z.id}`);
    };
  }, [zones]);

  useEffect(() => {
    if (!emp) return;
    labelAnchors.set("person", () => {
      const p = livePositions.get(emp.id);
      return p ? { x: p.x, y: 2.9, z: p.z } : null;
    });
    return () => {
      labelAnchors.delete("person");
    };
  }, [emp]);

  const counts: Record<string, number> = {};
  for (const e of employees)
    if (presence[e.id]?.status === "at_station" && e.home_zone_id)
      counts[e.home_zone_id] = (counts[e.home_zone_id] ?? 0) + 1;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {zones.map((z) => (
        <button
          key={z.id}
          ref={register(`zone:${z.id}`)}
          onClick={() => select({ kind: "zone", id: z.id })}
          data-testid={`zone-label-${z.key}`}
          style={{ visibility: "hidden" }}
          className="pointer-events-auto absolute top-0 left-0 rounded-full border border-white/40 bg-[#14171c]/80 px-3 py-1 text-[12px] font-medium whitespace-nowrap text-white shadow-lg backdrop-blur will-change-transform hover:bg-[#14171c]"
        >
          {z.restricted && <span className="mr-1 text-[#facc15]">⚠</span>}
          {z.name}
          {(counts[z.id] ?? 0) > 0 && (
            <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-[11px]">{counts[z.id]}</span>
          )}
        </button>
      ))}
      {printing.map((p) => (
        <button
          key={p.id}
          ref={register(`wo:${p.id}`)}
          onClick={() => select({ kind: "work_order", id: p.id })}
          data-testid="client-tag"
          style={{ visibility: "hidden" }}
          className="pointer-events-auto absolute top-0 left-0 max-w-[180px] truncate rounded-md border border-[#ff6b2c]/60 bg-[#14171c]/80 px-2 py-0.5 text-[11px] whitespace-nowrap text-white shadow will-change-transform hover:bg-[#14171c]"
        >
          <span className="mr-1 text-[#ff8a52]">●</span>
          {p.client}
        </button>
      ))}
      {departures.map((d) => (
        <div
          key={d.key}
          ref={register(d.key)}
          data-testid="departure-label"
          style={{ visibility: "hidden" }}
          className="absolute top-0 left-0 rounded-md bg-[#0d9488]/90 px-2 py-1 text-[12px] font-semibold whitespace-nowrap text-white shadow-lg"
        >
          Livraison · {d.label}
        </div>
      ))}
      {emp && (
        <div
          ref={register("person")}
          style={{ visibility: "hidden" }}
          className="absolute top-0 left-0 rounded-md bg-[#14171c]/90 px-2 py-1 text-center text-[12px] whitespace-nowrap text-white shadow-lg"
        >
          <div className="font-semibold">
            {emp.first_name} {emp.last_name}
          </div>
          <div className="text-white/70">{emp.job_title}</div>
        </div>
      )}
    </div>
  );
}
