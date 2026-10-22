"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { computeQuoteTotals, lineNet } from "@/lib/domain/quote";
import { fromCents, toCents } from "@/lib/domain/money";
import { saveQuoteLinesAction } from "@/app/(backoffice)/crm/actions";

export interface EditorLine {
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount: number;
}
export interface CatalogItem {
  id: string;
  sku: string;
  label: string;
  unit: string;
  unit_price: number;
  unit_cost: number;
  category: string | null;
}

const money = new Intl.NumberFormat(sectorConfig.company.locale, { style: "currency", currency: sectorConfig.company.currency });
const pct = new Intl.NumberFormat(sectorConfig.company.locale, { style: "percent", maximumFractionDigits: 1 });
const cellBase = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 tabular-nums outline-none hover:border-border focus:border-accent focus:bg-surface";
const cell = `${cellBase} text-right`;

export function QuoteEditor({ quoteId, initialLines, initialNotes, catalog, editable }: { quoteId: string; initialLines: EditorLine[]; initialNotes: string; catalog: CatalogItem[]; editable: boolean }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [notes, setNotes] = useState(initialNotes);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const totals = useMemo(
    () =>
      computeQuoteTotals(
        lines.map((l) => ({ quantity: l.quantity || 0, unitPrice: toCents(l.unit_price || 0), unitCost: toCents(l.unit_cost || 0), discount: l.discount || 0 })),
        sectorConfig.company.vatRate,
        sectorConfig.company.rounding,
      ),
    [lines],
  );

  const update = (i: number, patch: Partial<EditorLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const add = (itemId: string) => {
    const it = catalog.find((c) => c.id === itemId);
    if (!it) return;
    setLines((ls) => [...ls, { catalog_item_id: it.id, description: it.label, quantity: 1, unit_price: it.unit_price, unit_cost: it.unit_cost, discount: 0 }]);
    setDirty(true);
  };
  const save = () =>
    start(async () => {
      const r = await saveQuoteLinesAction(quoteId, lines.filter((l) => l.description && l.quantity > 0), notes || null);
      setMsg(r.ok ? { ok: true, text: "Devis enregistré." } : { ok: false, text: r.reason ?? "Erreur" });
      if (r.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  const marginTone = totals.marginRate >= 0.45 ? "text-ok" : totals.marginRate >= 0.25 ? "text-warn" : "text-danger";
  const byCategory = catalog.reduce<Record<string, CatalogItem[]>>((acc, c) => ({ ...acc, [c.category ?? "Autres"]: [...(acc[c.category ?? "Autres"] ?? []), c] }), {});

  return (
    <div className="rounded-card border border-border bg-surface" data-testid="quote-editor">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Désignation</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Qté</th>
              <th className="w-32 px-3 py-2 text-right font-medium">PU HT</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Remise</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Total HT</th>
              <th className="w-28 px-3 py-2 text-right font-medium" title="Coût interne unitaire (non imprimé)">Coût int.</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={i} data-testid="quote-line">
                <td className="px-1 py-1">
                  <input value={l.description} disabled={!editable} onChange={(e) => update(i, { description: e.target.value })} className={`${cellBase} text-left`} />
                </td>
                <td className="px-1"><input type="number" min={0} step="any" value={l.quantity} disabled={!editable} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={cell} data-testid="line-qty" /></td>
                <td className="px-1"><input type="number" min={0} step="any" value={l.unit_price} disabled={!editable} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} className={cell} data-testid="line-price" /></td>
                <td className="px-1">
                  <div className="flex items-center">
                    <input type="number" min={0} max={100} step="any" value={Math.round(l.discount * 1000) / 10} disabled={!editable} onChange={(e) => update(i, { discount: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} className={cell} />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </td>
                <td className="px-3 text-right font-medium tabular-nums">{money.format(fromCents(lineNet({ quantity: l.quantity || 0, unitPrice: toCents(l.unit_price || 0), unitCost: 0, discount: l.discount })))}</td>
                <td className="px-1"><input type="number" min={0} step="any" value={l.unit_cost} disabled={!editable} onChange={(e) => update(i, { unit_cost: Number(e.target.value) })} className={clsx(cell, "text-muted")} /></td>
                <td className="pr-2 text-right">
                  {editable && (
                    <button onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true); }} className="text-muted hover:text-danger" aria-label="Supprimer la ligne">✕</button>
                  )}
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Aucune ligne — ajoutez une prestation du catalogue.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-6 border-t border-border p-4">
        <div className="min-w-64 flex-1 space-y-3">
          {editable && (
            <select value="" onChange={(e) => add(e.target.value)} className="w-full max-w-md rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm" data-testid="catalog-picker">
              <option value="">+ Ajouter une prestation du catalogue…</option>
              {Object.entries(byCategory).map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.label} — {money.format(it.unit_price)} / {it.unit}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <textarea value={notes} disabled={!editable} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Conditions particulières, délai, matière, tolérances…" className="min-h-20 w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </div>
        <dl className="w-72 space-y-1 text-sm" data-testid="quote-totals">
          <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular-nums" data-testid="total-ht">{money.format(fromCents(totals.net))}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">TVA {pct.format(sectorConfig.company.vatRate)}</dt><dd className="tabular-nums">{money.format(fromCents(totals.vat))}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><dt>Total TTC</dt><dd className="tabular-nums" data-testid="total-ttc">{money.format(fromCents(totals.gross))}</dd></div>
          <div className="mt-2 flex justify-between rounded-lg bg-surface-2 px-2 py-1.5 text-xs">
            <dt className="text-muted">Marge (interne)</dt>
            <dd className={clsx("font-semibold tabular-nums", marginTone)} data-testid="margin">{money.format(fromCents(totals.margin))} · {pct.format(totals.marginRate)}</dd>
          </div>
          {editable && (
            <div className="pt-3">
              <button onClick={save} disabled={pending || !dirty} data-testid="save-quote" className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "Enregistrement…" : dirty ? "Enregistrer le devis" : "Enregistré ✓"}
              </button>
              {msg && <p className={clsx("mt-2 text-xs", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</p>}
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
