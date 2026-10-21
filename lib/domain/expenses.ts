/**
 * Notes de frais : montants, TVA et contrôles de la politique de frais. Fonctions pures, testées.
 */
import type { SectorConfig } from "@/config/sector.schema";

type Policy = SectorConfig["expenses"];
type Category = Policy["categories"][number];

const round2 = (n: number) => Math.round(n * 100) / 100;

export const categoryOf = (policy: Policy, id: string | null | undefined): Category | undefined => policy.categories.find((c) => c.id === id);

/**
 * Montant TTC (saisi, ou kilomètres × barème), part HT et TVA ; seule la TVA des catégories
 * déductibles est récupérable par l'entreprise.
 */
export function expenseAmounts(policy: Policy, input: { category: string; amount?: number | null; km?: number | null }) {
  const cat = categoryOf(policy, input.category);
  if (!cat) throw new Error(`Catégorie de frais inconnue : ${input.category}`);
  const ttc = cat.mileage ? round2((input.km ?? 0) * policy.mileageRatePerKm) : round2(input.amount ?? 0);
  const ht = round2(ttc / (1 + cat.vatRate));
  const vat = round2(ttc - ht);
  return { ttc, ht, vat, recoverableVat: cat.vatRecoverable ? vat : 0 };
}

export type ExpenseWarning = "over_ceiling" | "missing_receipt" | "too_old" | "future_date";

/** Points de la politique de frais à vérifier avant validation (n'empêchent pas la saisie). */
export function policyWarnings(policy: Policy, e: { category: string; amount: number; spent_on: string; receipt: boolean }, today: string): ExpenseWarning[] {
  const cat = categoryOf(policy, e.category);
  const w: ExpenseWarning[] = [];
  if (cat?.ceiling && e.amount > cat.ceiling) w.push("over_ceiling");
  if (!cat?.mileage && !e.receipt && e.amount > policy.receiptRequiredAbove) w.push("missing_receipt");
  const age = (new Date(today).getTime() - new Date(e.spent_on).getTime()) / 86_400_000;
  if (age > policy.maxAgeDays) w.push("too_old");
  if (e.spent_on > today) w.push("future_date");
  return w;
}

export const WARNING_LABEL: Record<ExpenseWarning, string> = {
  over_ceiling: "au-dessus du plafond",
  missing_receipt: "justificatif manquant",
  too_old: "dépense trop ancienne",
  future_date: "date dans le futur",
};

/** Total à rembourser par salarié (notes validées, pas encore remboursées). */
export function toReimburse(expenses: { employee_id: string; amount: number; status: string }[]) {
  const by = new Map<string, number>();
  for (const e of expenses) if (e.status === "approved") by.set(e.employee_id, round2((by.get(e.employee_id) ?? 0) + Number(e.amount)));
  return by;
}

/** Lignes de refacturation au client (HT, sans marge) pour les frais rattachés à un dossier. */
export function rebillLines(policy: Policy, expenses: { label: string; amount: number; category: string | null; spent_on: string }[]) {
  return expenses.map((e) => {
    const cat = categoryOf(policy, e.category);
    const ht = cat ? round2(Number(e.amount) / (1 + cat.vatRate)) : round2(Number(e.amount));
    return { description: `Frais refacturés — ${e.label} (${e.spent_on.split("-").reverse().join("/")})`, quantity: 1, unit_price: ht, discount: 0, catalog_item_id: null };
  });
}
