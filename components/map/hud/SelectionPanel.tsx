"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { useMap } from "@/lib/map/store";
import { ASSET_STATUS_LABEL, PRESENCE_LABEL, STATUS_COLOR } from "@/lib/map/theme";
import { todayIso } from "@/lib/domain/kpis";
import { formatDate, formatNumber } from "@/lib/format";
import type { MapWorkOrder } from "@/lib/map/types";

const glass = "rounded-2xl border border-white/10 bg-[#11151b]/85 text-white shadow-2xl backdrop-blur-md";
const stages = sectorConfig.workOrder.stages;
const time = (at: string) => new Date(at).toLocaleTimeString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone, hour: "2-digit", minute: "2-digit" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/8 py-1.5 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

function Stepper({ wo }: { wo: MapWorkOrder }) {
  const idx = stages.findIndex((s) => s.id === wo.stage);
  return (
    <div className="my-3">
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <div key={s.id} className="h-1.5 flex-1 rounded-full" style={{ background: i < idx ? s.color : i === idx ? s.color : "rgba(255,255,255,.1)", opacity: i === idx ? 1 : i < idx ? 0.7 : 1 }} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-white/70">
        {wo.status === "done" ? "Expédié ✓" : stages[idx]?.label} · {wo.progress}%
      </p>
    </div>
  );
}

function WorkOrderCard({ wo }: { wo: MapWorkOrder }) {
  const t = useTranslations("map");
  const late = wo.status === "active" && wo.due_date && wo.due_date < todayIso(sectorConfig.company.timezone);
  return (
    <div className="mt-3 rounded-xl bg-white/5 p-3">
      <p className="text-[11px] text-white/50">{wo.number}</p>
      <p className="text-sm font-medium">{wo.title}</p>
      <Stepper wo={wo} />
      {wo.client_name && <Row label={t("client")}>{wo.client_name}</Row>}
      {wo.due_date && (
        <Row label={t("due")}>
          {formatDate(wo.due_date)} {late && <span className="ml-1 rounded bg-[#ef4444]/25 px-1.5 text-[11px] text-[#fca5a5]">{t("late")}</span>}
        </Row>
      )}
      {wo.traceability?.norme && <Row label="Traçabilité">{wo.traceability.norme}</Row>}
    </div>
  );
}

export function SelectionPanel() {
  const t = useTranslations("map");
  const sel = useMap((s) => s.selection);
  const editMode = useMap((s) => s.editMode);
  const st = useMap();
  if (!sel || editMode) return null;

  let title = "";
  let subtitle = "";
  let body: React.ReactNode = null;
  let href = "/dashboard";

  if (sel.kind === "asset") {
    const a = st.assets[sel.id];
    if (!a) return null;
    const wo = Object.values(st.workOrders).find((w) => w.asset_id === a.id && w.status === "active");
    title = a.name;
    subtitle = `${a.code}${a.technology ? ` · ${sectorConfig.technologies.find((x) => x.id === a.technology)?.label ?? a.technology}` : ""}`;
    href = wo ? `/ops/work-orders/${wo.id}` : `/resources/equipment/${a.id}`;
    body = (
      <>
        <Row label={t("status")}>
          <Dot color={STATUS_COLOR[a.status] ?? "#94a3b8"} />
          {ASSET_STATUS_LABEL[a.status] ?? a.status}
        </Row>
        {a.next_maintenance_on && <Row label={t("nextMaintenance")}>{formatDate(a.next_maintenance_on)}</Row>}
        {Object.entries(a.specs ?? {})
          .filter(([k]) => k !== "visual")
          .map(([k, v]) => (
            <Row key={k} label={k}>
              {String(v)}
            </Row>
          ))}
        {wo ? <WorkOrderCard wo={wo} /> : <p className="mt-3 text-sm text-white/50">{t("noJob")}</p>}
      </>
    );
  } else if (sel.kind === "stock_item") {
    const s = st.stock[sel.id];
    if (!s) return null;
    const low = s.quantity < s.min_quantity;
    const ratio = Math.min(1, s.quantity / Math.max(s.min_quantity * 2.5, 1));
    title = s.label;
    subtitle = s.sku;
    href = `/resources?stock=${s.id}`;
    body = (
      <>
        <div className="my-3">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ratio * 100}%`, background: low ? "#f59e0b" : "#22c55e" }} />
          </div>
          {low && <p className="mt-1 text-xs text-[#fbbf24]">⚠ {t("lowStock")}</p>}
        </div>
        <Row label={t("quantity")}>
          {formatNumber(s.quantity)} {s.unit}
        </Row>
        <Row label={t("minimum")}>
          {formatNumber(s.min_quantity)} {s.unit}
        </Row>
        {s.supplier_name && <Row label={t("supplier")}>{s.supplier_name}</Row>}
        <Link href={`/resources/stock/${s.id}`} className="mt-3 block w-full rounded-lg bg-white/10 py-2 text-center text-xs hover:bg-white/20" data-testid="map-reorder">
          {low ? `${t("reorder")} →` : "Voir le stock →"}
        </Link>
      </>
    );
  } else if (sel.kind === "employee") {
    const e = st.employees.find((x) => x.id === sel.id);
    if (!e) return null;
    const p = st.presence[e.id];
    const zone = st.zones.find((z) => z.id === e.home_zone_id);
    title = `${e.first_name} ${e.last_name}`;
    subtitle = e.job_title;
    href = `/hr?employee=${e.id}`;
    const color = p?.status === "at_station" ? "#22c55e" : p?.status === "on_break" ? "#38bdf8" : p?.status === "in_meeting" ? "#a78bfa" : "#64748b";
    body = (
      <>
        <Row label={t("presence")}>
          <Dot color={color} />
          {PRESENCE_LABEL[p?.status ?? "absent"]}
          {p?.since && <span className="text-white/50"> · {t("since")} {time(p.since)}</span>}
        </Row>
        {p?.current_activity && <Row label="Agenda">{p.current_activity}</Row>}
        {zone && <Row label={t("zone")}>{zone.name}</Row>}
        {e.role_key && <Row label="Rôle">{sectorConfig.roles.find((r) => r.id === e.role_key)?.label ?? e.role_key}</Row>}
      </>
    );
  } else if (sel.kind === "work_order") {
    const wo = st.workOrders[sel.id];
    if (!wo) return null;
    title = wo.physical_object ?? wo.title;
    subtitle = `${sectorConfig.workOrder.label} ${wo.number}`;
    href = `/ops?wo=${wo.id}`;
    body = <WorkOrderCard wo={wo} />;
  } else {
    const z = st.zones.find((x) => x.id === sel.id);
    if (!z) return null;
    const people = st.employees.filter((e) => e.home_zone_id === z.id && st.presence[e.id]?.status === "at_station");
    const objs = Object.values(st.objects).filter((o) => o.zone_id === z.id && o.entity_type === "asset");
    title = z.name;
    subtitle = sectorConfig.sites.flatMap((s) => [...s.zones, ...s.outdoor]).find((x) => x.id === z.key)?.type ?? z.type;
    href = `/resources?zone=${z.id}`;
    body = (
      <>
        {z.restricted && <p className="mt-2 rounded-lg bg-[#facc15]/15 px-2 py-1.5 text-xs text-[#fde68a]">⚠ {t("restricted")}</p>}
        {z.capacity && <Row label="Capacité">{z.capacity}</Row>}
        <Row label={t("people")}>{people.length}</Row>
        <Row label={t("objects")}>{objs.length}</Row>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button key={p.id} onClick={() => st.select({ kind: "employee", id: p.id })} className="rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
              {p.first_name} {p.last_name[0]}.
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <aside className={clsx(glass, "pointer-events-auto absolute top-24 right-3 w-80 animate-[panelin_.3s_ease-out] p-4")} data-testid="selection-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] tracking-wide text-white/45 uppercase">{subtitle}</p>
          <h2 className="text-lg leading-tight font-semibold">{title}</h2>
        </div>
        <button onClick={() => st.select(null, null)} className="rounded-lg px-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label={t("close")}>
          ✕
        </button>
      </div>
      <div className="mt-2">{body}</div>
      <Link href={href} data-testid="open-backoffice" className="mt-4 flex w-full items-center justify-center rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:brightness-110">
        {t("open")} →
      </Link>
    </aside>
  );
}
