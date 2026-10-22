"use client";

import { useEffect, useRef, useState } from "react";
import { sectorConfig } from "@/config/sector.config";

export interface BarSeries {
  name: string;
  /** Variable CSS de la série (--series-1, --series-2). */
  color: string;
}

const { locale, currency } = sectorConfig.company;
const full = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });

/** Graduation « ronde » : 1, 2 ou 5 × 10^n. */
function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

/**
 * Colonnes (une ou deux séries) : barres fines arrondies côté valeur, une seule échelle,
 * info-bulle au survol de chaque colonne, étiquette directe sur la colonne mise en avant,
 * et vue tableau pour l'accessibilité.
 */
export function BarChart({
  title,
  data,
  series,
  highlight,
  height = 220,
  testId,
}: {
  title: string;
  data: { label: string; values: number[]; note?: string }[];
  series: BarSeries[];
  highlight?: number;
  height?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 22, right: 8, bottom: 24, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const all = data.flatMap((d) => d.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const step = niceStep(max - min || 1);
  const top = Math.ceil(max / step) * step || step;
  const bottom = Math.floor(min / step) * step;
  const y = (v: number) => pad.top + ((top - v) / (top - bottom)) * plotH;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);
  const band = plotW / data.length;
  const gap = 2;
  const barW = Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length);
  const groupW = barW * series.length + gap * (series.length - 1);
  const r = Math.min(4, barW / 2);

  // Barre arrondie côté valeur, carrée à la ligne de base.
  const bar = (x: number, v: number) => {
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.abs(y0 - y1);
    if (h < 0.5) return "";
    const rr = Math.min(r, h);
    if (v >= 0) return `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + barW - rr} Q${x + barW},${y1} ${x + barW},${y1 + rr} V${y0} Z`;
    return `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + barW - rr} Q${x + barW},${y1} ${x + barW},${y1 - rr} V${y0} Z`;
  };

  const h = hover !== null ? data[hover] : null;
  const tipX = hover !== null ? pad.left + band * hover + band / 2 : 0;

  return (
    <figure className="relative" data-testid={testId}>
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(${s.color})` }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
      <div ref={ref} className="relative">
        <svg width={width} height={height} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : "2 3"} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular-nums">
                {compact.format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.left + band * i + (band - groupW) / 2;
            return (
              <g key={d.label}>
                {hover === i && <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH} fill="var(--surface-2)" />}
                {d.values.map((v, k) => {
                  const path = bar(x0 + k * (barW + gap), v);
                  return path ? <path key={k} d={path} fill={`var(${series[k].color})`} /> : null;
                })}
                <text x={pad.left + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={i === highlight ? "var(--text)" : "var(--text-muted)"} fontWeight={i === highlight ? 600 : 400}>
                  {d.label}
                </text>
                {i === highlight && series.length === 1 && (
                  <text x={x0 + barW / 2} y={y(Math.max(0, d.values[0])) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text)" className="tabular-nums">
                    {compact.format(d.values[0])}
                  </text>
                )}
                {/* Zone de survol : toute la colonne, plus large que la barre */}
                <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH + pad.bottom} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label} : ${d.values.map((v, k) => `${series[k].name} ${full.format(v)}`).join(", ")}`} />
              </g>
            );
          })}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(tipX - 80, 0), width - 170), top: 0 }}
            role="status"
          >
            <p className="mb-1 font-medium">{h.label}</p>
            {h.values.map((v, k) => (
              <p key={k} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: `var(${series[k].color})` }} />
                  {series[k].name}
                </span>
                <span className="tabular-nums">{full.format(v)}</span>
              </p>
            ))}
            {h.note && <p className="mt-1 border-t border-border pt-1 text-muted">{h.note}</p>}
          </div>
        )}
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">Voir les données</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Mois</th>
              {series.map((s) => <th key={s.name} className="py-1 text-right font-medium">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-border">
                <td className="py-1">{d.label}</td>
                {d.values.map((v, k) => <td key={k} className="py-1 text-right tabular-nums text-text">{full.format(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
