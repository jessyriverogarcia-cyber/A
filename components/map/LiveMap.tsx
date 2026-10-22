"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useMap } from "@/lib/map/store";
import { useMapRealtime } from "@/lib/map/live";
import type { SiteSnapshot } from "@/lib/map/types";
import { ActivityFeed, EditToolbar, ScenarioBar, Toasts, TopBar } from "./hud/Hud";
import { SelectionPanel } from "./hud/SelectionPanel";
import { Labels } from "./hud/Labels";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-white/60">
      <span className="animate-pulse">Chargement de la maquette 3D…</span>
    </div>
  ),
});

export function LiveMap({ snapshot, userName, roleLabel }: { snapshot: SiteSnapshot; userName: string; roleLabel: string }) {
  const t = useTranslations("map");
  // La scène reste montée d'un site à l'autre : seules les données changent.
  const ready = useMap((s) => s.ready);
  const status = useMapRealtime(snapshot.orgId, snapshot.site.id);

  useEffect(() => {
    useMap.getState().init(snapshot);
  }, [snapshot]);

  // ?q=cinema (tournage d'une démo) ou ?q=rapide : qualité imposée, sans bascule automatique.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q === "cinema") useMap.getState().setQuality("high", true);
    if (q === "rapide") useMap.getState().setQuality("low", true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useMap.getState().editMode) useMap.getState().select(null, null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0e1116] select-none" data-testid="live-map">
      <div className="absolute inset-0">{ready && <Scene />}</div>
      {ready && (
        <>
          <Labels />
          <TopBar status={status} userName={userName} roleLabel={roleLabel} />
          <ActivityFeed />
          <Toasts />
          <SelectionPanel />
          <ScenarioBar />
          <EditToolbar />
          <p className="pointer-events-none absolute bottom-16 left-3 rounded-full bg-[#11151b]/60 px-3 py-1 text-[11px] text-white/75 backdrop-blur">{t("legend")}</p>
        </>
      )}
    </div>
  );
}
