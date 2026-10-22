/**
 * Vérifications de configuration avant mise en production (module pur, testé).
 * Utilisé par `pnpm check:prod`, qui ajoute des contrôles en ligne (Supabase, Auth, stockage).
 */

export type Level = "ok" | "warn" | "error";
export interface Check {
  level: Level;
  key: string;
  message: string;
}

type Env = Record<string, string | undefined>;

const isHttps = (v: string) => /^https:\/\/[^/]+/.test(v);
const LOCAL = /localhost|127\.0\.0\.1/;

export function checkEnv(env: Env): Check[] {
  const out: Check[] = [];
  const push = (level: Level, key: string, message: string) => out.push({ level, key, message });
  const v = (k: string) => (env[k] ?? "").trim();

  // Supabase
  const url = v("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) push("error", "NEXT_PUBLIC_SUPABASE_URL", "manquant");
  else if (!isHttps(url) || LOCAL.test(url)) push("error", "NEXT_PUBLIC_SUPABASE_URL", "doit être l'URL https du projet Supabase (pas l'instance locale)");
  else push("ok", "NEXT_PUBLIC_SUPABASE_URL", url);
  for (const k of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!v(k)) push("error", k, "manquant");
    else push("ok", k, "défini");
  }
  if (v("SUPABASE_SERVICE_ROLE_KEY") && v("SUPABASE_SERVICE_ROLE_KEY") === v("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    push("error", "SUPABASE_SERVICE_ROLE_KEY", "identique à la clé anon : mauvaise clé copiée");

  // Application
  const site = v("NEXT_PUBLIC_SITE_URL");
  if (!site) push("error", "NEXT_PUBLIC_SITE_URL", "manquant (liens de connexion, retours OAuth)");
  else if (!isHttps(site) || LOCAL.test(site)) push("error", "NEXT_PUBLIC_SITE_URL", "doit être l'URL publique https");
  else if (site.endsWith("/")) push("error", "NEXT_PUBLIC_SITE_URL", "sans « / » final");
  else push("ok", "NEXT_PUBLIC_SITE_URL", site);

  if (v("NEXT_PUBLIC_DEMO_MODE") === "true") push("error", "NEXT_PUBLIC_DEMO_MODE", "doit valoir false : comptes de démo et scénario live exposés");
  else push("ok", "NEXT_PUBLIC_DEMO_MODE", "désactivé");
  if (v("DEMO_PASSWORD")) push("warn", "DEMO_PASSWORD", "inutile en production : à retirer");

  // Secrets
  const integ = v("INTEGRATIONS_SECRET");
  const mail = !!(v("MS_CLIENT_ID") || v("GOOGLE_CLIENT_ID"));
  if (integ.length >= 32) push("ok", "INTEGRATIONS_SECRET", "défini");
  else if (integ) push("error", "INTEGRATIONS_SECRET", "32 caractères minimum (openssl rand -base64 48)");
  else push(mail ? "error" : "warn", "INTEGRATIONS_SECRET", mail ? "obligatoire dès qu'une messagerie est configurée" : "absent : envois d'e-mails simulés");
  if (v("MS_CLIENT_ID") && !v("MS_CLIENT_SECRET")) push("error", "MS_CLIENT_SECRET", "manquant alors que MS_CLIENT_ID est défini");
  if (v("GOOGLE_CLIENT_ID") && !v("GOOGLE_CLIENT_SECRET")) push("error", "GOOGLE_CLIENT_SECRET", "manquant alors que GOOGLE_CLIENT_ID est défini");
  if (!mail) push("warn", "MS_CLIENT_ID / GOOGLE_CLIENT_ID", "aucune messagerie : envois simulés (annoncés comme tels)");

  const cron = v("CRON_SECRET");
  if (cron.length >= 16) push("ok", "CRON_SECRET", "défini");
  else push(mail ? "error" : "warn", "CRON_SECRET", cron ? "16 caractères minimum" : "absent : pas de relève automatique des e-mails entrants");

  if (v("ANTHROPIC_API_KEY")) push("ok", "ANTHROPIC_API_KEY", `assistant actif (${v("AI_MODEL") || "modèle par défaut"})`);
  else push("warn", "ANTHROPIC_API_KEY", "absent : assistant en mode simulé (annoncé comme tel)");

  const sso = v("NEXT_PUBLIC_SSO_PROVIDERS").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = sso.filter((p) => p !== "azure" && p !== "google");
  if (unknown.length) push("error", "NEXT_PUBLIC_SSO_PROVIDERS", `fournisseur(s) inconnu(s) : ${unknown.join(", ")} (azure, google)`);

  // Aucun secret ne doit être exposé au navigateur
  for (const k of Object.keys(env))
    if (k.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|API_KEY|PASSWORD/.test(k)) push("error", k, "un secret ne doit jamais porter le préfixe NEXT_PUBLIC_");

  return out;
}

/** Réglages Supabase Auth (GET /auth/v1/settings) attendus en production. */
export function checkAuthSettings(s: { disable_signup?: boolean; external?: Record<string, boolean> }, ssoProviders: string[]): Check[] {
  const out: Check[] = [];
  out.push(
    s.disable_signup
      ? { level: "ok", key: "Auth : inscription libre", message: "désactivée (comptes sur invitation)" }
      : { level: "error", key: "Auth : inscription libre", message: "active : désactiver « Allow new users to sign up »" },
  );
  for (const p of ssoProviders)
    out.push(
      s.external?.[p]
        ? { level: "ok", key: `Auth : ${p}`, message: "fournisseur activé" }
        : { level: "error", key: `Auth : ${p}`, message: "déclaré dans NEXT_PUBLIC_SSO_PROVIDERS mais pas activé dans Supabase" },
    );
  return out;
}
