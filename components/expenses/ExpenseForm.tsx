"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitExpenseAction } from "@/app/(backoffice)/finance/expenses/actions";

type Cat = { id: string; label: string; mileage?: boolean; ceiling?: number };

const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

/** Saisie d'une note : montant ou kilomètres selon la catégorie, calcul et plafond affichés en direct. */
export function ExpenseForm({ categories, rate, rateLabel, today, workOrders }: { categories: Cat[]; rate: number; rateLabel: string; today: string; workOrders: { id: string; label: string }[] }) {
  const [cat, setCat] = useState(categories[0]?.id ?? "");
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [wo, setWo] = useState("");
  const c = categories.find((x) => x.id === cat);
  const value = c?.mileage ? Number(km.replace(",", ".")) * rate : Number(amount.replace(",", "."));
  const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <form action={submitExpenseAction} className="space-y-3" data-testid="expense-form">
      <input type="hidden" name="back" value="/me" />
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Catégorie</span>
        <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className={field} data-testid="expense-category">
          {categories.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Libellé</span>
        <input name="label" required placeholder="Ex. : train Bordeaux – Toulouse, visite client" className={field} data-testid="expense-label" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Date</span>
          <input type="date" name="spent_on" required max={today} defaultValue={today} className={field} />
        </label>
        {c?.mileage ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Kilomètres</span>
            <input name="km" inputMode="decimal" required value={km} onChange={(e) => setKm(e.target.value)} className={field} data-testid="expense-km" />
          </label>
        ) : (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Montant TTC (€)</span>
            <input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={field} data-testid="expense-amount" />
          </label>
        )}
      </div>
      {value > 0 && (
        <p className="text-xs text-muted" data-testid="expense-preview">
          {c?.mileage ? `${eur(value)} (${rate.toLocaleString("fr-FR")} €/km — ${rateLabel})` : eur(value)}
          {c?.ceiling && value > c.ceiling && <span className="text-warn"> · au-dessus du plafond de {eur(c.ceiling)} : précisez la raison</span>}
        </p>
      )}
      {!c?.mileage && (
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Justificatif (photo ou PDF)</span>
          <input type="file" name="receipt" accept="image/*,application/pdf" capture="environment" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5" data-testid="expense-receipt" />
        </label>
      )}
      {workOrders.length > 0 && (
        <div className="space-y-1 text-sm">
          <label className="block space-y-1">
            <span className="text-muted">Dossier (facultatif)</span>
            <select name="work_order_id" value={wo} onChange={(e) => setWo(e.target.value)} className={field}>
              <option value="">Aucun</option>
              {workOrders.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </label>
          {wo && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="billable" defaultChecked /> Refacturer au client sur la facture du dossier
            </label>
          )}
        </div>
      )}
      <input name="comment" placeholder="Commentaire (facultatif)" className={field} />
      <SubmitButton testId="expense-submit">Envoyer la note</SubmitButton>
    </form>
  );
}
