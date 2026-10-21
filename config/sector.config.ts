import { validateSectorConfig, type SectorConfigInput } from "./sector.schema";

/**
 * Fiche secteur — Strato Fab (entreprise fictive de démonstration).
 * Pour changer de secteur, remplacer ce fichier : aucun composant ne code ces valeurs en dur.
 */
const input: SectorConfigInput = {
  company: {
    name: "Strato Fab",
    sector: "Fabrication additive industrielle B2B — aéronautique, spatial, médical",
    city: "Bordeaux",
    country: "FR",
    timezone: "Europe/Paris",
    coordinates: { lat: 44.84, lon: -0.58 },
    locale: "fr-FR",
    currency: "EUR",
    vatRate: 0.2,
    rounding: 0.01,
    logo: { kind: "monogram", value: "SF" },
    accentColor: "#FF6B2C", // orange « laser », sur fond graphite et bleu nuit
    ambiance: "Industriel propre / high-tech — béton clair, acier brossé, lueurs laser et UV, eau de la Garonne",
    legal: {
      address: "12 rue des Fictions, 33000 Bordeaux",
      registration: "SAS au capital de 250 000 € · RCS Bordeaux 000 000 000 (fictif)",
      vatNumber: "FR00 000000000",
      siren: "000000000",
      email: "contact@strato-fab.test",
      phone: "+33 5 00 00 00 00",
      iban: "FR76 0000 0000 0000 0000 0000 000",
      paymentNotes: {
        discount: "Pas d'escompte pour paiement anticipé.",
        latePenalty: "En cas de retard : pénalités au taux d'intérêt de la BCE majoré de 10 points (art. L441-10 du Code de commerce).",
        recoveryFee: "Indemnité forfaitaire pour frais de recouvrement en cas de retard : 40 €.",
      },
      invoicingMode: "M1", // pièces fabriquées et prestations (mixte)
    },
  },

  sites: [
    {
      id: "campus",
      label: "Campus de production",
      shape: "multi_building",
      description:
        "Halle de production en L (parc polymère + aile bureaux), bunker métal ATEX détaché, " +
        "reliés par une cour et un quai de réception/expédition.",
      zones: [
        { id: "print_floor", label: "Atelier d'impression", type: "production", capacity: 24 },
        { id: "post_processing", label: "Post-traitement", type: "post_processing", capacity: 6 },
        { id: "materials", label: "Magasin matières", type: "storage" },
        { id: "cad_office", label: "Bureau CAO", type: "office", capacity: 6 },
        { id: "quality_lab", label: "Salle de contrôle qualité", type: "quality", capacity: 4 },
        { id: "reception", label: "Accueil", type: "reception" },
        { id: "offices", label: "Bureaux", type: "office", capacity: 10 },
        { id: "meeting_room", label: "Salle de réunion", type: "meeting", capacity: 10 },
        { id: "break_room", label: "Espace pause", type: "break", capacity: 8 },
        { id: "shipping", label: "Zone d'expédition", type: "shipping" },
        { id: "cleanroom", label: "Salle blanche (médical)", type: "cleanroom", capacity: 3, restricted: true },
        { id: "atex_metal", label: "Zone métal ATEX", type: "restricted", capacity: 3, restricted: true },
      ],
      outdoor: [
        { id: "parking", label: "Parking", type: "parking" },
        { id: "dock", label: "Quai réception / expédition", type: "dock" },
      ],
    },
    {
      id: "aero_hangar",
      label: "Hangar aéro & bord de Garonne",
      shape: "asymmetric",
      description:
        "Hangar géant avec portique d'impression grand format et ligne d'assemblage, " +
        "tarmac et piste courte pour les jets, cale de mise à l'eau sur un bras de Garonne pour l'hydravion.",
      zones: [
        { id: "gantry_bay", label: "Baie portique grand format", type: "hangar" },
        { id: "assembly_line", label: "Ligne d'assemblage", type: "hangar" },
        { id: "model_shop", label: "Atelier maquettes soufflerie", type: "production", capacity: 4 },
        { id: "hangar_quality", label: "Contrôle CND / métrologie", type: "quality", capacity: 3 },
      ],
      outdoor: [
        { id: "tarmac", label: "Tarmac & piste", type: "runway" },
        { id: "slipway", label: "Cale de mise à l'eau (Garonne)", type: "water" },
      ],
    },
  ],

  workOrder: {
    label: "Ordre de fabrication",
    labelPlural: "Ordres de fabrication",
    shortCode: "OF",
    physicalObject: "Pièce, sous-ensemble ou appareil imprimé, avec dossier de traçabilité",
    stages: [
      { id: "intake", label: "Réception devis / CAO", zoneId: "cad_office", color: "#64748B" },
      { id: "feasibility", label: "Validation technique", zoneId: "cad_office", color: "#6366F1" },
      { id: "slicing", label: "Slicing / programmation", zoneId: "cad_office", color: "#0EA5E9" },
      { id: "printing", label: "Impression", zoneId: "print_floor", color: "#FF6B2C" },
      { id: "post_processing", label: "Post-traitement", zoneId: "post_processing", color: "#F59E0B" },
      { id: "quality", label: "Contrôle qualité", zoneId: "quality_lab", color: "#10B981" },
      { id: "shipping", label: "Expédition", zoneId: "shipping", color: "#14B8A6" },
    ],
  },

  crm: {
    pipelineStages: [
      { id: "lead", label: "Prospect", probability: 0.1, color: "#64748B" },
      { id: "qualified", label: "Qualification", probability: 0.25, color: "#6366F1" },
      { id: "proposal", label: "Proposition", probability: 0.5, color: "#0EA5E9" },
      { id: "negotiation", label: "Négociation", probability: 0.75, color: "#F59E0B" },
      { id: "won", label: "Gagné", probability: 1, color: "#10B981", outcome: "won" },
      { id: "lost", label: "Perdu", probability: 0, color: "#EF4444", outcome: "lost" },
    ],
    quotePrefix: "DEV",
    invoicePrefix: "FAC",
    quoteValidityDays: 30,
    paymentTermsDays: 30, // délai légal par défaut en France (LME : 60 j max)
    defaultHourlyRate: 110,
  },

  technologies: [
    { id: "fdm", label: "FDM (filament)", kit: "printer_fdm", zoneId: "print_floor", animation: "tête qui va et vient, pièce qui monte couche par couche" },
    { id: "sla", label: "SLA / DLP (résine)", kit: "printer_sla", zoneId: "print_floor", animation: "plateau qui remonte de la cuve, lueur UV" },
    { id: "sls", label: "SLS (poudre polymère)", kit: "printer_sls", zoneId: "print_floor", animation: "hublot chauffant, racleur de poudre" },
    { id: "metal", label: "Métal SLM / DMLS", kit: "printer_metal", zoneId: "atex_metal", animation: "spot laser au hublot, gaz inerte" },
    { id: "gantry", label: "Portique grand format (structures aéro)", kit: "gantry_printer", zoneId: "gantry_bay", animation: "portique qui glisse, tronçon de fuselage qui grandit" },
  ],

  productFamilies: [
    { id: "industrial_parts", label: "Pièces industrielles", description: "Prototypes et pièces de série polymère", technologies: ["fdm", "sla", "sls"] },
    { id: "medical", label: "Dispositifs médicaux", description: "Guides chirurgicaux, implants (salle blanche)", technologies: ["sla", "metal"] },
    { id: "aero_parts", label: "Pièces moteur & cabine", description: "Pièces métal et polymère certifiées aéro", technologies: ["metal", "sls"] },
    { id: "wind_tunnel_models", label: "Maquettes de soufflerie", description: "Maquettes à échelle réduite des appareils", technologies: ["sla", "fdm", "metal"] },
    { id: "oblique_wing_supersonic", label: "Supersonique à aile oblique", description: "Tronçons ou appareil complet — versions jet privé, ligne commerciale, cargo", technologies: ["gantry", "metal"] },
    { id: "flying_wing_seaplane", label: "Hydravion aile volante porte-fusées", description: "Transporte une ou plusieurs fusées sur le dos selon leur taille et leur masse", technologies: ["gantry", "metal"] },
  ],

  clickables: [
    { id: "people", label: "Personnes", entityType: "employee", examples: ["opérateur machines", "technicien post-traitement", "responsable qualité", "commercial", "responsable production", "ingénieur aéro"] },
    { id: "printers", label: "Imprimantes et portiques", entityType: "asset", examples: ["FDM", "SLA", "SLS", "métal", "portique grand format"] },
    { id: "workstations", label: "Postes", entityType: "asset", examples: ["poste CAO", "poste de contrôle qualité", "tomographe CND"] },
    { id: "stock", label: "Stock", entityType: "stock_item", examples: ["filaments", "résines", "poudres métalliques", "pièces finies en attente"] },
    { id: "parts_in_progress", label: "Pièces et appareils en cours", entityType: "work_order", examples: ["tronçon de fuselage", "hydravion sur la cale", "jet sur le tarmac"] },
    { id: "secure_areas", label: "Zones sécurisées", entityType: "zone", examples: ["salle blanche", "armoire poudres ATEX"] },
    { id: "badge_reader", label: "Badgeuse", entityType: "badge_reader" },
    { id: "rooms", label: "Salles", entityType: "room", examples: ["salle de réunion"] },
  ],

  kpis: [
    { id: "machines_active", label: "Machines actives / taux d'utilisation", unit: "percent", good: 75, warn: 50 },
    { id: "orders_in_progress", label: "Ordres de fabrication en cours", unit: "count" },
    { id: "on_time_rate", label: "Délais respectés", unit: "percent", good: 95, warn: 85 },
    { id: "revenue_today", label: "CA du jour", unit: "currency", optional: true },
  ],

  liveEvents: [
    { id: "new_order", label: "Nouvelle commande reçue", activityType: "work_order.created", mapEffect: "colis de données qui file vers le bureau CAO", notification: "Nouvelle commande de {client}" },
    { id: "print_done", label: "Fin d'impression", activityType: "work_order.stage.printing_done", mapEffect: "la machine s'éteint, la pièce brille, un opérateur vient la retirer", notification: "{piece} prête sur {machine}" },
    { id: "qc_result", label: "Contrôle qualité validé / rejeté", activityType: "work_order.qc", mapEffect: "halo vert ou rouge sur le poste qualité", notification: "CQ {result} pour {of}" },
    { id: "shipment_left", label: "Expédition partie", activityType: "shipment.departed", mapEffect: "camion transporteur qui quitte le quai — ou hydravion qui décolle de la Garonne", notification: "{of} expédié à {client}" },
    { id: "low_stock", label: "Alerte stock matière basse", activityType: "stock.low", mapEffect: "rayonnage qui clignote en orange", notification: "Stock bas : {matiere}" },
    { id: "machine_down", label: "Panne / maintenance", activityType: "asset.down", mapEffect: "machine en rouge, technicien qui s'y rend", notification: "{machine} en panne" },
    { id: "badge_in", label: "Badge d'arrivée", activityType: "badge.in", mapEffect: "opérateur qui entre, badge et rejoint son poste", notification: "{personne} est arrivé·e" },
    { id: "quote_signed", label: "Devis signé", activityType: "quote.accepted", mapEffect: "confettis discrets au bureau commercial, nouvel OF créé", notification: "Devis {numero} signé par {client}" },
  ],

  modulesPriority: ["crm", "ops", "finance", "resources", "hr", "comms", "ai", "pilotage"],

  integrations: { microsoft365: false, googleWorkspace: false, mode: "simulated" },

  roles: [
    { id: "direction", label: "Direction", description: "Accès complet", canSeeSalaries: true },
    { id: "production_manager", label: "Responsable production", description: "Planning, ordres de fabrication, machines" },
    { id: "operator", label: "Opérateur", description: "Ses tâches, ses badges, ses heures" },
    { id: "quality", label: "Qualité", description: "Contrôles, non-conformités, traçabilité" },
    { id: "aero_engineer", label: "Ingénieur aéro / certification", description: "Traçabilité EN 9100, dossiers de navigabilité" },
    { id: "sales", label: "Commercial", description: "Clients, pipeline, devis" },
    { id: "hr", label: "RH", description: "Employés, présences, congés, recrutement, salaires", canSeeSalaries: true },
    { id: "accounting", label: "Comptabilité", description: "Factures, relances, trésorerie" },
    { id: "read_only", label: "Lecture seule", description: "Consultation sans modification", readOnly: true },
  ],

  payroll: {
    monthsMode: "per_contract",
    collectiveAgreement: "Métallurgie (IDCC 3248)",
    // Accord d'entreprise fictif : 39 h en atelier (RTT en heures), forfait 218 jours pour les cadres.
    rtt: { referenceWeeklyHours: 35, workedWeeksPerYear: 47, forfaitDays: 218, paidLeaveDays: 25 },
  },

  hud: { layout: "hybrid" },

  // Politique de frais (fictive) : plafonds internes, TVA courante, barème kilométrique.
  expenses: {
    categories: [
      { id: "transport", label: "Train, avion, taxi", vatRate: 0.1, vatRecoverable: true },
      { id: "mileage", label: "Indemnités kilométriques", vatRate: 0, vatRecoverable: false, mileage: true },
      { id: "meal", label: "Repas", vatRate: 0.1, vatRecoverable: true, ceiling: 30 },
      { id: "client_meal", label: "Repas client", vatRate: 0.1, vatRecoverable: true, ceiling: 80 },
      { id: "lodging", label: "Hébergement", vatRate: 0.1, vatRecoverable: false, ceiling: 160 },
      { id: "supplies", label: "Fournitures et petit matériel", vatRate: 0.2, vatRecoverable: true },
      { id: "parking", label: "Parking et péages", vatRate: 0.2, vatRecoverable: true },
      { id: "other", label: "Autre", vatRate: 0.2, vatRecoverable: true },
    ],
    mileageRatePerKm: 0.636,
    mileageRateLabel: "barème fiscal, véhicule 5 CV, jusqu'à 5 000 km par an",
    receiptRequiredAbove: 0,
    maxAgeDays: 90,
    reimbursement: "payroll",
  },
};

export const sectorConfig = validateSectorConfig(input);
export default sectorConfig;
