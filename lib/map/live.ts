"use client";

import { useEffect, useState } from "react";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/client";
import { useMap, type EffectKind } from "./store";
import { centerOf, rectOf, workOrderAnchor, entranceOf } from "./layout";
import type { MapEvent, MapWorkOrder, PresenceState, Selection, Vec3 } from "./types";

/** Remplit le gabarit de notification de la fiche secteur avec la charge utile de l'événement. */
export function renderTemplate(template: string, payload: Record<string, unknown>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = payload[k];
    return v === undefined || v === null ? "…" : String(v);
  });
}

export function eventLabel(type: string) {
  const def = sectorConfig.liveEvents.find((e) => e.activityType === type);
  if (def) return def.label;
  return (
    {
      "asset.repaired": "Machine réparée",
      "asset.maintenance": "Maintenance",
      "badge.break_start": "Départ en pause",
      "work_order.stage": "Changement d'étape",
      "floor_plan.updated": "Plan modifié",
      "stock.received": "Réception fournisseur",
      "purchase_order.sent": "Commande fournisseur envoyée",
      "invoice.sent": "Facture émise",
      "payment.received": "Paiement reçu",
      "deal.stage": "Affaire déplacée",
      "quote.sent": "Devis envoyé",
      "leave.requested": "Demande de congé",
      "leave.approved": "Congé validé",
      "leave.rejected": "Congé refusé",
      "candidate.hired": "Recrutement",
      "message.received": "Nouveau message",
      "message.sent": "Réponse envoyée",
    } as Record<string, string>
  )[type] ?? type;
}

function describe(e: MapEvent): { title: string; body: string; tone: "info" | "ok" | "warn" | "danger" } {
  const def = sectorConfig.liveEvents.find((d) => d.activityType === e.type);
  const p = e.payload ?? {};
  const body = def ? renderTemplate(def.notification, p) : String(p.name ?? p.machine ?? p.number ?? "");
  const tone =
    e.type === "asset.down" || (e.type === "work_order.qc" && p.result === "rejeté")
      ? "danger"
      : e.type === "stock.low"
        ? "warn"
        : e.type === "work_order.qc" || e.type === "asset.repaired" || e.type === "quote.accepted"
          ? "ok"
          : "info";
  return { title: eventLabel(e.type), body: p.reason ? `${body} — ${p.reason}` : body, tone };
}

/** Où et comment l'événement s'anime sur la map. */
function effectFor(e: MapEvent): { kind: EffectKind; color: string; position: Vec3; focus?: Selection } | null {
  const st = useMap.getState();
  const objects = Object.values(st.objects);
  const p = e.payload ?? {};
  const objOf = (type: string, id: string | null | undefined) => objects.find((o) => o.entity_type === type && o.entity_id === id);
  const woPos = (id: string | null) => {
    const wo = id ? st.workOrders[id] : undefined;
    return wo ? workOrderAnchor(wo, objects, st.zones) : null;
  };
  switch (e.type) {
    case "work_order.created":
    case "quote.accepted": {
      const id = (p.work_order_id as string) ?? e.entity_id;
      const pos = woPos(id) ?? centerOf(rectOf(st.zones.find((z) => z.type === "office") ?? st.zones[0]));
      return { kind: "pulse", color: "#38bdf8", position: pos, focus: id ? { kind: "work_order", id } : undefined };
    }
    case "work_order.stage.printing_done": {
      const o = objOf("asset", p.asset_id as string);
      return o ? { kind: "sparkle", color: "#ffcf70", position: o.position, focus: { kind: "asset", id: o.entity_id! } } : null;
    }
    case "work_order.qc": {
      const pos = centerOf(rectOf(st.zones.find((z) => z.type === "quality") ?? st.zones[0]));
      const ok = p.result === "validé";
      return { kind: ok ? "halo_ok" : "halo_ko", color: ok ? "#22c55e" : "#ef4444", position: pos, focus: e.entity_id ? { kind: "work_order", id: e.entity_id } : undefined };
    }
    case "shipment.departed": {
      const mode = p.mode as string;
      if (e.entity_id && (mode === "seaplane" || mode === "jet")) st.markDeparted(e.entity_id, "takeoff");
      const pos = woPos(e.entity_id) ?? centerOf(rectOf(st.zones.find((z) => z.type === "dock" || z.type === "shipping") ?? st.zones[0]));
      if (mode === "truck") {
        const dock = st.zones.find((z) => z.type === "dock");
        if (dock) {
          const [, z1, x2, z2] = rectOf(dock);
          st.addEffect({ kind: "depart", color: "#ffffff", position: { x: x2, y: 0, z: (z1 + z2) / 2 } });
        }
      }
      return { kind: "pulse", color: "#14b8a6", position: pos };
    }
    case "stock.low": {
      const o = objOf("stock_item", e.entity_id);
      return o ? { kind: "alert", color: "#f59e0b", position: o.position, focus: { kind: "stock_item", id: e.entity_id! } } : null;
    }
    case "asset.down":
    case "asset.repaired": {
      const o = objOf("asset", e.entity_id);
      const down = e.type === "asset.down";
      return o ? { kind: down ? "halo_ko" : "halo_ok", color: down ? "#ef4444" : "#22c55e", position: o.position, focus: { kind: "asset", id: e.entity_id! } } : null;
    }
    case "stock.received": {
      const dock = st.zones.find((z) => z.type === "dock") ?? st.zones.find((z) => z.type === "storage");
      return dock ? { kind: "pulse", color: "#22c55e", position: centerOf(rectOf(dock)) } : null;
    }
    case "badge.in":
    case "badge.break_start":
      return { kind: "pulse", color: "#a78bfa", position: entranceOf(st.zones), focus: e.entity_id ? { kind: "employee", id: e.entity_id } : undefined };
    default:
      return null;
  }
}

export function handleActivity(e: MapEvent) {
  const st = useMap.getState();
  if (st.events.some((x) => x.id === e.id)) return;
  st.pushEvent(e);
  const siteId = e.payload?.site_id as string | undefined;
  if (siteId && siteId !== st.site?.id) return; // événement d'un autre site : fil seulement
  const fx = effectFor(e);
  if (fx) st.addEffect({ kind: fx.kind, color: fx.color, position: fx.position, entityId: e.entity_id });
  const d = describe(e);
  st.addToast({ ...d, focus: fx?.focus });
}

const badgeToPresence: Record<string, PresenceState> = { in: "at_station", break_end: "at_station", break_start: "on_break", out: "absent" };

/** Abonnement Realtime : la map n'a pas de données propres, elle suit les tables partagées. */
export function useMapRealtime(orgId: string, siteId: string) {
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      const st = useMap.getState;
      const org = `org_id=eq.${orgId}`;
      channel = supabase
        .channel(`map:${orgId}:${siteId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events", filter: org }, (m) => handleActivity(m.new as MapEvent))
        .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: org }, (m) => {
          const row = m.new as MapWorkOrder & { site_id: string };
          if (!row?.id || row.site_id !== siteId) return;
          const prev = st().workOrders[row.id];
          st().upsertWorkOrder({ ...row, client_name: prev?.client_name ?? null });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "assets", filter: org }, (m) => st().upsertAsset(m.new as { id: string }))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stock_items", filter: org }, (m) => {
          const r = m.new as { id: string; quantity: number; min_quantity: number };
          st().upsertStock({ id: r.id, quantity: Number(r.quantity), min_quantity: Number(r.min_quantity) });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "map_objects", filter: org }, (m) => {
          const r = m.new as { id: string; position: Vec3; rotation: number };
          if (!st().drafts[r.id]) st().upsertObject({ id: r.id, position: r.position, rotation: r.rotation });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "badge_events", filter: org }, (m) => {
          const r = m.new as { employee_id: string; kind: string; at: string };
          const s = badgeToPresence[r.kind];
          if (s) st().setPresence(r.employee_id, s, r.at);
        })
        .subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CLOSED" || s === "CHANNEL_ERROR" ? "offline" : "connecting"));
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [orgId, siteId]);
  return status;
}
