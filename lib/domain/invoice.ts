/**
 * Règles de facturation — fonctions pures, testées.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled";

/** Statut affiché : une facture envoyée dont l'échéance est passée est en retard, même avant le recalcul en base. */
export function effectiveStatus(inv: { status: string; due_date: string; paid_amount: number; total_ttc: number }, today: string): InvoiceStatus {
  if (inv.status === "draft" || inv.status === "cancelled") return inv.status;
  if (inv.paid_amount >= inv.total_ttc && inv.total_ttc > 0) return "paid";
  if (inv.paid_amount > 0) return inv.due_date < today ? "overdue" : "partially_paid";
  return inv.due_date < today ? "overdue" : "sent";
}

export const daysOverdue = (dueDate: string, today: string) =>
  Math.max(0, Math.round((new Date(today).getTime() - new Date(dueDate).getTime()) / 86_400_000));

/**
 * Niveau de relance proposé (1 rappel courtois, 2 relance ferme, 3 mise en demeure),
 * sans dépasser le niveau suivant celui déjà envoyé.
 */
export function suggestedDunningLevel(days: number, lastLevel: number): 1 | 2 | 3 | null {
  if (days <= 0 || lastLevel >= 3) return null;
  const byDelay = days >= 30 ? 3 : days >= 15 ? 2 : 1;
  return Math.min(byDelay, lastLevel + 1) as 1 | 2 | 3;
}

export interface SourceLine {
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  catalog_item_id?: string | null;
}

/**
 * Lignes de la facture finale d'un dossier : reprise des lignes du devis (zéro double saisie),
 * moins les acomptes déjà facturés (ligne négative).
 */
export function finalInvoiceLines(quoteLines: SourceLine[], depositsHt: { number: string; amount: number }[]): SourceLine[] {
  const lines = quoteLines.map((l) => ({ ...l }));
  for (const d of depositsHt) {
    if (d.amount > 0) lines.push({ description: `Déduction acompte ${d.number}`, quantity: 1, unit_price: -d.amount, discount: 0, catalog_item_id: null });
  }
  return lines;
}

/** Facture d'acompte : un pourcentage du total HT du devis, en une ligne. */
export function depositLine(quoteNumber: string, quoteHt: number, ratio: number): SourceLine {
  const pct = Math.round(ratio * 100);
  return { description: `Acompte ${pct} % sur devis ${quoteNumber}`, quantity: 1, unit_price: Math.round(quoteHt * ratio * 100) / 100, discount: 0, catalog_item_id: null };
}

/** Délai moyen de paiement (jours) sur les factures payées. */
export function averagePaymentDelay(invoices: { issue_date: string; paid_on: string | null }[]): number | null {
  const paid = invoices.filter((i) => i.paid_on);
  if (!paid.length) return null;
  const total = paid.reduce((s, i) => s + (new Date(i.paid_on!).getTime() - new Date(i.issue_date).getTime()) / 86_400_000, 0);
  return Math.round(total / paid.length);
}
