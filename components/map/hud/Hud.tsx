"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { Logo } from "@/components/ui/primitives";
import { computeKpis, kpiTone, todayIso } from "@/lib/domain/kpis";
import { eventLabel, renderTemplate } from "@/lib/map/live";
import { useMap } from "@/lib/map/store";
import { centerOf, rectOf, workOrderAnchor } from "@/lib/map/layout";
import type { Selection } from "@/lib/map/types";
import { saveLayout, triggerLiveEvent } from "@/app/(map)/map/[siteId]/actions";

const glass = "rounded-2xl border border-white/10 bg-[#11151b]/78 text-white shadow-2xl backdrop-blur-md";
const toneText = { ok: "text-[#4ade80]", warn: "text-[#fbbf24]", danger: "text-[#f87171]", neutral: "text-white" };
const time = (at: string | number) =>
  new Date(at).toLocaleTimeString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, hour: "2-digit", minute: "2-digit" });

/** Position de recentrage caméra pour une sélection. */
export function focusOf(sel: Selection): { x: number; y: number; z: number } | null {
  const st = useMap.getState();
  const objects = Object.values(st.objects);
  if (sel.kind === "asset" || sel.kind === "stock_item") return objects.find((o) => o.entity_id === sel.id)?.position ?? null;
  if (sel.kind === "work_order") {
    const wo = st.workOrders[sel.id];
    return wo ? workOrderAnchor(wo, objects, st.zones) : null;
  }
  if (sel.kind === "zone") {
    const z = st.zones.find((x) => x.id === sel.id);
    return z ? centerOf(rectOf(z)) : null;
  }
  const e = st.employees.find((x) => x.id === sel.id);
  const z = st.zones.find((x) => x.id === e?.home_zone_id);
  return z ? centerOf(rectOf(z)) : null;
}

export function TopBar({ status, userName, roleLabel }: { status: "connecting" | "live" | "offline"; userName: string; roleLabel: string }) {
  const t = useTranslations("map");
  const site = useMap((s) => s.site);
  const assets = useMap((s) => s.assets);
  const workOrders = useMap((s) => s.workOrders);
  const kpis = useMemo(() => {
    const values = computeKpis({
      machines: Object.values(assets).filter((a) => a.kind === "machine"),
      orders: Object.values(workOrders),
      today: todayIso(sectorConfig.company.timezone),
    });
    return sectorConfig.kpis
      .filter((k) => !k.optional)
      .map((k) => ({ ...k, ...(values[k.id] ?? { value: null }), tone: kpiTone(values[k.id]?.value ?? null, k.good, k.warn) }));
  }, [assets, workOrders]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
      <div className={clsx(glass, "pointer-events-auto flex items-center gap-3 px-3 py-2")}>
        <Logo size={34} />
        <p className="text-sm font-semibold whitespace-nowrap">{sectorConfig.company.name}</p>
        <div className="ml-2 flex gap-1">
          {sectorConfig.sites.map((s) => (
            <Link
              key={s.id}
              href={`/map/${s.id}`}
              data-testid={`site-${s.id}`}
              className={clsx("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap", s.id === site?.key ? "bg-accent text-white" : "bg-white/10 text-white/80 hover:bg-white/20")}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <div className={clsx(glass, "pointer-events-auto hidden items-stretch divide-x divide-white/10 md:flex")}>
        {kpis.map((k) => (
          <div key={k.id} className="w-36 px-3 py-2 text-center xl:w-44" data-testid={`hud-kpi-${k.id}`}>
            <p className={clsx("text-2xl leading-none font-semibold tabular-nums transition-colors", toneText[k.tone])}>
              {k.value ?? "—"}
              {k.unit === "percent" && k.value !== null && <span className="text-base">%</span>}
            </p>
            <p className="mt-1 truncate text-[11px] text-white/60" title={k.label}>{k.label}</p>
            {k.detail && <p className="text-[10px] text-white/40">{k.detail}</p>}
          </div>
        ))}
      </div>

      <div className={clsx(glass, "pointer-events-auto flex items-center gap-3 px-3 py-2")}>
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap" data-testid="map-realtime">
          <span className={clsx("h-2 w-2 rounded-full", status === "live" ? "animate-pulse bg-[#22c55e]" : status === "offline" ? "bg-[#ef4444]" : "bg-[#f59e0b]")} />
          {t(status)}
        </span>
        <span className="rounded-full bg-[#f59e0b]/20 px-2 py-0.5 text-[11px] whitespace-nowrap text-[#fbbf24]" title="Aucune intégration connectée : e-mails, agendas et fichiers simulés">
          ● Simulé
        </span>
        <div className="hidden text-right leading-tight 2xl:block">
          <p className="text-xs font-medium whitespace-nowrap">{userName}</p>
          <p className="text-[10px] text-white/50">{roleLabel}</p>
        </div>
        <Link href="/dashboard" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-[#11151b] hover:bg-white/90">
          {t("backoffice")} →
        </Link>
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const t = useTranslations("map");
  const events = useMap((s) => s.events);
  const [open, setOpen] = useState(true);
  return (
    <div className={clsx(glass, "pointer-events-auto absolute top-24 left-3 w-72 overflow-hidden")} data-testid="activity-feed">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wide text-white/70 uppercase">
        {t("activity")} <span>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <ul className="max-h-[42vh] space-y-px overflow-y-auto px-2 pb-2">
          {events.length === 0 && <li className="px-2 py-2 text-xs text-white/50">{t("noActivity")}</li>}
          {events.slice(0, 14).map((e, i) => {
            const def = sectorConfig.liveEvents.find((d) => d.activityType === e.type);
            return (
              <li key={e.id} className={clsx("rounded-lg px-2 py-1.5 text-xs", i === 0 && "animate-[fadein_.6s] bg-white/8")}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{eventLabel(e.type)}</span>
                  <span className="text-white/40 tabular-nums">{time(e.at)}</span>
                </div>
                {def && <p className="truncate text-white/55">{renderTemplate(def.notification, e.payload ?? {})}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useMap((s) => s.toasts);
  const dismiss = useMap((s) => s.dismissToast);
  const select = useMap((s) => s.select);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => dismiss(toasts[toasts.length - 1].id), 6500);
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);
  const border = { info: "border-l-[#38bdf8]", ok: "border-l-[#22c55e]", warn: "border-l-[#f59e0b]", danger: "border-l-[#ef4444]" };
  return (
    <div className="pointer-events-none absolute top-28 left-1/2 flex w-[380px] -translate-x-1/2 flex-col gap-2" data-testid="toasts">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            if (t.focus) select(t.focus, focusOf(t.focus));
            dismiss(t.id);
          }}
          className={clsx(glass, "pointer-events-auto animate-[toastin_.35s_ease-out] border-l-4 px-4 py-3 text-left", border[t.tone])}
        >
          <p className="text-sm font-semibold">{t.title}</p>
          <p className="text-xs text-white/70">{t.body}</p>
        </button>
      ))}
    </div>
  );
}

/** Timeline du scénario de démo : chaque événement live de la fiche, ou toute la séquence. */
export function ScenarioBar() {
  const t = useTranslations("map");
  const site = useMap((s) => s.site);
  const canRun = useMap((s) => s.canRunScenario);
  const canEdit = useMap((s) => s.canEdit);
  const editMode = useMap((s) => s.editMode);
  const quality = useMap((s) => s.quality);
  const timeMode = useMap((s) => s.timeMode);
  const fps = useMap((s) => s.fps);
  const { setEditMode, setQuality, setTimeMode, addToast } = useMap.getState();
  const [active, setActive] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef(false);

  async function fire(id: string) {
    if (!site) return;
    setActive(id);
    const r = await triggerLiveEvent(site.key, id);
    if (!r.ok) addToast({ title: t("eventFailed"), body: r.reason, tone: "warn" });
    setActive(null);
  }

  async function play() {
    setPlaying(true);
    stopRef.current = false;
    for (const e of sectorConfig.liveEvents) {
      if (stopRef.current) break;
      await fire(e.id);
      await new Promise((r) => setTimeout(r, 5200));
    }
    setPlaying(false);
  }

  if (editMode) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-3 p-3">
      <div className={clsx(glass, "pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-2 overflow-x-auto px-3 py-2")} data-testid="scenario-bar">
        {canRun && (
          <>
            <span className="pr-1 text-[11px] font-semibold tracking-wide whitespace-nowrap text-white/50 uppercase">{t("scenario")}</span>
            <button
              onClick={() => (playing ? (stopRef.current = true) : play())}
              data-testid="scenario-play"
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white hover:brightness-110"
            >
              {playing ? `■ ${t("stop")}` : `▶ ${t("play")}`}
            </button>
            <div className="mx-1 h-6 w-px bg-white/10" />
            {sectorConfig.liveEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => fire(e.id)}
                disabled={!!active}
                data-testid={`event-${e.id}`}
                className={clsx(
                  "rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition",
                  active === e.id ? "bg-white text-[#11151b]" : "bg-white/8 text-white/85 hover:bg-white/15",
                  active && active !== e.id && "opacity-50",
                )}
              >
                {e.label}
              </button>
            ))}
            <div className="mx-1 h-6 w-px bg-white/10" />
          </>
        )}
        {canEdit && (
          <button onClick={() => setEditMode(true)} data-testid="edit-plan" className="rounded-lg bg-white/8 px-2.5 py-1.5 text-xs whitespace-nowrap hover:bg-white/15">
            ✎ {t("edit")}
          </button>
        )}
        <button
          onClick={() => setTimeMode(timeMode === "auto" ? "day" : timeMode === "day" ? "night" : "auto")}
          data-testid="time-toggle"
          data-mode={timeMode}
          className="rounded-lg bg-white/8 px-2.5 py-1.5 text-xs whitespace-nowrap hover:bg-white/15"
          title={t("timeTitle")}
        >
          {timeMode === "auto" ? `◐ ${t("timeAuto")}` : timeMode === "day" ? `☀ ${t("timeDay")}` : `☾ ${t("timeNight")}`}
        </button>
        <button
          onClick={() => setQuality(quality === "high" ? "low" : "high", true)}
          data-testid="quality-toggle"
          className="rounded-lg bg-white/8 px-2.5 py-1.5 text-xs whitespace-nowrap hover:bg-white/15"
          title={t("quality")}
        >
          {quality === "high" ? `✦ ${t("qualityHigh")}` : `⚡ ${t("qualityLow")}`}
          <span className={clsx("ml-1.5 tabular-nums", fps >= 55 ? "text-[#4ade80]" : fps >= 30 ? "text-[#fbbf24]" : "text-[#f87171]")} data-testid="fps">
            {fps} i/s
          </span>
        </button>
      </div>
    </div>
  );
}

export function EditToolbar() {
  const t = useTranslations("map");
  const editMode = useMap((s) => s.editMode);
  const drafts = useMap((s) => s.drafts);
  const selection = useMap((s) => s.selection);
  const objects = useMap((s) => s.objects);
  const { rotateDraft, setEditMode, discardDrafts, commitDrafts, addToast } = useMap.getState();
  const [pending, start] = useTransition();
  const selectedObject = selection ? Object.values(objects).find((o) => o.entity_id === selection.id) : undefined;

  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        discardDrafts();
        setEditMode(false);
      }
      if ((e.key === "r" || e.key === "R") && selectedObject) rotateDraft(selectedObject.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, selectedObject, rotateDraft, discardDrafts, setEditMode]);

  if (!editMode) return null;
  const count = Object.keys(drafts).length;
  const save = () =>
    start(async () => {
      const r = await saveLayout(Object.entries(drafts).map(([id, d]) => ({ id, ...d })));
      if (r.ok) {
        commitDrafts();
        setEditMode(false);
        addToast({ title: t("saved"), body: t("changes", { count: r.saved }), tone: "ok" });
      } else addToast({ title: t("eventFailed"), body: r.reason ?? "", tone: "danger" });
    });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
      <div className={clsx(glass, "pointer-events-auto flex items-center gap-3 border-[#38bdf8]/40 px-4 py-2.5")} data-testid="edit-toolbar">
        <div>
          <p className="text-sm font-semibold text-[#7dd3fc]">{t("editing")}</p>
          <p className="text-[11px] text-white/55">{t("editHint")}</p>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t("changes", { count })}</span>
        <button disabled={!selectedObject} onClick={() => selectedObject && rotateDraft(selectedObject.id)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs disabled:opacity-40">
          ⟳ {t("rotate")}
        </button>
        <button
          onClick={() => {
            discardDrafts();
            setEditMode(false);
          }}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
        >
          {t("cancel")}
        </button>
        <button onClick={save} disabled={!count || pending} data-testid="save-plan" className="rounded-lg bg-[#38bdf8] px-3 py-1.5 text-xs font-semibold text-[#082f49] disabled:opacity-40">
          {t("save")}
        </button>
      </div>
    </div>
  );
}
