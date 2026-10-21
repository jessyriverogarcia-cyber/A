"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";
import { computeQuoteTotals, lineNet } from "@/lib/domain/quote";
import { fromCents, toCents } from "@/lib/domain/money";
import { saveInvoiceLinesAction } from "@/app/(backoffice)/finance/actions";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  catalog_item_id?: string | null;
}

const money = new Intl.NumberFormat(sectorConfig.company.locale, { style: "currency", currency: sectorConfig.company.currency });
const cellBase = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 tabular-nums outline-none hover:border-border focus:border-accent focus:bg-surface disabled:hover:border-transparent";
const cell = `${cellBase} text-right`;

export function InvoiceEditor({ invoiceId, initialLines, initialNotes, editable, paid }: { invoiceId: string; initialLines: InvoiceLine[]; initialNotes: string; editable: boolean; paid: number }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [notes, setNotes] = useState(initialNotes);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const totals = useMemo(
    () => computeQuoteTotals(lines.map((l) => ({ quantity: l.quantity || 0, unitPrice: toCents(l.unit_price || 0), unitCost: 0, discount: l.discount || 0 })), sectorConfig.company.vatRate, sectorConfig.company.rounding),
    [lines],
  );
  const update = (i: number, patch: Partial<InvoiceLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const save = () =>
    start(async () => {
      const r = await saveInvoiceLinesAction(invoiceId, lines.filter((l) => l.description), notes || null);
      setMsg(r.ok ? null : (r.reason ?? "Erreur"));
      if (r.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <div className="rounded-card border border-border bg-surface" data-testid="invoice-editor">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="px-3 py-2 text-left font-medium">Désignation</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Qté</th>
            <th className="w-32 px-3 py-2 text-right font-medium">PU HT</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Remise %</th>
            <th className="w-32 px-3 py-2 text-right font-medium">Total HT</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((l, i) => (
            <tr key={i} data-testid="invoice-line">
              <td className="px-1 py-1"><input value={l.description} disabled={!editable} onChange={(e) => update(i, { description: e.target.value })} className={`${cellBase} text-left`} /></td>
              <td className="px-1"><input type="number" step="any" value={l.quantity} disabled={!editable} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={cell} /></td>
              <td className="px-1"><input type="number" step="any" value={l.unit_price} disabled={!editable} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} className={cell} /></td>
              <td className="px-1"><input type="number" min={0} max={100} step="any" value={Math.round(l.discount * 1000) / 10} disabled={!editable} onChange={(e) => update(i, { discount: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} className={cell} /></td>
              <td className="px-3 text-right font-medium tabular-nums">{money.format(fromCents(lineNet({ quantity: l.quantity || 0, unitPrice: toCents(l.unit_price || 0), unitCost: 0, discount: l.discount })))}</td>
              <td className="pr-2 text-right">{editable && <button onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true); }} className="text-muted hover:text-danger" aria-label="Supprimer">✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-start justify-between gap-6 border-t border-border p-4">
        <div className="min-w-64 flex-1 space-y-2">
          {editable && (
            <button onClick={() => { setLines((ls) => [...ls, { description: "", quantity: 1, unit_price: 0, discount: 0 }]); setDirty(true); }} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
              + Ligne libre
            </button>
          )}
          <textarea value={notes} disabled={!editable} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Mentions complémentaires (n° de commande client, référence de livraison…)" className="min-h-16 w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </div>
        <dl className="w-72 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular-nums">{money.format(fromCents(totals.net))}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">TVA {sectorConfig.company.vatRate * 100} %</dt><dd className="tabular-nums">{money.format(fromCents(totals.vat))}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><dt>Total TTC</dt><dd className="tabular-nums" data-testid="invoice-ttc">{money.format(fromCents(totals.gross))}</dd></div>
          {paid > 0 && <div className="flex justify-between text-ok"><dt>Déjà réglé</dt><dd className="tabular-nums">{money.format(paid)}</dd></div>}
          {paid > 0 && <div className="flex justify-between font-medium"><dt>Reste dû</dt><dd className="tabular-nums">{money.format(fromCents(totals.gross) - paid)}</dd></div>}
          {editable && (
            <div className="pt-3">
              <button onClick={save} disabled={pending || !dirty} data-testid="save-invoice" className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré ✓"}
              </button>
              {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
