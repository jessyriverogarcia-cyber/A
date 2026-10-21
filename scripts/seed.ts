/**
 * Données de démo — entièrement fictives — générées depuis config/sector.config.ts.
 * Usage : pnpm db:seed (après pnpm db:reset). Utilise la clé service (contourne la RLS).
 */
import { createClient } from "@supabase/supabase-js";
import { sectorConfig as cfg } from "../config/sector.config";
import { permissionsFor } from "../lib/domain/permissions";
import { computeQuoteTotals, formatDocumentNumber } from "../lib/domain/quote";
import { computeVat, fromCents, toCents } from "../lib/domain/money";
import { overallProgress } from "../lib/domain/workOrder";
import { DEMO_DOMAIN, demoEmail } from "../lib/demo";
import { packInZone } from "../lib/map/kits";
import { DEFAULT_RECTS, zonePolygon } from "../config/layout.default";
import { suggestReply } from "../lib/domain/replies";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "StratoFab-demo-2026";

// --- utilitaires -------------------------------------------------------
let seed = 20261020;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));

const now = new Date();
const today = new Date(now);
today.setHours(0, 0, 0, 0);
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};
const iso = (d: Date) => d.toISOString();
const day = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const year = now.getFullYear();
const frDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${iso}T12:00:00Z`));
/** PDF minimal valide (une page, un titre) pour les documents de démo. */
const tinyPdf = (title: string) => {
  const text = title.replace(/[()\\]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET BT /F1 11 Tf 60 730 Td (Document de demonstration - donnees fictives) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
};

// Le seed manipule des lignes non typées (pas de types générés à ce stade).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
async function insert(table: string, rows: Row[]): Promise<Row[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db.from(table).insert(rows, { defaultToNull: false }).select();
  if (error) throw new Error(`${table} : ${error.message}`);
  return data;
}

// --- remise à zéro (idempotent) ---------------------------------------
async function wipe() {
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.email?.endsWith(`@${DEMO_DOMAIN}`)) await db.auth.admin.deleteUser(u.id);
  }
  const { data: org } = await db.from("orgs").select("id").eq("slug", "strato-fab").maybeSingle();
  if (org) {
    // Le stockage ne suit pas la cascade SQL : on vide le dossier de l'organisation, sous-dossiers compris.
    const bucket = db.storage.from("documents");
    const purge = async (prefix: string): Promise<void> => {
      const { data: entries } = await bucket.list(prefix, { limit: 1000 });
      const files = (entries ?? []).filter((e) => e.id).map((e) => `${prefix}/${e.name}`);
      if (files.length) await bucket.remove(files);
      for (const d of (entries ?? []).filter((e) => !e.id)) await purge(`${prefix}/${d.name}`);
    };
    await purge(org.id);
  }
  await db.from("orgs").delete().eq("slug", "strato-fab");
  // Après la suppression : la cascade déclenche elle-même des lignes d'audit (pas de clé étrangère).
  if (org) await db.from("audit_log").delete().eq("org_id", org.id);
}

async function main() {
  await wipe();
  const c = cfg.company;

  // --- organisation, rôles, droits ------------------------------------
  const [org] = await insert("orgs", [
    {
      name: c.name,
      slug: "strato-fab",
      locale: c.locale,
      currency: c.currency,
      vat_rate: c.vatRate,
      rounding: c.rounding,
      timezone: c.timezone,
      accent_color: c.accentColor,
    },
  ]);
  const org_id = org.id;
  const withOrg = (rows: Row[]) => rows.map((r) => ({ org_id, ...r }));

  const roles = await insert(
    "roles",
    withOrg(
      cfg.roles.map((r) => ({
        key: r.id,
        label: r.label,
        description: r.description,
        can_see_salaries: r.canSeeSalaries,
        read_only: r.readOnly,
      })),
    ),
  );
  const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));
  await insert(
    "permissions",
    roles.flatMap((r) => permissionsFor(r.key).map((p) => ({ org_id, role_id: r.id, ...p }))),
  );

  // --- sites, zones, plans ---------------------------------------------
  const rects = DEFAULT_RECTS;
  const poly = (k: string) => zonePolygon(k);

  const sites = await insert(
    "sites",
    withOrg(
      cfg.sites.map((s) => ({
        key: s.id,
        name: s.label,
        address: s.id === "campus" ? "12 rue des Fictions, 33000 Bordeaux" : "Quai des Essais, 33000 Bordeaux",
        timezone: c.timezone,
        shape: s.shape,
      })),
    ),
  );
  const siteId = Object.fromEntries(sites.map((s) => [s.key, s.id]));
  await insert(
    "floor_plans",
    withOrg(cfg.sites.map((s) => ({ site_id: siteId[s.id], version: 1, layout: { description: s.description, rects } }))),
  );
  const zones = await insert(
    "zones",
    withOrg(
      cfg.sites.flatMap((s) =>
        [...s.zones.map((z) => ({ z, outdoor: false })), ...s.outdoor.map((z) => ({ z, outdoor: true }))].map(
          ({ z, outdoor }) => ({
            site_id: siteId[s.id],
            key: z.id,
            name: z.label,
            type: z.type,
            polygon: poly(z.id),
            capacity: z.capacity ?? null,
            restricted: z.restricted,
            outdoor,
          }),
        ),
      ),
    ),
  );
  const zone = Object.fromEntries(zones.map((z) => [z.key, z]));
  const zoneSite = (k: string) => zone[k].site_id as string;

  // --- employés --------------------------------------------------------
  type Emp = [first: string, last: string, title: string, roleKey: string, zoneKey: string, appRole?: string];
  const team: Emp[] = [
    ["Claire", "Morvan", "Directrice générale", "direction", "offices", "direction"],
    ["Julien", "Ferrand", "Responsable production", "production_manager", "print_floor", "production"],
    ["Samir", "Haddad", "Opérateur machines FDM/SLA", "operator", "print_floor", "operateur"],
    ["Léa", "Dubreuil", "Opératrice machines SLS", "operator", "print_floor"],
    ["Tom", "Lacaze", "Opérateur machines métal", "operator", "atex_metal"],
    ["Inès", "Moreau", "Opératrice portique grand format", "operator", "gantry_bay"],
    ["Hugo", "Barthe", "Opérateur portique grand format", "operator", "gantry_bay"],
    ["Yanis", "Roche", "Opérateur machines FDM", "operator", "print_floor"],
    ["Manon", "Cazenave", "Opératrice salle blanche", "operator", "cleanroom"],
    ["Chloé", "Vidal", "Technicienne post-traitement", "operator", "post_processing"],
    ["Romain", "Pujol", "Technicien post-traitement", "operator", "post_processing"],
    ["Nadia", "Benali", "Responsable qualité", "quality", "quality_lab", "qualite"],
    ["Antoine", "Lefort", "Métrologue CND", "quality", "hangar_quality"],
    ["Élise", "Garnier", "Ingénieure aéro / certification", "aero_engineer", "assembly_line", "aero"],
    ["Mathis", "Duran", "Ingénieur structures", "aero_engineer", "assembly_line"],
    ["Lucas", "Mercier", "Ingénieur CAO / slicing", "production_manager", "cad_office"],
    ["Sarah", "Lemaire", "Technicienne CAO", "operator", "cad_office"],
    ["Karim", "Ouali", "Commercial grands comptes aéro", "sales", "offices", "commercial"],
    ["Pauline", "Rivière", "Commerciale médical", "sales", "offices"],
    ["Sophie", "Dantec", "Responsable RH", "hr", "offices", "rh"],
    ["Marc", "Lestrade", "Comptable", "accounting", "offices", "compta"],
    ["Kévin", "Teixeira", "Magasinier / expéditions", "operator", "shipping"],
    ["Ambre", "Fontaine", "Chargée d'accueil", "operator", "reception"],
    ["Bastien", "Roy", "Stagiaire contrôle de gestion", "read_only", "offices", "lecture"],
  ];
  const palette = ["#F97316", "#0EA5E9", "#10B981", "#8B5CF6", "#EF4444", "#EAB308", "#14B8A6", "#EC4899"];
  const employees = await insert(
    "employees",
    withOrg(
      team.map(([first, last, title, roleKey, zoneKey], i) => ({
        site_id: zoneSite(zoneKey),
        first_name: first,
        last_name: last,
        email: `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@strato-fab.test",
        phone: `+33 5 00 00 ${String(10 + i).padStart(2, "0")} ${String(20 + i).padStart(2, "0")}`,
        job_title: title,
        role_key: roleKey,
        department: { direction: "Direction", production_manager: "Production", operator: "Production", quality: "Qualité", aero_engineer: "Ingénierie aéro", sales: "Commercial", hr: "RH", accounting: "Finance", read_only: "Finance" }[roleKey],
        contract_type: roleKey === "read_only" ? "Stage" : i % 9 === 8 ? "CDD" : "CDI",
        work_rate: i % 7 === 6 ? 0.8 : 1,
        start_date: day(-int(120, 3000)),
        skills: roleKey === "operator" ? [pick(["FDM", "SLA", "SLS", "Métal", "Portique"]), "Sécurité poudres"] : [],
        avatar_color: palette[i % palette.length],
        appearance: { skin: int(0, 4), hair: int(0, 5), hairColor: pick(["#1F1F1F", "#5B3A29", "#C08A4B", "#E5D3A1", "#8B2E1F"]), outfit: roleKey === "operator" || roleKey === "quality" ? "workwear" : "office" },
        home_zone_id: zone[zoneKey].id,
      })),
    ),
  );
  const emp = (first: string) => employees.find((e) => e.first_name === first)!;
  await db.from("employees").update({ manager_id: emp("Claire").id }).in("first_name", ["Julien", "Nadia", "Élise", "Karim", "Sophie", "Marc"]).eq("org_id", org_id);
  await db.from("employees").update({ manager_id: emp("Julien").id }).eq("role_key", "operator").eq("org_id", org_id);

  const baseSalary: Record<string, number> = { direction: 98000, production_manager: 52000, operator: 31000, quality: 46000, aero_engineer: 58000, sales: 45000, hr: 48000, accounting: 40000, read_only: 14000 };
  await insert(
    "employee_salaries",
    employees.map((e) => ({
      org_id,
      employee_id: e.id,
      gross_annual: Math.round((baseSalary[e.role_key as string] * between(0.92, 1.12)) / 100) * 100,
      months_count: rand() < 0.4 ? 13 : 12, // selon le contrat (payroll.monthsMode = per_contract)
      bonus: e.role_key === "sales" ? 6000 : e.role_key === "direction" ? 15000 : 0,
      effective_from: `${year}-01-01`,
    })),
  );

  // --- comptes de démo (un par rôle applicatif) ------------------------
  const accounts: { email: string; role: string; employee: string }[] = [];
  for (const [first, , , roleKey, , login] of team) {
    if (!login) continue;
    const email = demoEmail(login);
    const e = emp(first);
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${e.first_name} ${e.last_name}` },
    });
    if (error) throw new Error(`auth ${email} : ${error.message}`);
    await insert("profiles", [
      { user_id: data.user.id, org_id, role_id: roleId[roleKey], full_name: `${e.first_name} ${e.last_name}`, locale: c.locale, employee_id: e.id },
    ]);
    accounts.push({ email, role: roleKey, employee: e.id });
  }

  // --- ressources ------------------------------------------------------
  const suppliers = await insert(
    "suppliers",
    withOrg([
      { name: "Polymères du Médoc", category: "filament", email: "contact@polymeres-medoc.test", lead_time_days: 4, contact_name: "Service clients", address: "8 allée des Vignes, 33700 Mérignac", payment_terms_days: 30 },
      { name: "RésinaLab", category: "resin", email: "ventes@resinalab.test", lead_time_days: 6, contact_name: "Aurélie Garnier", address: "2 rue de la Chimie, 69007 Lyon", payment_terms_days: 45 },
      { name: "Poudres Pyrénées", category: "powder_polymer", email: "commandes@poudres-pyrenees.test", lead_time_days: 10, contact_name: "Bureau des ventes", address: "Zone des Gaves, 64000 Pau", payment_terms_days: 30 },
      { name: "MétalAtome", category: "powder_metal", email: "orders@metalatome.test", lead_time_days: 21, contact_name: "Service commandes", address: "15 quai de l'Industrie, 38000 Grenoble", payment_terms_days: 60, notes: "Certificats matière EN 10204 3.1 fournis avec chaque lot." },
      { name: "Gaz Inertes Sud-Ouest", category: "gas", email: "service@gaz-so.test", lead_time_days: 3, contact_name: "Astreinte livraisons", address: "Port autonome, 33530 Bassens", payment_terms_days: 30 },
    ]),
  );
  const sup = (cat: string) => suppliers.find((s) => s.category === cat)!.id;

  type A = { code: string; name: string; kind: string; technology?: string; zone: string; status?: string; specs?: object };
  const assetDefs: A[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ code: `FDM-0${i + 1}`, name: `FDM grand volume ${i + 1}`, kind: "machine", technology: "fdm", zone: "print_floor", specs: { volume: "600×600×600 mm" } })),
    ...Array.from({ length: 3 }, (_, i) => ({ code: `SLA-0${i + 1}`, name: `SLA haute résolution ${i + 1}`, kind: "machine", technology: "sla", zone: i === 2 ? "cleanroom" : "print_floor", specs: { resolution: "25 µm" } })),
    ...Array.from({ length: 2 }, (_, i) => ({ code: `SLS-0${i + 1}`, name: `SLS PA12 ${i + 1}`, kind: "machine", technology: "sls", zone: "print_floor", specs: { chamber: "380×280×380 mm" } })),
    ...Array.from({ length: 2 }, (_, i) => ({ code: `MET-0${i + 1}`, name: `SLM métal ${i + 1}`, kind: "machine", technology: "metal", zone: "atex_metal", specs: { laser: "2×700 W", gas: "argon" } })),
    { code: "GANTRY-01", name: "Portique grand format Alpha", kind: "machine", technology: "gantry", zone: "gantry_bay", specs: { volume: "24×6×4 m" } },
    { code: "GANTRY-02", name: "Portique grand format Bêta", kind: "machine", technology: "gantry", zone: "gantry_bay", specs: { volume: "18×5×4 m" } },
    { code: "DEP-01", name: "Station de dépoudrage", kind: "equipment", zone: "post_processing", specs: { visual: "glovebox" } },
    { code: "CUR-01", name: "Four de polymérisation UV", kind: "equipment", zone: "post_processing", specs: { visual: "oven_uv" } },
    { code: "SAB-01", name: "Cabine de microbillage", kind: "equipment", zone: "post_processing", specs: { visual: "blast" } },
    { code: "TTH-01", name: "Four de traitement thermique", kind: "equipment", zone: "atex_metal", specs: { visual: "oven" } },
    { code: "ATEX-ARM", name: "Armoire sécurisée poudres métalliques", kind: "equipment", zone: "atex_metal", specs: { classement: "ATEX zone 22", visual: "safety_cabinet" } },
    ...Array.from({ length: 4 }, (_, i) => ({ code: `CAO-0${i + 1}`, name: `Poste CAO ${i + 1}`, kind: "workstation", zone: "cad_office" })),
    { code: "CMM-01", name: "Machine à mesurer tridimensionnelle", kind: "equipment", zone: "quality_lab", specs: { visual: "cmm" } },
    { code: "SCAN-01", name: "Scanner 3D de contrôle", kind: "equipment", zone: "quality_lab", specs: { visual: "scanner" } },
    { code: "CT-01", name: "Tomographe CND", kind: "equipment", zone: "hangar_quality", specs: { visual: "ct" } },
    { code: "SALLE-GAR", name: "Salle Garonne", kind: "room", zone: "meeting_room", specs: { seats: 10, screen: true } },
    { code: "BADGE-ACC", name: "Badgeuse accueil", kind: "badge_reader", zone: "reception" },
    { code: "BADGE-ATEX", name: "Lecteur porte ATEX", kind: "badge_reader", zone: "atex_metal" },
    { code: "BADGE-SB", name: "Lecteur salle blanche", kind: "badge_reader", zone: "cleanroom" },
    { code: "BADGE-HGR", name: "Badgeuse hangar", kind: "badge_reader", zone: "gantry_bay" },
  ];
  const maintenance = new Set(["FDM-05"]);
  const down = new Set<string>();
  const idle = new Set(["FDM-06", "SLA-02"]);
  const assets = await insert(
    "assets",
    withOrg(
      assetDefs.map((a) => ({
        site_id: zoneSite(a.zone),
        zone_id: zone[a.zone].id,
        kind: a.kind,
        technology: a.technology ?? null,
        name: a.name,
        code: a.code,
        status: a.kind !== "machine" ? "idle" : maintenance.has(a.code) ? "maintenance" : down.has(a.code) ? "down" : idle.has(a.code) ? "idle" : "running",
        specs: a.specs ?? {},
        last_maintenance_on: day(-int(10, 80)),
        // FDM-03 : maintenance dépassée, SLS-01 : dans 4 jours (tuiles « à faire »)
        next_maintenance_on: a.code === "FDM-03" ? day(-3) : a.code === "SLS-01" ? day(4) : day(int(10, 60)),
        maintenance_interval_days: a.technology === "metal" || a.technology === "gantry" ? 60 : 90,
      })),
    ),
  );
  const asset = (code: string) => assets.find((a) => a.code === code)!;

  const stockDefs = [
    ["FIL-PLA", "Filament PLA technique 2,85 mm", "filament", "kg", 64, 20, "materials", "filament", 24],
    ["FIL-PETG", "Filament PETG 2,85 mm", "filament", "kg", 38, 20, "materials", "filament", 28],
    ["FIL-PA12CF", "Filament PA12 fibre de carbone", "filament", "kg", 9, 15, "materials", "filament", 95],
    ["FIL-PEEK", "Filament PEEK aéro", "filament", "kg", 12, 6, "materials", "filament", 480],
    ["FIL-ULTEM", "Filament ULTEM 9085 certifié", "filament", "kg", 18, 8, "materials", "filament", 390],
    ["RES-TOUGH", "Résine Tough 2000", "resin", "L", 22, 10, "materials", "resin", 165],
    ["RES-BIO", "Résine biocompatible classe IIa", "resin", "L", 4, 6, "cleanroom", "resin", 420],
    ["RES-HT", "Résine haute température", "resin", "L", 11, 5, "materials", "resin", 260],
    ["POW-PA12", "Poudre PA12", "powder_polymer", "kg", 140, 80, "materials", "powder_polymer", 62],
    ["POW-PA11", "Poudre PA11 biosourcée", "powder_polymer", "kg", 55, 40, "materials", "powder_polymer", 78],
    ["POW-TI64", "Poudre Ti6Al4V grade 23", "powder_metal", "kg", 36, 25, "atex_metal", "powder_metal", 410],
    ["POW-ALSI", "Poudre AlSi10Mg", "powder_metal", "kg", 18, 30, "atex_metal", "powder_metal", 120],
    ["POW-IN718", "Poudre Inconel 718", "powder_metal", "kg", 42, 20, "atex_metal", "powder_metal", 190],
    ["GAS-AR", "Argon 5.0 (bouteilles B50)", "gas", "u", 7, 4, "atex_metal", "gas", 85],
    ["PF-ATTENTE", "Pièces finies en attente d'expédition", "finished_part", "colis", 14, 0, "shipping", null, null],
  ] as const;
  const stock = await insert(
    "stock_items",
    withOrg(
      stockDefs.map(([sku, label, category, unit, qty, min, zoneKey, supCat, cost]) => ({
        sku,
        label,
        category,
        unit,
        quantity: qty,
        min_quantity: min,
        location_zone_id: zone[zoneKey].id,
        supplier_id: supCat ? sup(supCat) : null,
        unit_cost: cost,
        hazardous: category === "powder_metal" || category === "gas",
        pack_size: category === "powder_metal" ? 5 : category === "powder_polymer" ? 10 : category === "filament" ? 2 : 1,
      })),
    ),
  );

  // --- objets de la map (machines, postes, rayonnages) -----------------
  // Placement initial en rangées par zone ; modifiable ensuite dans le mode édition du plan.
  const kitOf = (a: Row) => (a.technology ? cfg.technologies.find((t) => t.id === a.technology)!.kit : a.kind);
  const zoneKeyOf = (zoneId: string) => zones.find((z) => z.id === zoneId)!.key as string;
  const mapObjects: Row[] = [];
  for (const zk of new Set(assets.map((a) => zoneKeyOf(a.zone_id)))) {
    // Les badgeuses vont près de l'entrée de zone, le reste est rangé.
    const inZone = assets.filter((a) => zoneKeyOf(a.zone_id) === zk);
    const placed = inZone.filter((a) => a.kind !== "badge_reader");
    const centers = packInZone(rects[zk], placed.map(kitOf));
    for (const [i, a] of inZone.entries()) {
      const j = placed.indexOf(a);
      const [x1, , , z2] = rects[zk];
      const position = j >= 0 ? centers[j] : { x: x1 + 0.8, y: 0, z: z2 - 0.8 - i * 0.1 };
      mapObjects.push({
        org_id, site_id: a.site_id, zone_id: a.zone_id, type: a.kind, kit: kitOf(a), position,
        rotation: 0, scale: 1, entity_type: "asset", entity_id: a.id, visual_state: a.status,
      });
    }
  }
  const racks: Row[] = [];
  for (const zk of new Set(stock.map((s) => zoneKeyOf(s.location_zone_id)))) {
    const inZone = stock.filter((s) => zoneKeyOf(s.location_zone_id) === zk);
    const [x1, , x2, z2] = rects[zk];
    // Rayonnages alignés contre le mur du fond de la zone.
    const centers = packInZone([x1, z2 - 2.2, x2, z2], inZone.map(() => "rack"), 0.6);
    inZone.forEach((s, i) =>
      racks.push({
        org_id, site_id: zoneSite(zk), zone_id: s.location_zone_id, type: "stock", kit: "rack",
        position: centers[i], rotation: 0, scale: 1, entity_type: "stock_item", entity_id: s.id,
        visual_state: Number(s.quantity) < Number(s.min_quantity) ? "low" : "ok",
      }),
    );
  }
  await insert("map_objects", [...mapObjects, ...racks]);

  // --- commercial ------------------------------------------------------
  const clientDefs = [
    ["Héliance Aéro", "Aéronautique", "aero_parts", "Toulouse"],
    ["Aquila Jets Privés", "Aviation d'affaires", "oblique_wing_supersonic", "Mérignac"],
    ["Cargo Céleste", "Fret aérien", "oblique_wing_supersonic", "Châteauroux"],
    ["Ligne Mach Atlantique", "Compagnie aérienne", "oblique_wing_supersonic", "Nantes"],
    ["Orbitale Lancements", "Spatial", "flying_wing_seaplane", "Kourou"],
    ["Hydro Lanceurs du Golfe", "Spatial", "flying_wing_seaplane", "Arcachon"],
    ["Médicor Implants", "Médical", "medical", "Lyon"],
    ["Ortho3D Santé", "Médical", "medical", "Bordeaux"],
    ["Clinique des Lauriers (fictive)", "Médical", "medical", "Pessac"],
    ["Valmy Turbines", "Énergie", "aero_parts", "Tarbes"],
    ["Soufflerie Atlantique", "Recherche", "wind_tunnel_models", "Poitiers"],
    ["Garonne Robotique", "Industrie", "industrial_parts", "Bègles"],
    ["Biscaye Drones", "Drones", "industrial_parts", "Anglet"],
  ] as const;
  const clients = await insert(
    "clients",
    withOrg(
      clientDefs.map(([name, industry, family, city], i) => ({
        name,
        industry,
        product_family: family,
        city,
        country: "FR",
        vat_number: `FR${String(10 + i).padStart(2, "0")}${String(900000000 + i * 7919).slice(0, 9)}`,
        payment_terms_days: cfg.crm.paymentTermsDays,
        status: i === 12 ? "prospect" : "active",
        owner_employee_id: family === "medical" ? emp("Pauline").id : emp("Karim").id,
      })),
    ),
  );
  const firstNames = ["Camille", "Nicolas", "Aurélie", "Thomas", "Julie", "Olivier", "Margaux", "Damien", "Laura", "Benoît", "Céline", "Fabien", "Émilie"];
  const lastNames = ["Arnaud", "Bertin", "Castel", "Delmas", "Esteve", "Faure", "Gaillard", "Hébert", "Imbert", "Jolly", "Klein", "Laporte", "Marchal"];
  const contacts = await insert(
    "contacts",
    clients.flatMap((cl, i) => [
      { org_id, client_id: cl.id, first_name: firstNames[i], last_name: lastNames[i], email: `${firstNames[i]}.${lastNames[i]}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@client.test", phone: `+33 6 00 00 ${String(i).padStart(2, "0")} 00`, job_title: pick(["Acheteur", "Directeur technique", "Responsable industrialisation", "Ingénieur projet"]), is_primary: true },
      ...(i % 3 === 0 ? [{ org_id, client_id: cl.id, first_name: firstNames[(i + 5) % 13], last_name: lastNames[(i + 7) % 13], email: `contact${i}@client.test`, phone: null, job_title: "Responsable qualité fournisseurs", is_primary: false }] : []),
    ]),
  );
  const client = (name: string) => clients.find((cl) => cl.name === name)!;

  const catalog = await insert(
    "catalog_items",
    withOrg([
      { sku: "IMP-FDM-H", label: "Impression FDM (heure machine)", unit: "h", unit_price: 45, unit_cost: 16, technology: "fdm", category: "impression" },
      { sku: "IMP-SLA-H", label: "Impression SLA (heure machine)", unit: "h", unit_price: 70, unit_cost: 26, technology: "sla", category: "impression" },
      { sku: "IMP-SLS-H", label: "Impression SLS (heure machine)", unit: "h", unit_price: 95, unit_cost: 38, technology: "sls", category: "impression" },
      { sku: "IMP-MET-H", label: "Impression métal SLM (heure machine)", unit: "h", unit_price: 260, unit_cost: 115, technology: "metal", category: "impression" },
      { sku: "IMP-GNT-H", label: "Portique grand format (heure machine)", unit: "h", unit_price: 620, unit_cost: 270, technology: "gantry", category: "impression" },
      { sku: "MAT-TI64", label: "Matière Ti6Al4V", unit: "kg", unit_price: 690, unit_cost: 410, technology: "metal", category: "matière" },
      { sku: "MAT-PEEK", label: "Matière PEEK", unit: "kg", unit_price: 780, unit_cost: 480, technology: "fdm", category: "matière" },
      { sku: "MAT-COMP", label: "Composite structure aéro (portique)", unit: "kg", unit_price: 140, unit_cost: 82, technology: "gantry", category: "matière" },
      { sku: "CAO-H", label: "Ingénierie CAO / optimisation topologique", unit: "h", unit_price: 110, unit_cost: 52, technology: null, category: "ingénierie" },
      { sku: "PT-STD", label: "Post-traitement standard (dépoudrage, microbillage)", unit: "u", unit_price: 35, unit_cost: 12, technology: null, category: "post-traitement" },
      { sku: "PT-TTH", label: "Traitement thermique métal", unit: "lot", unit_price: 480, unit_cost: 190, technology: "metal", category: "post-traitement" },
      { sku: "CQ-CT", label: "Contrôle tomographique CND", unit: "u", unit_price: 380, unit_cost: 140, technology: null, category: "qualité" },
      { sku: "CQ-DOC", label: "Dossier de traçabilité EN 9100 / ISO 13485", unit: "u", unit_price: 250, unit_cost: 90, technology: null, category: "qualité" },
      { sku: "ASM-AERO", label: "Assemblage aéro (heure équipe)", unit: "h", unit_price: 180, unit_cost: 85, technology: "gantry", category: "assemblage" },
    ]),
  );
  const item = (sku: string) => catalog.find((ci) => ci.sku === sku)!;

  // Projets : devis → (accepté) → OF → heures → facture
  type Proj = {
    client: string; title: string; family: string; tech: string; machine?: string; stage: string; stageProgress: number;
    lines: [sku: string, qty: number][]; quote: "draft" | "sent" | "accepted" | "rejected"; due: number; priority?: string; owner: string; physical: string;
    /** Apparence 3D de l'appareil (familles aéro), lue par la Map. */
    model?: { type: "oblique_jet" | "flying_wing"; variant?: string; rockets?: number[] };
  };
  const projects: Proj[] = [
    { client: "Cargo Céleste", title: "Tronçon de fuselage T3 — supersonique aile oblique (cargo)", family: "oblique_wing_supersonic", tech: "gantry", machine: "GANTRY-01", stage: "printing", stageProgress: 62, lines: [["IMP-GNT-H", 180], ["MAT-COMP", 2400], ["CAO-H", 120], ["CQ-CT", 6], ["CQ-DOC", 1]], quote: "accepted", due: 34, priority: "high", owner: "Inès", physical: "Tronçon de fuselage T3 (14 m)", model: { type: "oblique_jet", variant: "cargo" } },
    { client: "Aquila Jets Privés", title: "Démonstrateur jet privé aile oblique AQ-1", family: "oblique_wing_supersonic", tech: "gantry", machine: "GANTRY-02", stage: "post_processing", stageProgress: 30, lines: [["IMP-GNT-H", 260], ["MAT-COMP", 3100], ["ASM-AERO", 400], ["CQ-DOC", 1]], quote: "accepted", due: 21, priority: "urgent", owner: "Élise", physical: "Jet privé AQ-1 (démonstrateur complet)", model: { type: "oblique_jet", variant: "private" } },
    { client: "Ligne Mach Atlantique", title: "Aile pivotante — maquette soufflerie 1:20 (version ligne)", family: "wind_tunnel_models", tech: "sla", machine: "SLA-01", stage: "quality", stageProgress: 50, lines: [["IMP-SLA-H", 46], ["CAO-H", 30], ["PT-STD", 12], ["CQ-DOC", 1]], quote: "accepted", due: 5, owner: "Nadia", physical: "Maquette soufflerie 1:20" },
    { client: "Orbitale Lancements", title: "Hydravion aile volante HV-2 — porte-fusée orbitale", family: "flying_wing_seaplane", tech: "gantry", stage: "slicing", stageProgress: 70, lines: [["IMP-GNT-H", 420], ["MAT-COMP", 5200], ["ASM-AERO", 900], ["CAO-H", 260], ["CQ-DOC", 1]], quote: "accepted", due: 75, priority: "high", owner: "Mathis", physical: "Hydravion HV-2 (envergure 62 m)", model: { type: "flying_wing", rockets: [1.6] } },
    { client: "Hydro Lanceurs du Golfe", title: "Hydravion HV-1 — essais de largage double fusée", family: "flying_wing_seaplane", tech: "gantry", stage: "shipping", stageProgress: 40, lines: [["ASM-AERO", 320], ["CQ-CT", 10], ["CQ-DOC", 1]], quote: "accepted", due: 1, priority: "urgent", owner: "Élise", physical: "Hydravion HV-1 sur la cale", model: { type: "flying_wing", rockets: [1, 1] } },
    { client: "Héliance Aéro", title: "Injecteurs carburant Inconel — lot 40", family: "aero_parts", tech: "metal", machine: "MET-01", stage: "printing", stageProgress: 85, lines: [["IMP-MET-H", 38], ["MAT-TI64", 6], ["PT-TTH", 2], ["CQ-CT", 4], ["CQ-DOC", 1]], quote: "accepted", due: 9, owner: "Tom", physical: "40 injecteurs Inconel 718" },
    { client: "Valmy Turbines", title: "Aubes de turbine — prototype Ti6Al4V", family: "aero_parts", tech: "metal", machine: "MET-02", stage: "printing", stageProgress: 20, lines: [["IMP-MET-H", 52], ["MAT-TI64", 9], ["PT-TTH", 1], ["CQ-CT", 3]], quote: "accepted", due: 16, owner: "Tom", physical: "12 aubes Ti6Al4V" },
    { client: "Médicor Implants", title: "Implants de hanche sur mesure — série 3", family: "medical", tech: "metal", stage: "feasibility", stageProgress: 40, lines: [["IMP-MET-H", 24], ["MAT-TI64", 2], ["CQ-DOC", 1]], quote: "accepted", due: 28, owner: "Nadia", physical: "6 cupules Ti6Al4V" },
    { client: "Ortho3D Santé", title: "Guides chirurgicaux patient — lot octobre", family: "medical", tech: "sla", machine: "SLA-03", stage: "printing", stageProgress: 45, lines: [["IMP-SLA-H", 18], ["PT-STD", 24], ["CQ-DOC", 1]], quote: "accepted", due: 3, priority: "high", owner: "Manon", physical: "24 guides chirurgicaux" },
    { client: "Clinique des Lauriers (fictive)", title: "Modèles anatomiques de planification", family: "medical", tech: "sla", stage: "intake", stageProgress: 20, lines: [["IMP-SLA-H", 10], ["CAO-H", 6]], quote: "accepted", due: 12, owner: "Lucas", physical: "5 modèles anatomiques" },
    { client: "Garonne Robotique", title: "Pinces de préhension PA12-CF", family: "industrial_parts", tech: "fdm", machine: "FDM-01", stage: "printing", stageProgress: 70, lines: [["IMP-FDM-H", 64], ["PT-STD", 30]], quote: "accepted", due: 6, owner: "Samir", physical: "30 pinces PA12-CF" },
    { client: "Garonne Robotique", title: "Carters de capteurs — série pilote", family: "industrial_parts", tech: "sls", machine: "SLS-01", stage: "post_processing", stageProgress: 60, lines: [["IMP-SLS-H", 22], ["PT-STD", 120]], quote: "accepted", due: 4, owner: "Chloé", physical: "120 carters PA12" },
    { client: "Biscaye Drones", title: "Bras de drone allégés", family: "industrial_parts", tech: "sls", machine: "SLS-02", stage: "printing", stageProgress: 35, lines: [["IMP-SLS-H", 30], ["CAO-H", 12], ["PT-STD", 60]], quote: "accepted", due: 8, owner: "Léa", physical: "60 bras de drone" },
    { client: "Soufflerie Atlantique", title: "Maquette hydravion aile volante 1:50", family: "wind_tunnel_models", tech: "fdm", machine: "FDM-02", stage: "quality", stageProgress: 20, lines: [["IMP-FDM-H", 40], ["CAO-H", 16], ["PT-STD", 6]], quote: "accepted", due: -1, owner: "Antoine", physical: "Maquette 1:50" },
    { client: "Héliance Aéro", title: "Conduits de climatisation cabine ULTEM", family: "aero_parts", tech: "fdm", machine: "FDM-03", stage: "shipping", stageProgress: 80, lines: [["IMP-FDM-H", 55], ["PT-STD", 18], ["CQ-DOC", 1]], quote: "accepted", due: 0, owner: "Kévin", physical: "18 conduits ULTEM 9085" },
    // Devis en cours (pas encore d'OF)
    { client: "Ligne Mach Atlantique", title: "Présérie panneaux de voilure aile oblique", family: "oblique_wing_supersonic", tech: "gantry", stage: "", stageProgress: 0, lines: [["IMP-GNT-H", 600], ["MAT-COMP", 8000], ["CQ-DOC", 1]], quote: "sent", due: 120, owner: "Karim", physical: "" },
    { client: "Orbitale Lancements", title: "Berceaux de fusée — interface hydravion", family: "flying_wing_seaplane", tech: "metal", stage: "", stageProgress: 0, lines: [["IMP-MET-H", 140], ["MAT-TI64", 30], ["CQ-CT", 8]], quote: "sent", due: 60, owner: "Karim", physical: "" },
    { client: "Biscaye Drones", title: "Coques de drone — série 500", family: "industrial_parts", tech: "sls", stage: "", stageProgress: 0, lines: [["IMP-SLS-H", 120], ["PT-STD", 500]], quote: "draft", due: 45, owner: "Karim", physical: "" },
    { client: "Médicor Implants", title: "Plaques crâniennes PEEK", family: "medical", tech: "fdm", stage: "", stageProgress: 0, lines: [["IMP-FDM-H", 30], ["MAT-PEEK", 3], ["CQ-DOC", 1]], quote: "rejected", due: 0, owner: "Pauline", physical: "" },
  ];

  const stages = cfg.workOrder.stages;
  const pipeline = cfg.crm.pipelineStages;
  let quoteSeq = 0;
  let woSeq = 0;
  let invSeq = 0;

  for (const [pi, p] of projects.entries()) {
    const cl = client(p.client);
    const lines = p.lines.map(([sku, qty]) => ({ ci: item(sku), qty }));
    const totals = computeQuoteTotals(
      lines.map(({ ci, qty }) => ({ quantity: qty, unitPrice: toCents(Number(ci.unit_price)), unitCost: toCents(Number(ci.unit_cost)) })),
      c.vatRate,
      c.rounding,
    );
    const dealStage = p.quote === "accepted" ? "won" : p.quote === "rejected" ? "lost" : p.quote === "sent" ? "negotiation" : "proposal";
    const [deal] = await insert("deals", [
      {
        org_id,
        client_id: cl.id,
        title: p.title,
        stage: dealStage,
        value: fromCents(totals.net),
        probability: pipeline.find((s) => s.id === dealStage)!.probability,
        expected_close: day(p.quote === "accepted" ? -int(10, 60) : int(5, 40)),
        owner_employee_id: cl.owner_employee_id,
        product_family: p.family,
        next_step: p.quote === "sent" ? "Relancer l'acheteur sur le devis" : p.quote === "draft" ? "Finaliser le chiffrage" : null,
        next_step_on: p.quote === "sent" ? day(int(-2, 2)) : p.quote === "draft" ? day(1) : null,
        lost_reason: p.quote === "rejected" ? "Prix — concurrent moins cher sur le PEEK" : null,
      },
    ]);
    // Devis envoyés il y a 8 à 12 jours : ils remontent dans « à relancer ».
    const issued = p.quote === "accepted" ? -int(20, 70) : p.quote === "sent" ? -int(8, 12) : -int(1, 3);
    const [quote] = await insert("quotes", [
      {
        org_id,
        client_id: cl.id,
        deal_id: deal.id,
        number: formatDocumentNumber(cfg.crm.quotePrefix, year, ++quoteSeq),
        status: p.quote,
        issue_date: day(issued),
        valid_until: day(issued + cfg.crm.quoteValidityDays),
        total_ht: fromCents(totals.net),
        total_vat: fromCents(totals.vat),
        total_ttc: fromCents(totals.gross),
        total_cost: fromCents(totals.cost),
        accepted_at: p.quote === "accepted" ? iso(at(issued + 3, 10)) : null,
        sent_at: p.quote === "draft" ? null : iso(at(issued, 11)),
        contact_id: contacts.find((ct) => ct.client_id === cl.id && ct.is_primary)?.id ?? null,
        rejected_reason: p.quote === "rejected" ? "Prix" : null,
      },
    ]);
    await insert(
      "quote_lines",
      lines.map(({ ci, qty }, i) => ({ org_id, quote_id: quote.id, catalog_item_id: ci.id, description: ci.label, quantity: qty, unit_price: ci.unit_price, unit_cost: ci.unit_cost, position: i })),
    );
    if (!p.stage) continue;

    // Ordre de fabrication
    const stageIdx = stages.findIndex((s) => s.id === p.stage);
    const machine = p.machine ? asset(p.machine) : null;
    const zoneKey =
      p.family === "flying_wing_seaplane" || p.family === "oblique_wing_supersonic"
        ? p.stage === "shipping" ? (p.family === "flying_wing_seaplane" ? "slipway" : "tarmac") : p.stage === "printing" ? "gantry_bay" : "assembly_line"
        : p.stage === "printing" && machine ? (zones.find((z) => z.id === machine.zone_id)!.key as string) : stages[stageIdx].zoneId!;
    const hoursBudget = lines.filter(({ ci }) => ci.unit === "h").reduce((s, { qty }) => s + qty, 0);
    const [wo] = await insert("work_orders", [
      {
        org_id,
        site_id: zoneSite(zoneKey),
        number: formatDocumentNumber(cfg.workOrder.shortCode, year, ++woSeq),
        client_id: cl.id,
        quote_id: quote.id,
        title: p.title,
        product_family: p.family,
        technology: p.tech,
        physical_object: p.physical,
        stage: p.stage,
        stage_progress: p.stageProgress,
        progress: overallProgress(stages, p.stage, p.stageProgress),
        owner_employee_id: emp(p.owner).id,
        asset_id: p.stage === "printing" ? machine?.id ?? null : null,
        zone_id: zone[zoneKey].id,
        hours_budget: hoursBudget,
        due_date: day(p.due),
        priority: p.priority ?? "normal",
        traceability: { ...(p.model ? { model: p.model } : {}), lot_matiere: `LOT-${year}-${String(pi * 37 + 101).padStart(4, "0")}`, norme: p.family === "medical" ? "ISO 13485" : p.family.includes("aero") || p.family.includes("wing") || p.family.includes("seaplane") ? "EN 9100" : "ISO 9001" },
      },
    ]);
    let t = at(issued + 3, 11);
    await insert(
      "work_order_stages",
      stages.slice(0, stageIdx + 1).map((s, i) => {
        const entered = t;
        t = new Date(Math.min(now.getTime() - 3_600_000 * (stageIdx - i), entered.getTime() + 86_400_000 * between(0.5, 4)));
        return { org_id, work_order_id: wo.id, stage: s.id, entered_at: iso(entered), left_at: i < stageIdx ? iso(t) : null, actor_employee_id: emp(p.owner).id };
      }),
    );
    await insert("tasks", [
      { org_id, work_order_id: wo.id, title: "Vérifier le fichier CAO et l'orientation", status: stageIdx > 1 ? "done" : "doing", assignee_employee_id: emp("Lucas").id, due_on: day(-2), position: 0 },
      { org_id, work_order_id: wo.id, title: "Réserver la matière et la machine", status: stageIdx > 2 ? "done" : "todo", assignee_employee_id: emp("Julien").id, due_on: day(0), position: 1 },
      { org_id, work_order_id: wo.id, title: "Préparer le dossier de traçabilité", status: stageIdx > 5 ? "done" : "todo", assignee_employee_id: emp("Nadia").id, due_on: day(p.due - 1), position: 2 },
    ]);
    await insert("checklists", [
      { org_id, work_order_id: wo.id, title: "Contrôle qualité", items: [{ label: "Contrôle dimensionnel", done: stageIdx > 5 }, { label: "Contrôle visuel", done: stageIdx > 5 }, { label: "Certificat matière joint", done: stageIdx > 4 }] },
    ]);
    const spent = hoursBudget * Math.min(1.15, (stageIdx + p.stageProgress / 100) / stages.length) * between(0.8, 1.25);
    const entries = Math.max(1, Math.min(8, Math.round(spent / 6)));
    await insert(
      "time_entries",
      Array.from({ length: entries }, (_, i) => ({
        org_id,
        work_order_id: wo.id,
        employee_id: emp(i % 2 ? p.owner : pick(["Samir", "Léa", "Lucas", "Chloé", "Inès", "Hugo"])).id,
        work_date: day(-i - 1),
        hours: Math.max(0.5, Math.round((spent / entries) * 4) / 4),
        billable: i % 5 !== 4,
      })),
    );
    if (machine && p.stage === "printing") {
      await insert("asset_bookings", [{ org_id, asset_id: machine.id, work_order_id: wo.id, starts_at: iso(at(-1, 6)), ends_at: iso(at(int(0, 3), int(9, 20))), booked_by: emp("Julien").id }]);
    }
    // Fil client du dossier : question entrante + brouillon préparé (ou déjà répondu, lu).
    const contact = contacts.find((ct) => ct.client_id === cl.id && ct.is_primary);
    const owner = emp(p.owner);
    const inbound = [
      "Bonjour, pouvez-vous nous confirmer la date de livraison ? Merci.",
      "Bonjour, pourriez-vous nous transmettre le certificat matière et la traçabilité du lot ?",
      "Bonjour, où en est l'avancement ? Nous devons caler nos essais.",
    ][pi % 3];
    const answered = pi % 4 === 3;
    const inAt = at(-int(0, 3), int(8, 16), int(0, 59));
    const draft = suggestReply(inbound, {
      companyName: c.name,
      senderName: `${owner.first_name} ${owner.last_name}`,
      contactFirstName: contact?.first_name as string | undefined,
      workOrder: { number: wo.number, stageLabel: stages[stageIdx].label, dueDate: frDate(day(p.due)), late: p.due < 0, progress: wo.progress },
    });
    const [th] = await insert("threads", [{ org_id, subject: `${wo.number} — ${p.title}`, channel: "email", client_id: cl.id, work_order_id: wo.id, assigned_employee: owner.id, last_message_at: iso(answered ? new Date(inAt.getTime() + 40 * 60_000) : inAt), read_at: answered ? iso(new Date(inAt.getTime() + 30 * 60_000)) : null }]);
    await insert("messages", [
      { org_id, thread_id: th.id, direction: "in", author: contact ? `${contact.first_name} ${contact.last_name} (${p.client})` : p.client, body: inbound, sent_at: iso(inAt) },
      { org_id, thread_id: th.id, direction: "out", author: `${owner.first_name} ${owner.last_name}`, body: draft.body, ai_draft: !answered, sent_at: answered ? iso(new Date(inAt.getTime() + 40 * 60_000)) : null },
    ]);
  }

  // Affaires en amont (pas encore de devis) pour remplir le haut du pipeline
  await insert("deals", [
    { org_id, client_id: client("Biscaye Drones").id, title: "Châssis de drone de livraison", stage: "lead", value: 18000, probability: 0.1, expected_close: day(60), owner_employee_id: emp("Karim").id, product_family: "industrial_parts", next_step: "Premier appel découverte", next_step_on: day(0) },
    { org_id, client_id: client("Valmy Turbines").id, title: "Brûleurs de turbine — série 2", stage: "qualified", value: 64000, probability: 0.25, expected_close: day(45), owner_employee_id: emp("Karim").id, product_family: "aero_parts", next_step: "Recevoir les fichiers CAO", next_step_on: day(2) },
    { org_id, client_id: client("Ortho3D Santé").id, title: "Guides dentaires — contrat annuel", stage: "qualified", value: 42000, probability: 0.25, expected_close: day(30), owner_employee_id: emp("Pauline").id, product_family: "medical", next_step: "Visite du site client", next_step_on: day(-1) },
    { org_id, client_id: client("Cargo Céleste").id, title: "Portes cargo aile oblique — étude", stage: "lead", value: 120000, probability: 0.1, expected_close: day(90), owner_employee_id: emp("Karim").id, product_family: "oblique_wing_supersonic", next_step: "Envoyer la plaquette aéro", next_step_on: day(0) },
  ]);

  // Factures : projets déjà livrés (historique) + acomptes sur les gros OF
  const { data: wos } = await db.from("work_orders").select("*").eq("org_id", org_id);
  const invoiceDefs = [
    { client: "Héliance Aéro", label: "Pièces moteur — lot septembre", ht: 18400, status: "paid", issued: -48 },
    { client: "Garonne Robotique", label: "Outillages de production", ht: 6250, status: "paid", issued: -35 },
    { client: "Soufflerie Atlantique", label: "Maquette jet aile oblique 1:30", ht: 9800, status: "overdue", issued: -52 },
    { client: "Ortho3D Santé", label: "Guides chirurgicaux — lot septembre", ht: 4320, status: "sent", issued: -12 },
    { client: "Cargo Céleste", label: `Acompte 30 % — ${wos![0].number}`, ht: 0.3 * 0, status: "sent", issued: -20 },
    { client: "Aquila Jets Privés", label: `Acompte 40 % — ${wos![1].number}`, ht: 0, status: "partially_paid", issued: -25 },
    { client: "Valmy Turbines", label: "Étude de faisabilité aubes", ht: 3600, status: "paid", issued: -60 },
    { client: "Médicor Implants", label: "Série 2 implants", ht: 12900, status: "overdue", issued: -41 },
  ];
  // Historique de facturation (soldé, 3 à 11 mois) pour les tendances du pilotage.
  // Numérotation chronologique et par année, comme l'exige la loi (et next_document_number).
  const historyClients = ["Héliance Aéro", "Garonne Robotique", "Valmy Turbines", "Ortho3D Santé", "Médicor Implants", "Soufflerie Atlantique", "Biscaye Drones"];
  const issues: number[] = [];
  for (let mo = 11; mo >= 3; mo--) for (let k = 0; k < int(2, 4); k++) issues.push(-(mo * 30 + int(0, 25)));
  issues.sort((a, b) => a - b);
  const seqByYear = new Map<number, number>();
  const histInvoices: Row[] = issues.map((issue) => {
    const ht = Math.round(between(9000, 68000) / 10) * 10;
    const vat = computeVat(toCents(ht), c.vatRate, c.rounding);
    const cl = client(pick(historyClients));
    const y = Number(day(issue).slice(0, 4));
    const seq = y === year ? ++invSeq : (seqByYear.get(y) ?? 0) + 1;
    if (y !== year) seqByYear.set(y, seq);
    return {
      org_id, client_id: cl.id, kind: "invoice", contact_id: contacts.find((ct) => ct.client_id === cl.id && ct.is_primary)?.id ?? null,
      number: formatDocumentNumber(cfg.crm.invoicePrefix, y, seq), status: "paid", issue_date: day(issue), due_date: day(issue + cfg.crm.paymentTermsDays), sent_at: iso(at(issue, 9)),
      total_ht: ht, total_vat: fromCents(vat.vat), total_ttc: fromCents(vat.gross), paid_amount: fromCents(vat.gross),
      _paid: day(issue + int(25, 45)),
    };
  });
  const hist = await insert("invoices", histInvoices.map(({ _paid, ...r }) => r));
  await insert("invoice_lines", hist.map((h) => ({ org_id, invoice_id: h.id, description: "Production de pièces — lot", quantity: 1, unit_price: h.total_ht, vat_rate: c.vatRate, position: 0 })));
  await insert("payments", hist.map((h, i) => ({ org_id, invoice_id: h.id, amount: h.total_ttc, paid_on: histInvoices[i]._paid, method: "transfer" })));

  for (const inv of invoiceDefs) {
    const cl = client(inv.client);
    let ht = inv.ht;
    let woId: string | null = null;
    if (ht === 0) {
      const wo = wos!.find((w) => w.client_id === cl.id)!;
      const { data: q } = await db.from("quotes").select("total_ht").eq("id", wo.quote_id).single();
      ht = Math.round(Number(q!.total_ht) * (inv.label.includes("30") ? 0.3 : 0.4));
      woId = wo.id;
    }
    const vat = computeVat(toCents(ht), c.vatRate, c.rounding);
    const ttc = fromCents(vat.gross);
    const [invoice] = await insert("invoices", [
      {
        org_id,
        client_id: cl.id,
        work_order_id: woId,
        kind: inv.label.startsWith("Acompte") ? "deposit" : "invoice",
        contact_id: contacts.find((ct) => ct.client_id === cl.id && ct.is_primary)?.id ?? null,
        sent_at: iso(at(inv.issued, 9)),
        number: formatDocumentNumber(cfg.crm.invoicePrefix, year, ++invSeq),
        status: inv.status,
        issue_date: day(inv.issued),
        due_date: day(inv.issued + cfg.crm.paymentTermsDays),
        total_ht: ht,
        total_vat: fromCents(vat.vat),
        total_ttc: ttc,
        paid_amount: inv.status === "paid" ? ttc : inv.status === "partially_paid" ? Math.round(ttc / 2) : 0,
      },
    ]);
    await insert("invoice_lines", [{ org_id, invoice_id: invoice.id, description: inv.label, quantity: 1, unit_price: ht, vat_rate: c.vatRate, position: 0 }]);
    if (inv.status === "paid" || inv.status === "partially_paid") {
      await insert("payments", [{ org_id, invoice_id: invoice.id, amount: inv.status === "paid" ? ttc : Math.round(ttc / 2), paid_on: day(inv.issued + int(15, 30)), method: "transfer" }]);
    }
    if (inv.status === "overdue") {
      await insert("dunning_steps", [{ org_id, invoice_id: invoice.id, level: 1, sent_at: iso(at(inv.issued + cfg.crm.paymentTermsDays + 3, 9)), channel: "email" }]);
    }
  }
  await insert(
    "cash_forecast",
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, now.getMonth() + i, 1);
      return { org_id, month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, inflow: Math.round(between(180000, 420000) / 1000) * 1000, outflow: Math.round(between(160000, 260000) / 1000) * 1000 };
    }),
  );
  const poLine = (sku: string, qty: number) => {
    const it = stock.find((st) => st.sku === sku)!;
    return { stock_item_id: it.id, sku, label: it.label, qty, unit: it.unit, unit_cost: Number(it.unit_cost) };
  };
  // AlSi10Mg déjà commandé (en route) ; le PA12-CF reste à commander : il apparaît dans « à faire ».
  // Historique reçu (taux de service fournisseurs) puis la commande en route
  const received = (sku: string, qty: number) => ({ ...poLine(sku, qty), received: qty });
  await insert("purchase_orders", [
    { org_id, supplier_id: sup("powder_polymer"), number: `CMD-${year}-0028`, status: "received", sent_at: iso(at(-52, 10)), expected_on: day(-42), received_at: iso(at(-43, 9)), total: 1840, lines: [received("POW-PA12", 40)] },
    { org_id, supplier_id: sup("resin"), number: `CMD-${year}-0029`, status: "received", sent_at: iso(at(-33, 10)), expected_on: day(-27), received_at: iso(at(-23, 9)), total: 960, lines: [received("RES-BIO", 12)] },
    { org_id, supplier_id: sup("filament"), number: `CMD-${year}-0030`, status: "received", sent_at: iso(at(-16, 10)), expected_on: day(-12), received_at: iso(at(-12, 15)), total: 720, lines: [received("FIL-PA12CF", 24)] },
  ]);
  await insert("purchase_orders", [
    { org_id, supplier_id: sup("powder_metal"), number: `CMD-${year}-0031`, status: "sent", sent_at: iso(at(-4, 10)), total: 7200, expected_on: day(9), lines: [poLine("POW-ALSI", 60)] },
  ]);
  await insert("stock_movements", stock.slice(0, 10).map((s, i) => ({ org_id, stock_item_id: s.id, delta: -int(1, 8), reason: "consommation OF", at: iso(at(-(i % 4), 9 + i)) })));

  // --- communication : fils hors dossier (facture, fournisseur, demande de devis, note interne) ---
  const person = (first: string) => `${emp(first).first_name} ${emp(first).last_name}`;
  const contactOf = (name: string) => contacts.find((ct) => ct.client_id === client(name).id && ct.is_primary)!;
  const { data: medInv } = await db.from("invoices").select("id, number, due_date, total_ttc, paid_amount").eq("org_id", org_id).eq("client_id", client("Médicor Implants").id).eq("status", "overdue").single();
  const medContact = contactOf("Médicor Implants");
  const invQuestion = `Bonjour, notre service comptable ne retrouve pas la facture ${medInv!.number}. Pouvez-vous nous la renvoyer ?`;
  const biscContact = contactOf("Biscaye Drones");
  const quoteQuestion = "Bonjour, pourriez-vous nous faire un devis pour 200 coques de drone en PA12, livrables en janvier ?";
  const soufflerieWo = wos!.find((w) => w.client_id === client("Soufflerie Atlantique").id && w.status === "active")!;
  const [invTh, supTh, quoteTh, intTh] = await insert("threads", [
    { org_id, subject: `Facture ${medInv!.number}`, channel: "email", client_id: client("Médicor Implants").id, assigned_employee: emp("Marc").id, last_message_at: iso(at(0, 8, 12)) },
    { org_id, subject: `Commande CMD-${year}-0031 — poudre AlSi10Mg`, channel: "email", supplier_id: sup("powder_metal"), assigned_employee: emp("Julien").id, last_message_at: iso(at(-1, 15, 40)) },
    { org_id, subject: "Demande de devis — coques de drone série 200", channel: "email", client_id: client("Biscaye Drones").id, assigned_employee: emp("Karim").id, last_message_at: iso(at(0, 7, 55)) },
    { org_id, subject: `${soufflerieWo.number} — écart de cote au contrôle`, channel: "internal", work_order_id: soufflerieWo.id, client_id: soufflerieWo.client_id, created_by_employee: emp("Nadia").id, assigned_employee: emp("Karim").id, last_message_at: iso(at(0, 9, 5)) },
  ]);
  const signed = (first: string, inbound: string, extra: Partial<Parameters<typeof suggestReply>[1]>) => suggestReply(inbound, { ...extra, companyName: c.name, senderName: person(first) }).body;
  await insert("messages", [
    { org_id, thread_id: invTh.id, direction: "in", author: `${medContact.first_name} ${medContact.last_name} (Médicor Implants)`, body: invQuestion, sent_at: invTh.last_message_at },
    { org_id, thread_id: invTh.id, direction: "out", author: person("Marc"), ai_draft: true, sent_at: null, body: signed("Marc", invQuestion, { contactFirstName: medContact.first_name as string, invoice: { number: medInv!.number, paid: false, dueDate: frDate(medInv!.due_date), balance: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(medInv!.total_ttc) - Number(medInv!.paid_amount)), overdue: true } }) },
    { org_id, thread_id: supTh.id, direction: "out", author: person("Julien"), body: `Bonjour, pouvez-vous nous confirmer la date d'expédition de la commande CMD-${year}-0031 ?`, sent_at: iso(at(-2, 10, 5)) },
    { org_id, thread_id: supTh.id, direction: "in", author: "Service commandes (MétalAtome)", body: "Bonjour, nous pouvons avancer la livraison de 3 jours si vous acceptez une livraison en deux palettes. Merci de nous confirmer.", sent_at: supTh.last_message_at },
    { org_id, thread_id: quoteTh.id, direction: "in", author: `${biscContact.first_name} ${biscContact.last_name} (Biscaye Drones)`, body: quoteQuestion, sent_at: quoteTh.last_message_at },
    { org_id, thread_id: quoteTh.id, direction: "out", author: person("Karim"), ai_draft: true, sent_at: null, body: signed("Karim", quoteQuestion, { contactFirstName: biscContact.first_name as string }) },
    { org_id, thread_id: intTh.id, direction: "internal", author: person("Nadia"), body: `Karim, au contrôle de la ${soufflerieWo.title.toLowerCase()}, le bord d'attaque sort à +0,3 mm. On relance une impression (2 jours) : peux-tu prévenir le client du décalage ?`, sent_at: intTh.last_message_at },
  ]);

  // Documents de démo (stockage privé, dossier de l'organisation)
  const docDefs = [
    { name: `Plan CAO rev B — ${soufflerieWo.number}.pdf`, entity_type: "work_order", entity_id: soufflerieWo.id, by: "Nadia" },
    { name: "Certificat matière — lot Ti6Al4V 2610.pdf", entity_type: "work_order", entity_id: wos!.find((w) => w.title.startsWith("Aubes"))!.id, by: "Tom" },
    { name: "Conditions générales d'achat — Héliance Aéro.pdf", entity_type: "client", entity_id: client("Héliance Aéro").id, by: "Karim" },
    { name: "Fiche de données de sécurité — poudre AlSi10Mg.pdf", entity_type: "supplier", entity_id: sup("powder_metal"), by: "Julien" },
  ];
  for (const [i, d] of docDefs.entries()) {
    const blob = tinyPdf(d.name.replace(/\.pdf$/, ""));
    const path = `${org_id}/${d.entity_type}/seed-${i}.pdf`;
    const { error } = await db.storage.from("documents").upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`storage : ${error.message}`);
    await insert("documents", [{ org_id, entity_type: d.entity_type, entity_id: d.entity_id, name: d.name, storage_path: path, mime: "application/pdf", size_bytes: blob.size, uploaded_by: person(d.by), created_at: iso(at(-i - 1, 11)) }]);
  }

  // --- présence du jour ------------------------------------------------
  const badgeRows: Row[] = [];
  const reader = (zk: string) => (zk === "atex_metal" ? "BADGE-ATEX" : zk === "cleanroom" ? "BADGE-SB" : zk === "gantry_bay" || zk === "assembly_line" || zk === "hangar_quality" ? "BADGE-HGR" : "BADGE-ACC");
  const absentToday = new Set(["Romain", "Mathis"]); // congé / déplacement
  const onBreak = new Set(["Yanis", "Ambre"]);
  for (const e of employees) {
    if (absentToday.has(e.first_name as string)) continue;
    const zk = zones.find((z) => z.id === e.home_zone_id)!.key as string;
    // Démo jouable à toute heure : avant l'ouverture, l'équipe est « arrivée » il y a quelques minutes.
    let arrive = at(0, 7, int(20, 75));
    if (arrive > now) arrive = new Date(now.getTime() - int(3, 40) * 60_000);
    badgeRows.push({ org_id, employee_id: e.id, kind: "in", reader: reader(zk), at: iso(arrive) });
    if (onBreak.has(e.first_name as string)) {
      const b = new Date(Math.max(arrive.getTime() + 60_000, now.getTime() - 8 * 60_000));
      badgeRows.push({ org_id, employee_id: e.id, kind: "break_start", reader: "BADGE-ACC", at: iso(b) });
    }
  }
  await insert("badge_events", badgeRows);
  // Historique : journées complètes sur les 5 derniers jours ouvrés
  const history: Row[] = [];
  for (let d = -1; d >= -7; d--) {
    const wd = at(d, 12).getDay();
    if (wd === 0 || wd === 6) continue;
    for (const e of employees) {
      history.push(
        { org_id, employee_id: e.id, kind: "in", reader: "BADGE-ACC", at: iso(at(d, 7, int(20, 70))) },
        { org_id, employee_id: e.id, kind: "break_start", reader: "BADGE-ACC", at: iso(at(d, 12, int(0, 20))) },
        { org_id, employee_id: e.id, kind: "break_end", reader: "BADGE-ACC", at: iso(at(d, 12, int(45, 59))) },
        { org_id, employee_id: e.id, kind: "out", reader: "BADGE-ACC", at: iso(at(d, 16, int(30, 90))) },
      );
      // Oubli de pointage de sortie à corriger (tuile RH « oublis de pointage »)
      if (e.first_name === "Hugo" && history.length && d === -1) history.pop();
    }
  }
  await insert("badge_events", history);

  const room = asset("SALLE-GAR").id;
  await insert("calendar_events", [
    { org_id, owner_employee_id: emp("Karim").id, kind: "client", title: "Revue de conception avec Cargo Céleste", client_id: client("Cargo Céleste").id, starts_at: iso(at(0, 10)), ends_at: iso(at(0, 11, 30)), participants: [emp("Élise").id, emp("Inès").id], room_asset_id: room },
    { org_id, owner_employee_id: emp("Élise").id, kind: "client", title: "Revue de conception avec Cargo Céleste", client_id: client("Cargo Céleste").id, starts_at: iso(at(0, 10)), ends_at: iso(at(0, 11, 30)), participants: [emp("Karim").id], room_asset_id: room },
    { org_id, owner_employee_id: emp("Julien").id, kind: "meeting", title: "Point production quotidien", starts_at: iso(at(0, 8, 30)), ends_at: iso(at(0, 8, 50)), participants: employees.filter((e) => e.role_key === "operator").map((e) => e.id), room_asset_id: room },
    { org_id, owner_employee_id: emp("Claire").id, kind: "meeting", title: "Comité de direction", starts_at: iso(at(0, 14)), ends_at: iso(at(0, 15, 30)), participants: [emp("Julien").id, emp("Nadia").id, emp("Marc").id], room_asset_id: room },
    { org_id, owner_employee_id: emp("Mathis").id, kind: "travel", title: "Essais en vol — base d'Arcachon", starts_at: iso(at(0, 6)), ends_at: iso(at(0, 20)) },
    { org_id, owner_employee_id: emp("Pauline").id, kind: "client", title: "Visite Ortho3D Santé", client_id: client("Ortho3D Santé").id, starts_at: iso(at(0, 15)), ends_at: iso(at(0, 16, 30)) },
    { org_id, owner_employee_id: emp("Lucas").id, kind: "focus", title: "Optimisation topologique HV-2", starts_at: iso(at(0, 9)), ends_at: iso(at(0, 12)) },
    { org_id, asset_id: asset("FDM-05").id, kind: "maintenance", title: "Maintenance préventive FDM-05", starts_at: iso(at(0, 7)), ends_at: iso(at(0, 17)) },
  ]);
  await insert("leave_requests", [
    { org_id, employee_id: emp("Romain").id, kind: "paid", starts_on: day(-1), ends_on: day(3), days: 5, status: "approved", approver_id: emp("Julien").id },
    { org_id, employee_id: emp("Léa").id, kind: "paid", starts_on: day(14), ends_on: day(18), days: 5, status: "pending" },
    { org_id, employee_id: emp("Samir").id, kind: "rtt", starts_on: day(7), ends_on: day(7), days: 1, status: "pending" },
    { org_id, employee_id: emp("Pauline").id, kind: "training", starts_on: day(21), ends_on: day(22), days: 2, status: "approved", approver_id: emp("Claire").id },
  ]);

  // --- RH --------------------------------------------------------------
  const [jo1, jo2] = await insert("job_openings", [
    { org_id, title: "Opérateur·rice impression métal (ATEX)", department: "Production", status: "open", description: "Conduite de machines SLM, manipulation de poudres sous ATEX." },
    { org_id, title: "Ingénieur·e certification aéro", department: "Ingénierie aéro", status: "open", description: "Dossiers EN 9100, relation avec les autorités de navigabilité." },
  ]);
  await insert("candidates", [
    { org_id, job_opening_id: jo1.id, full_name: "Alexis Navarro", email: "alexis.navarro@candidat.test", source: "Site carrières", score: "A", ai_summary: "5 ans en fabrication additive métal, habilitation ATEX à jour.", stage: "interview" },
    { org_id, job_opening_id: jo1.id, full_name: "Morgane Perrin", email: "morgane.perrin@candidat.test", source: "France Travail", score: "B", ai_summary: "Usinage CN, motivée pour se former au SLM.", stage: "screening" },
    { org_id, job_opening_id: jo2.id, full_name: "Victor Chambon", email: "victor.chambon@candidat.test", source: "Cooptation", score: "A", ai_summary: "Ingénieur structures, 3 certifications de type menées.", stage: "offer" },
    { org_id, job_opening_id: jo2.id, full_name: "Lina Barre", email: "lina.barre@candidat.test", source: "LinkedIn", score: "C", ai_summary: "Profil junior, peu d'expérience réglementaire.", stage: "new" },
  ]);
  await insert("reviews", [
    { org_id, employee_id: emp("Samir").id, reviewer_id: emp("Julien").id, review_date: day(-90), objectives: [{ label: "Taux de rebut < 2 %", done: true }], rating: 4 },
    { org_id, employee_id: emp("Tom").id, reviewer_id: emp("Julien").id, review_date: day(25), objectives: [{ label: "Qualification Inconel 718", done: false }] },
  ]);
  await insert("trainings", [
    { org_id, employee_id: emp("Tom").id, title: "Habilitation ATEX poudres métalliques", provider: "Organisme fictif", scheduled_on: day(-200), status: "done", expires_on: day(165) },
    { org_id, employee_id: emp("Manon").id, title: "Bonnes pratiques salle blanche ISO 7", provider: "Organisme fictif", scheduled_on: day(-30), status: "done", expires_on: day(335) },
    { org_id, employee_id: emp("Hugo").id, title: "Conduite portique grand format niveau 2", scheduled_on: day(10), status: "planned" },
    { org_id, employee_id: emp("Samir").id, title: "Sauveteur secouriste du travail (SST)", provider: "Organisme fictif", scheduled_on: day(-700), status: "done", expires_on: day(24) },
    { org_id, employee_id: emp("Chloé").id, title: "Habilitation produits chimiques (résines)", provider: "Organisme fictif", scheduled_on: day(-365), status: "done", expires_on: day(-2) },
  ]);
  await insert("onboarding_tasks", [
    { org_id, employee_id: emp("Bastien").id, title: "Remise du badge et des EPI", due_on: day(-10), done: true },
    { org_id, employee_id: emp("Bastien").id, title: "Formation sécurité site", due_on: day(-8), done: true },
    { org_id, employee_id: emp("Bastien").id, title: "Accès au logiciel de gestion", due_on: day(2), done: false },
  ]);
  // Notes de frais : conformes, hors plafond, kilométriques, et une dépense refacturable sur un dossier.
  const expensePolicy = cfg.expenses;
  const ex = (category: string, ttc: number) => {
    const cat = expensePolicy.categories.find((x) => x.id === category)!;
    return Math.round((ttc - ttc / (1 + cat.vatRate)) * 100) / 100;
  };
  const heliance = wos!.find((w) => (w.title as string).startsWith("Conduits de climatisation"))!;
  const receiptPath = `${org_id}/expense/${emp("Karim").id}/seed-billet-train.pdf`;
  const receipt = tinyPdf("Billet de train Bordeaux - Toulouse");
  const { error: rErr } = await db.storage.from("documents").upload(receiptPath, receipt, { contentType: "application/pdf", upsert: true });
  if (rErr) throw new Error(`storage : ${rErr.message}`);
  await insert("expenses", [
    { org_id, employee_id: emp("Karim").id, label: "Train Bordeaux – Toulouse — Héliance Aéro", amount: 98.6, vat_amount: ex("transport", 98.6), spent_on: day(-6), category: "transport", status: "pending", receipt_path: receiptPath, receipt_name: "billet-train.pdf", work_order_id: heliance.id, billable: true },
    { org_id, employee_id: emp("Mathis").id, label: "Hôtel Arcachon — essais en vol", amount: 142, vat_amount: ex("lodging", 142), spent_on: day(-1), category: "lodging", status: "pending", comment: "Essais décalés au lendemain" },
    { org_id, employee_id: emp("Antoine").id, label: "Dîner équipe essais soufflerie", amount: 46.5, vat_amount: ex("meal", 46.5), spent_on: day(-3), category: "meal", status: "pending" },
    { org_id, employee_id: emp("Tom").id, label: "Aller-retour fournisseur poudre (Pessac)", amount: Math.round(84 * expensePolicy.mileageRatePerKm * 100) / 100, km: 84, vat_amount: 0, spent_on: day(-2), category: "mileage", status: "pending" },
    { org_id, employee_id: emp("Pauline").id, label: "Repas client Ortho3D", amount: 74.5, vat_amount: ex("client_meal", 74.5), spent_on: day(-9), category: "client_meal", status: "approved", approver_id: emp("Marc").id, decided_at: iso(at(-7, 10)) },
    { org_id, employee_id: emp("Karim").id, label: "Taxi aéroport — visite Héliance Aéro", amount: 38, vat_amount: ex("transport", 38), spent_on: day(-12), category: "transport", status: "approved", approver_id: emp("Marc").id, decided_at: iso(at(-10, 10)), work_order_id: heliance.id, billable: true },
    { org_id, employee_id: emp("Julien").id, label: "Péage A63 — livraison urgente", amount: 12.4, vat_amount: ex("parking", 12.4), spent_on: day(-40), category: "parking", status: "reimbursed", approver_id: emp("Marc").id, decided_at: iso(at(-38, 10)), reimbursed_at: iso(at(-31, 10)) },
  ]);

  // --- flux d'activité (historique récent) ------------------------------
  const ev = (type: string, minutesAgo: number, entity_type: string, entity_id: string, payload: object) => ({
    org_id, type, entity_type, entity_id, payload, actor: null, at: iso(new Date(now.getTime() - minutesAgo * 60_000)),
  });
  const w = (i: number) => wos![i];
  await insert("activity_events", [
    ev("badge.in", 190, "employee", emp("Julien").id, { personne: "Julien Ferrand", name: "Julien Ferrand" }),
    ev("work_order.stage", 150, "work_order", w(2).id, { number: w(2).number, to: "quality" }),
    ev("asset.maintenance", 140, "asset", asset("FDM-05").id, { code: "FDM-05", machine: "FDM-05" }),
    ev("stock.low", 120, "stock_item", stock.find((s) => s.sku === "POW-ALSI")!.id, { sku: "POW-ALSI", label: "Poudre AlSi10Mg", matiere: "Poudre AlSi10Mg" }),
    ev("work_order.created", 95, "work_order", w(9).id, { number: w(9).number, client: "Clinique des Lauriers (fictive)" }),
    ev("quote.accepted", 70, "quote", w(3).quote_id, { client: "Orbitale Lancements", numero: "DEV-" + year + "-0004" }),
    ev("work_order.qc", 45, "work_order", w(13).id, { number: w(13).number, of: w(13).number, result: "rejeté", reason: "Écart de planéité 0,3 mm" }),
    ev("work_order.stage.printing_done", 20, "work_order", w(10).id, { number: w(10).number, machine: "FDM-01", piece: w(10).title, asset_id: asset("FDM-01").id }),
    ev("stock.low", 10, "stock_item", stock.find((s) => s.sku === "RES-BIO")!.id, { sku: "RES-BIO", label: "Résine biocompatible", matiere: "Résine biocompatible classe IIa" }),
  ]);
  const { data: profiles } = await db.from("profiles").select("user_id").eq("org_id", org_id);
  await insert(
    "notifications",
    profiles!.flatMap((pr) => [
      { org_id, user_id: pr.user_id, title: "Stock bas : résine biocompatible", body: "4 L restants (minimum 6 L).", link: "/resources/stock" },
      { org_id, user_id: pr.user_id, title: "OF urgent à expédier aujourd'hui", body: "Hydravion HV-1 — essais de largage.", link: "/ops/work-orders" },
    ]),
  );
  const { data: karimProfile } = await db.from("profiles").select("user_id").eq("org_id", org_id).eq("employee_id", emp("Karim").id).maybeSingle();
  if (karimProfile)
    await insert("notifications", [{ org_id, user_id: karimProfile.user_id, title: `${person("Nadia")} vous a écrit`, body: `${soufflerieWo.number} — écart de cote au contrôle`, link: `/comms/threads/${intTh.id}` }]);

  // --- journal d'audit : l'import ci-dessus n'est pas une action d'utilisateur, on repart d'un
  // journal vide, puis quelques vraies actions faites avec les comptes de démo (auteur réel, RLS appliquée).
  await db.from("audit_log").delete().eq("org_id", org_id);
  const asUser = async (login: string) => {
    const u = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await u.auth.signInWithPassword({ email: demoEmail(login), password: DEMO_PASSWORD });
    if (error) throw new Error(`connexion ${login} : ${error.message}`);
    return u;
  };
  const karim = await asUser("commercial");
  await karim.from("deals").update({ next_step: "Relancer pour les fichiers CAO", next_step_on: day(1) }).eq("org_id", org_id).eq("title", "Brûleurs de turbine — série 2");
  const marc = await asUser("compta");
  await marc.from("invoices").update({ notes: "Relance téléphonique faite : règlement annoncé sous 8 jours." }).eq("org_id", org_id).eq("client_id", client("Soufflerie Atlantique").id).eq("status", "overdue");
  const julien = await asUser("production");
  await julien.from("work_orders").update({ priority: "urgent" }).eq("org_id", org_id).eq("id", soufflerieWo.id);

  console.log(`✔ Données de démo créées pour « ${c.name} » (org ${org_id})`);
  console.log(`  ${employees.length} employés · ${assets.length} ressources · ${clients.length} clients · ${wos!.length} OF · ${invSeq} factures`);
  console.log(`  Comptes de démo (mot de passe : ${DEMO_PASSWORD}) :`);
  for (const a of accounts) console.log(`   - ${a.email.padEnd(32)} ${a.role}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
