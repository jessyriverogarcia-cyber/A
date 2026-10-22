/**
 * Vérification avant mise en production : variables d'environnement, puis contrôles en ligne
 * du projet Supabase (joignable, schéma à jour, stockage, réglages d'authentification).
 *
 *   pnpm check:prod                    # lit .env.production.local
 *   pnpm check:prod -- --offline       # variables uniquement
 */
import { createClient } from "@supabase/supabase-js";
import { checkAuthSettings, checkEnv, type Check } from "../lib/deploy/checks";

const ICON = { ok: "✔", warn: "!", error: "✖" } as const;
const print = (c: Check) => console.log(`${ICON[c.level]} ${c.key} — ${c.message}`);

async function online(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const out: Check[] = [];
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
    if (!r.ok) return [{ level: "error", key: "Supabase", message: `injoignable ou clé anon refusée (HTTP ${r.status})` }];
    out.push({ level: "ok", key: "Supabase", message: "joignable" });
    const sso = (process.env.NEXT_PUBLIC_SSO_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    out.push(...checkAuthSettings(await r.json(), sso));
  } catch (e) {
    return [{ level: "error", key: "Supabase", message: `injoignable : ${e instanceof Error ? e.message : e}` }];
  }

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // Colonne de la dernière migration : schéma à jour (supabase db push)
  const { error: schema } = await admin.from("invoices").select("corrects_invoice_id").limit(1);
  out.push(schema ? { level: "error", key: "Schéma", message: `migrations non appliquées : ${schema.message}` } : { level: "ok", key: "Schéma", message: "à jour" });
  const { error: bucket } = await admin.storage.getBucket("documents");
  out.push(bucket ? { level: "error", key: "Stockage", message: `bucket « documents » absent : ${bucket.message}` } : { level: "ok", key: "Stockage", message: "bucket privé « documents » présent" });
  const { count } = await admin.from("orgs").select("id", { count: "exact", head: true });
  out.push(count ? { level: "ok", key: "Organisation", message: `${count} organisation(s)` } : { level: "warn", key: "Organisation", message: "aucune : lancer pnpm bootstrap" });
  return out;
}

async function main() {
  const checks = checkEnv(process.env);
  checks.forEach(print);
  // Contrôles en ligne seulement si les accès Supabase sont exploitables
  const blocking = checks.some((c) => c.level === "error" && /SUPABASE/.test(c.key));
  if (!process.argv.includes("--offline") && !blocking) for (const c of await online()) checks.push(c), print(c);

  const errors = checks.filter((c) => c.level === "error").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  console.log(`\n${errors ? "✖" : "✔"} ${errors} erreur(s), ${warns} avertissement(s)${errors ? " — corriger avant la mise en ligne" : ""}`);
  process.exit(errors ? 1 : 0);
}

void main();
