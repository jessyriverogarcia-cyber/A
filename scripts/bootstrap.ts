/**
 * Mise en service d'une organisation réelle (production), sans aucune donnée de démo :
 * organisation, rôles et droits, sites, zones et plans issus de la fiche secteur, puis invitation
 * du premier compte direction par e-mail (lien de connexion).
 *
 * Usage : pnpm bootstrap -- --email prenom.nom@entreprise.fr --first Prénom --last Nom [--slug mon-entreprise]
 * Idempotent : une organisation existante (même slug) n'est pas recréée.
 */
import { createClient } from "@supabase/supabase-js";
import { sectorConfig as cfg } from "../config/sector.config";
import { DEFAULT_RECTS, zonePolygon } from "../config/layout.default";
import { permissionsFor } from "../lib/domain/permissions";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL;
const email = arg("email");
const first = arg("first");
const last = arg("last");
const slug = arg("slug") ?? cfg.company.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

if (!url || !key || !site) throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et NEXT_PUBLIC_SITE_URL sont requis.");
if (!email || !first || !last) throw new Error("Usage : --email … --first … --last … [--slug …]");
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") console.warn("⚠ NEXT_PUBLIC_DEMO_MODE=true : à passer à false en production.");

const db = createClient(url, key, { auth: { persistSession: false } });

async function insert<T extends Record<string, unknown>>(table: string, rows: T[]) {
  const { data, error } = await db.from(table).insert(rows as never).select();
  if (error) throw new Error(`${table} : ${error.message}`);
  return data as (T & { id: string })[];
}

async function main() {
  const c = cfg.company;
  const { data: existing } = await db.from("orgs").select("id").eq("slug", slug).maybeSingle();
  if (existing) {
    console.log(`Organisation « ${slug} » déjà en place (${existing.id}) : rien à faire.`);
    return;
  }

  const [org] = await insert("orgs", [{ name: c.name, slug, locale: c.locale, currency: c.currency, vat_rate: c.vatRate, rounding: c.rounding, timezone: c.timezone, accent_color: c.accentColor }]);
  const org_id = org.id;

  const roles = await insert("roles", cfg.roles.map((r) => ({ org_id, key: r.id, label: r.label, description: r.description, can_see_salaries: r.canSeeSalaries, read_only: r.readOnly })));
  await insert("permissions", roles.flatMap((r) => permissionsFor(r.key as string).map((p) => ({ org_id, role_id: r.id, ...p }))));

  const sites = await insert("sites", cfg.sites.map((s) => ({ org_id, key: s.id, name: s.label, timezone: c.timezone, shape: s.shape })));
  const siteId = Object.fromEntries(sites.map((s) => [s.key, s.id]));
  await insert("floor_plans", cfg.sites.map((s) => ({ org_id, site_id: siteId[s.id], version: 1, layout: { description: s.description, rects: DEFAULT_RECTS } })));
  await insert(
    "zones",
    cfg.sites.flatMap((s) =>
      [...s.zones.map((z) => ({ z, outdoor: false })), ...s.outdoor.map((z) => ({ z, outdoor: true }))].map(({ z, outdoor }) => ({
        org_id,
        site_id: siteId[s.id],
        key: z.id,
        name: z.label,
        type: z.type,
        polygon: zonePolygon(z.id),
        capacity: z.capacity ?? null,
        restricted: z.restricted,
        outdoor,
      })),
    ),
  );

  // Premier compte : direction, invité par e-mail (il choisit ensuite son mot de passe ou se connecte par lien).
  const direction = roles.find((r) => r.key === "direction");
  if (!direction) throw new Error("La fiche secteur doit définir un rôle « direction ».");
  const [employee] = await insert("employees", [{ org_id, site_id: sites[0].id, first_name: first, last_name: last, email, job_title: "Direction", role_key: "direction" }]);
  const { data: invited, error } = await db.auth.admin.inviteUserByEmail(email!, { redirectTo: `${site}/auth/callback`, data: { full_name: `${first} ${last}` } });
  if (error) throw new Error(`invitation : ${error.message}`);
  await insert("profiles", [{ user_id: invited.user.id, org_id, role_id: direction.id, full_name: `${first} ${last}`, locale: c.locale, employee_id: employee.id }]);

  console.log(`✔ « ${c.name} » mise en service (org ${org_id}, slug ${slug})`);
  console.log(`  ${roles.length} rôles · ${sites.length} sites · invitation envoyée à ${email}`);
  console.log("  Ensuite : activer la double authentification, connecter la boîte d'envoi (Paramètres › Intégrations), inviter l'équipe.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
