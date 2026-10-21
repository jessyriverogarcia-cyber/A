/**
 * Matrice des droits module × action par rôle applicatif.
 * Les modules correspondent à app.table_modules dans la migration SQL.
 */

export const MODULES = [
  "map",
  "people",
  "presence",
  "planning",
  "hr",
  "salaries",
  "crm",
  "ops",
  "resources",
  "finance",
  "expenses",
  "comms",
  "ai",
  "pilotage",
  "settings",
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ["read", "create", "update", "delete", "approve", "export"] as const;
export type Action = (typeof ACTIONS)[number];

type Grant = Action[] | "all";
type Matrix = Partial<Record<Module, Grant>>;

const R: Action[] = ["read"];
const RW: Action[] = ["read", "create", "update"];
const RWD: Action[] = ["read", "create", "update", "delete"];

/** Base commune : tout le monde voit la map (avec ses machines et son stock), l'annuaire, la présence, le planning. */
const base: Matrix = { map: R, people: R, presence: R, planning: R, resources: R, ai: R };

const MATRIX: Record<string, Matrix> = {
  direction: Object.fromEntries(MODULES.map((m) => [m, "all"])) as Matrix,
  production_manager: {
    ...base,
    map: RW,
    planning: RWD,
    ops: [...RWD, "approve", "export"],
    resources: RWD,
    crm: R,
    hr: R,
    comms: RW,
    pilotage: R,
    presence: ["read", "approve"],
  },
  operator: { ...base, ops: ["read", "update"], resources: R, comms: R },
  quality: { ...base, ops: ["read", "update", "approve", "export"], resources: R, comms: RW, crm: R },
  aero_engineer: { ...base, ops: ["read", "update", "approve", "export"], resources: R, crm: R, comms: RW },
  sales: { ...base, crm: [...RWD, "export"], ops: R, finance: R, comms: RW },
  hr: {
    ...base,
    people: RWD,
    presence: ["read", "create", "update", "approve", "export"], // create : correction des oublis de pointage
    planning: RW,
    hr: [...RWD, "approve", "export"],
    salaries: [...RWD, "export"],
    ops: R,
    expenses: R,
    comms: RW,
  },
  accounting: {
    ...base,
    finance: [...RWD, "approve", "export"],
    expenses: ["read", "update", "approve", "export"],
    crm: R,
    ops: R,
    resources: R,
    comms: RW,
  },
  read_only: Object.fromEntries(
    MODULES.filter((m) => m !== "salaries" && m !== "settings").map((m) => [m, R]),
  ) as Matrix,
};

export function permissionsFor(roleKey: string): { module: Module; action: Action }[] {
  const matrix = MATRIX[roleKey] ?? base;
  return MODULES.flatMap((module) => {
    const grant = matrix[module];
    if (!grant) return [];
    const actions = grant === "all" ? ACTIONS : grant;
    return actions.map((action) => ({ module, action }));
  });
}
