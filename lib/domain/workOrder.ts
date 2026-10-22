export interface StageDef {
  id: string;
  label: string;
}

export type TransitionResult =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: "unknown_stage" | "skip_not_allowed" | "already_last" };

/**
 * Transition d'étape : on avance d'une étape, ou on revient en arrière
 * (ex. rejet au contrôle qualité → retour en impression). Sauter des étapes est interdit.
 */
export function transitionStage(stages: StageDef[], from: string, to: string): TransitionResult {
  const i = stages.findIndex((s) => s.id === from);
  const j = stages.findIndex((s) => s.id === to);
  if (i < 0 || j < 0) return { ok: false, reason: "unknown_stage" };
  if (j > i + 1) return { ok: false, reason: "skip_not_allowed" };
  if (j === i) return { ok: false, reason: "already_last" };
  return { ok: true, from, to };
}

export function nextStage(stages: StageDef[], current: string): StageDef | null {
  const i = stages.findIndex((s) => s.id === current);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : null;
}

/** Avancement global en % : étapes franchies + progression dans l'étape courante. */
export function overallProgress(stages: StageDef[], current: string, stageProgress: number): number {
  const i = stages.findIndex((s) => s.id === current);
  if (i < 0) return 0;
  const within = Math.min(Math.max(stageProgress, 0), 100) / 100;
  return Math.round(((i + within) / stages.length) * 100);
}

export type BudgetLevel = "ok" | "warning" | "exceeded";

/** Alerte de budget d'heures : orange à 80 %, rouge au-delà de 100 %. */
export function budgetAlert(hoursSpent: number, hoursBudget: number): BudgetLevel {
  if (hoursBudget <= 0) return "ok";
  const ratio = hoursSpent / hoursBudget;
  if (ratio > 1) return "exceeded";
  if (ratio >= 0.8) return "warning";
  return "ok";
}
