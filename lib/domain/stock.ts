/**
 * Stock et maintenance — fonctions pures, testées.
 */

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(quantity: number, min: number): StockLevel {
  if (quantity <= 0) return "out";
  if (quantity < min) return "low";
  return "ok";
}

/** Consommation moyenne par jour sur une période (sorties uniquement). */
export function averageDailyUse(movements: { delta: number; at: string }[], days: number, now = new Date()): number {
  const since = now.getTime() - days * 86_400_000;
  const used = movements.filter((m) => m.delta < 0 && new Date(m.at).getTime() >= since).reduce((s, m) => s - m.delta, 0);
  return days > 0 ? used / days : 0;
}

/** Jours de couverture restants au rythme actuel (null si aucune consommation). */
export function daysOfCover(quantity: number, dailyUse: number): number | null {
  if (dailyUse <= 0) return null;
  return Math.floor(quantity / dailyUse);
}

/**
 * Quantité à commander : de quoi revenir au double du minimum ET couvrir le délai fournisseur
 * (+50 % de marge), arrondie au conditionnement supérieur.
 */
export function reorderQuantity(i: { quantity: number; min: number; dailyUse: number; leadTimeDays: number; packSize?: number }): number {
  const target = Math.max(i.min * 2, i.min + i.dailyUse * i.leadTimeDays * 1.5);
  const need = Math.max(0, target - i.quantity);
  const pack = i.packSize && i.packSize > 0 ? i.packSize : 1;
  return need === 0 ? 0 : Math.ceil(need / pack) * pack;
}

export type MaintenanceState = "overdue" | "due_soon" | "ok" | "unknown";

/** État de la maintenance préventive : en retard, sous 7 jours, ou à jour. */
export function maintenanceState(nextOn: string | null, today: string, soonDays = 7): MaintenanceState {
  if (!nextOn) return "unknown";
  if (nextOn < today) return "overdue";
  const soon = new Date(new Date(today).getTime() + soonDays * 86_400_000).toISOString().slice(0, 10);
  return nextOn <= soon ? "due_soon" : "ok";
}

export function addDays(isoDate: string, days: number): string {
  return new Date(new Date(isoDate).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
