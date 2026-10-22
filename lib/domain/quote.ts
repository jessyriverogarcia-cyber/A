import { computeVat, type Cents, type VatBreakdown } from "./money";

export interface QuoteLineInput {
  quantity: number;
  /** Prix unitaire client HT, en centimes. */
  unitPrice: Cents;
  /** Coût interne unitaire, en centimes. */
  unitCost: Cents;
  /** Remise sur la ligne, entre 0 et 1. */
  discount?: number;
}

export interface QuoteTotals extends VatBreakdown {
  cost: Cents;
  margin: Cents;
  /** Marge / CA HT, entre 0 et 1 (0 si CA nul). */
  marginRate: number;
}

export function lineNet(line: QuoteLineInput): Cents {
  const discount = Math.min(Math.max(line.discount ?? 0, 0), 1);
  return Math.round(line.quantity * line.unitPrice * (1 - discount));
}

export function computeQuoteTotals(
  lines: QuoteLineInput[],
  vatRate: number,
  roundingStep: number,
): QuoteTotals {
  const net = lines.reduce((sum, l) => sum + lineNet(l), 0);
  const cost = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitCost), 0);
  const vat = computeVat(net, vatRate, roundingStep);
  const margin = net - cost;
  return { ...vat, cost, margin, marginRate: net === 0 ? 0 : margin / net };
}

/** Numérotation séquentielle annuelle : DEV-2026-0042. */
export function formatDocumentNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}
