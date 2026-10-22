/** Comptes de démonstration (fictifs), créés par scripts/seed.ts — un par rôle applicatif. */
export const DEMO_ACCOUNTS = [
  { login: "direction", role: "direction" },
  { login: "production", role: "production_manager" },
  { login: "operateur", role: "operator" },
  { login: "qualite", role: "quality" },
  { login: "aero", role: "aero_engineer" },
  { login: "commercial", role: "sales" },
  { login: "rh", role: "hr" },
  { login: "compta", role: "accounting" },
  { login: "lecture", role: "read_only" },
] as const;

export const DEMO_DOMAIN = "strato-fab.test";
export const demoEmail = (login: string) => `${login}@${DEMO_DOMAIN}`;
export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";
