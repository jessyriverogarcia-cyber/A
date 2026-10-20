/**
 * Calculs monétaires. Tous les montants internes sont en centimes (entiers)
 * pour éviter les erreurs d'arrondi des flottants.
 */

export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/**
 * Arrondit un montant en centimes au pas de la devise (0.01 = centime, 0.05 = 5 centimes).
 * Arrondi commercial : la moitié est arrondie vers le haut (en valeur absolue).
 */
export function roundToStep(cents: Cents, step: number): Cents {
  const stepCents = Math.round(step * 100);
  if (stepCents <= 1) return Math.round(cents);
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(cents) / stepCents) * stepCents;
}

export interface VatBreakdown {
  net: Cents;
  vat: Cents;
  gross: Cents;
}

/** TVA calculée sur le total HT (et non ligne par ligne), puis arrondie au pas de la devise. */
export function computeVat(netCents: Cents, vatRate: number, step: number): VatBreakdown {
  const vat = roundToStep(Math.round(netCents * vatRate), 0.01);
  const gross = roundToStep(netCents + vat, step);
  return { net: netCents, vat: gross - netCents, gross };
}
