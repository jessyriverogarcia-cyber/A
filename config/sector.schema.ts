import { z } from "zod";

/**
 * Schéma de la fiche secteur.
 * Toute la Map vivante et le back-office lisent leur vocabulaire, leurs zones,
 * leurs étapes et leurs KPI depuis une configuration conforme à ce schéma.
 */

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "identifiant en snake_case attendu");

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "couleur hexadécimale #RRGGBB attendue");

export const RoleSchema = z.object({
  id,
  label: z.string().min(1),
  description: z.string().min(1),
  /** Accès aux salaires (table employee_salaries). */
  canSeeSalaries: z.boolean().default(false),
  readOnly: z.boolean().default(false),
});

export const ZoneSchema = z.object({
  id,
  label: z.string().min(1),
  type: z.enum([
    "production",
    "post_processing",
    "storage",
    "office",
    "reception",
    "quality",
    "shipping",
    "cleanroom",
    "restricted",
    "meeting",
    "break",
    "hangar",
    "outdoor",
    "parking",
    "dock",
    "runway",
    "water",
  ]),
  capacity: z.number().int().positive().optional(),
  /** Badge d'accès requis (salle blanche, ATEX). */
  restricted: z.boolean().default(false),
});

export const SiteSchema = z.object({
  id,
  label: z.string().min(1),
  shape: z.enum(["rectangular", "l_shape", "asymmetric", "multi_building"]),
  description: z.string().min(1),
  zones: z.array(ZoneSchema).min(1),
  outdoor: z.array(ZoneSchema).default([]),
});

export const StageSchema = z.object({
  id,
  label: z.string().min(1),
  /** Zone où l'objet physique se trouve pendant cette étape (pour la Map). */
  zoneId: id.optional(),
  color: hexColor,
});

export const ProductFamilySchema = z.object({
  id,
  label: z.string().min(1),
  description: z.string().min(1),
  /** Technologies de fabrication utilisables pour cette famille. */
  technologies: z.array(id).min(1),
});

export const TechnologySchema = z.object({
  id,
  label: z.string().min(1),
  kit: z.string().min(1), // identifiant du modèle procédural dans /components/map
  zoneId: id,
  animation: z.string().min(1),
});

export const ClickableKindSchema = z.object({
  id,
  label: z.string().min(1),
  entityType: z.enum(["employee", "asset", "stock_item", "work_order", "zone", "badge_reader", "room"]),
  examples: z.array(z.string()).default([]),
});

export const KpiSchema = z.object({
  id,
  label: z.string().min(1),
  unit: z.enum(["count", "percent", "currency", "ratio"]),
  /** Seuils pour la couleur du badge (vert ≥ good, orange ≥ warn, sinon rouge). */
  good: z.number().optional(),
  warn: z.number().optional(),
  optional: z.boolean().default(false),
});

export const LiveEventSchema = z.object({
  id,
  label: z.string().min(1),
  activityType: z.string().min(1), // valeur de activity_events.type
  mapEffect: z.string().min(1),
  notification: z.string().min(1),
});

export const SectorConfigSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    sector: z.string().min(1),
    city: z.string().min(1),
    country: z.string().length(2),
    timezone: z.string().min(1),
    locale: z.enum(["fr-FR", "fr-CH", "de-CH", "it-CH", "en-GB"]),
    currency: z.string().length(3),
    vatRate: z.number().min(0).max(1),
    /** Pas d'arrondi en unité monétaire (0.01 = centime, 0.05 = 5 centimes). */
    rounding: z.number().positive(),
    logo: z.object({ kind: z.enum(["monogram", "file"]), value: z.string().min(1) }),
    accentColor: hexColor,
    ambiance: z.string().min(1),
    /** Mentions légales imprimées sur les devis et factures (fictives en démo). */
    legal: z.object({
      address: z.string().min(1),
      registration: z.string().min(1),
      vatNumber: z.string().min(1),
      /** SIREN (9 chiffres) : identifiant légal du vendeur sur les factures électroniques. */
      siren: z.string().regex(/^\d{9}$/).optional(),
      email: z.string().email(),
      phone: z.string().min(1),
      iban: z.string().optional(),
    }),
  }),
  sites: z.array(SiteSchema).min(1).max(3),
  workOrder: z.object({
    label: z.string().min(1),
    labelPlural: z.string().min(1),
    shortCode: z.string().min(2).max(4),
    physicalObject: z.string().min(1),
    stages: z.array(StageSchema).min(5).max(7),
  }),
  crm: z.object({
    pipelineStages: z
      .array(
        z.object({
          id,
          label: z.string().min(1),
          probability: z.number().min(0).max(1),
          color: hexColor,
          outcome: z.enum(["open", "won", "lost"]).default("open"),
        }),
      )
      .min(3),
    quotePrefix: z.string().min(1),
    invoicePrefix: z.string().min(1),
    quoteValidityDays: z.number().int().positive(),
    paymentTermsDays: z.number().int().positive(),
    /** Taux horaire HT pour facturer les heures d'un dossier sans devis. */
    defaultHourlyRate: z.number().positive(),
  }),
  technologies: z.array(TechnologySchema).min(1),
  productFamilies: z.array(ProductFamilySchema).min(1),
  clickables: z.array(ClickableKindSchema).min(1),
  kpis: z.array(KpiSchema).min(3),
  liveEvents: z.array(LiveEventSchema).min(4),
  modulesPriority: z.array(
    z.enum(["crm", "ops", "finance", "hr", "resources", "comms", "ai", "pilotage"]),
  ),
  integrations: z.object({
    microsoft365: z.boolean(),
    googleWorkspace: z.boolean(),
    mode: z.enum(["simulated", "live"]),
  }),
  roles: z.array(RoleSchema).min(1),
  payroll: z.object({
    /** "per_contract" : 12 ou 13 mois choisi sur chaque contrat. */
    monthsMode: z.enum(["12", "13", "per_contract"]),
    collectiveAgreement: z.string().optional(),
    /** RTT : durée légale de référence, semaines travaillées par an, forfait jours des cadres. */
    rtt: z.object({
      referenceWeeklyHours: z.number().positive(),
      workedWeeksPerYear: z.number().positive(),
      forfaitDays: z.number().int().positive(),
      paidLeaveDays: z.number().int().positive(),
    }),
  }),
  hud: z.object({
    layout: z.enum(["A", "B", "hybrid"]),
  }),
  expenses: z.object({
    categories: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          /** Taux de TVA habituel (0 si aucune TVA, ex. péage étranger, indemnités kilométriques). */
          vatRate: z.number().min(0).max(0.3),
          /** TVA déductible pour l'entreprise (non pour l'hébergement des salariés, par exemple). */
          vatRecoverable: z.boolean(),
          /** Plafond de la politique de frais, par dépense (TTC). */
          ceiling: z.number().positive().optional(),
          /** Calcul au kilomètre plutôt qu'un montant saisi. */
          mileage: z.boolean().default(false),
        }),
      )
      .min(1),
    /** Barème kilométrique appliqué (€/km). */
    mileageRatePerKm: z.number().positive(),
    mileageRateLabel: z.string(),
    /** Justificatif obligatoire au-delà de ce montant TTC (0 : toujours). */
    receiptRequiredAbove: z.number().min(0),
    /** Délai maximal de remise d'une note (jours). */
    maxAgeDays: z.number().int().positive(),
    reimbursement: z.enum(["payroll", "transfer"]),
  }),
});

export type SectorConfig = z.infer<typeof SectorConfigSchema>;
export type SectorConfigInput = z.input<typeof SectorConfigSchema>;

/** Vérifie la cohérence interne (références de zones, technologies) en plus du schéma. */
export function validateSectorConfig(input: SectorConfigInput): SectorConfig {
  const config = SectorConfigSchema.parse(input);
  const zoneIds = new Set(config.sites.flatMap((s) => [...s.zones, ...s.outdoor].map((z) => z.id)));
  const techIds = new Set(config.technologies.map((t) => t.id));
  const errors: string[] = [];

  for (const stage of config.workOrder.stages) {
    if (stage.zoneId && !zoneIds.has(stage.zoneId)) errors.push(`étape ${stage.id} : zone inconnue ${stage.zoneId}`);
  }
  for (const tech of config.technologies) {
    if (!zoneIds.has(tech.zoneId)) errors.push(`technologie ${tech.id} : zone inconnue ${tech.zoneId}`);
  }
  for (const family of config.productFamilies) {
    for (const t of family.technologies) {
      if (!techIds.has(t)) errors.push(`famille ${family.id} : technologie inconnue ${t}`);
    }
  }
  const allIds = [
    ...zoneIds,
    ...config.workOrder.stages.map((s) => `stage:${s.id}`),
    ...config.roles.map((r) => `role:${r.id}`),
  ];
  if (new Set(allIds).size !== allIds.length) errors.push("identifiants en double");

  if (errors.length) throw new Error(`Configuration secteur invalide :\n- ${errors.join("\n- ")}`);
  return config;
}
