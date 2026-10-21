# Strato Fab — Map vivante + CRM/ERP

Application de démonstration pour un atelier de fabrication additive B2B (aéro, spatial, médical) :
une **Map vivante** 3D des locaux reliée à un **back-office CRM/ERP/RH** sur la même base de données.
Toutes les données sont fictives. Le secteur est piloté par `config/sector.config.ts`.

## Démarrage local

Prérequis : Node 22, pnpm, Docker.

```bash
pnpm install
pnpm db:start      # Supabase local (Postgres, Auth, Realtime, Storage) + écrit .env.local
pnpm db:reset      # applique les migrations puis génère les données de démo
pnpm dev           # http://localhost:3000
```

Connexion : boutons « Comptes de démonstration » de la page de connexion (un par rôle),
ou `direction@strato-fab.test` / `StratoFab-demo-2026`. Les e-mails (liens magiques) arrivent
dans Mailpit : http://127.0.0.1:54324. Studio Supabase : http://127.0.0.1:54323.

## Vérifications

```bash
pnpm typecheck && pnpm lint && pnpm test   # types, lint, tests unitaires du domaine
pnpm build && pnpm test:e2e                # parcours Playwright (connexion, RLS, temps réel)
```

## Map vivante (`/map/campus`, `/map/aero_hangar`)

Vue aérienne 3D (Three.js / React Three Fiber, géométries procédurales) branchée sur les mêmes tables
que le back-office. Rien n'y est codé en dur : zones, mobilier (par type de zone), machines, stock,
personnes et appareils viennent de la base et de la fiche secteur.

- **Navigation** : glisser pour déplacer, clic droit pour pivoter, molette pour zoomer, Échap pour fermer.
- **Clic** sur une machine, un rayonnage, une personne, un appareil ou une étiquette de zone : fiche
  résumée + bouton « Ouvrir dans le back-office » (lien profond, pages livrées en phase 3).
- **Temps réel** : abonnement Supabase Realtime (`activity_events`, `work_orders`, `assets`,
  `stock_items`, `badge_events`, `map_objects`). Toute écriture, d'où qu'elle vienne, s'anime sur la map.
- **Scénario live** (barre du bas) : les 8 événements de la fiche écrivent de vraies lignes en base
  (OF, machines, stock, badges, devis) — un à un ou en séquence avec « Lancer le scénario ».
- **Mode édition du plan** (direction, responsable production) : glisser-déposer, R pour pivoter,
  enregistrement dans `map_objects`.
- **Qualité** : « Cinéma » (ombres, bloom, vignettage) ou « Rapide » ; compteur d'images/s dans la barre ;
  bascule automatique en « Rapide » sous 30 i/s pendant 5 s. `?q=cinema` impose la qualité maximale
  (tournage de démo), `?q=rapide` la qualité légère.

## Back-office — Commercial (`/crm`)

- **À faire aujourd'hui** : devis à relancer (7 j sans réponse, 3 relances max), prochaines étapes dues,
  devis qui expirent, brouillons ; indicateurs (pipeline pondéré, devis en attente, transformation, signé du mois).
- **Pipeline** : kanban par étapes de la fiche secteur, glisser-déposer ou sélecteur, mise à jour en direct.
- **Clients** : liste filtrable, fiche 360° (contacts, affaires, devis, dossiers, factures, échanges, notes).
- **Devis** : lignes du catalogue, remises, coût interne et marge en direct, totaux recalculés côté serveur,
  PDF (`/crm/quotes/[id]/pdf`), envoi et relance en un clic avec e-mail pré-rempli (**simulé** tant qu'aucune
  messagerie n'est connectée : la copie est rangée dans l'historique du client).
- **Zéro double saisie** : « Accepté par le client » appelle la fonction SQL `accept_quote` — devis accepté,
  affaire gagnée, ordre de fabrication créé à la 1re étape sur le bon site, événement visible sur la Map.
  Le scénario « Devis signé » de la Map passe par le même chemin.

## Back-office — Production (`/ops`)

- **À faire aujourd'hui** : dossiers en retard, contrôle qualité en attente, machines arrêtées, dossiers à lancer
  en impression, à expédier, échéances proches, budgets d'heures dépassés (alerte à 80 %).
- **Ordres de fabrication** : tableau par étape (fiche secteur) ou liste, filtres site / famille / statut.
- **Fiche dossier** : étapes avec règle du domaine (pas de saut, retour arrière possible), choix de la machine au
  passage en impression (la machine passe « en production », libérée à la sortie), contrôle qualité réservé au droit
  « approve » (rejet → reprise en post-traitement), expédition (camion, jet ou hydravion sur la Map), heures
  (un opérateur saisit les siennes), tâches, checklist, traçabilité (lot matière, norme, n° de série), historique.
- **Planning machines** : réservations sur 7 jours, charge par machine, arrêts et maintenances prévues.
- Toutes les actions écrivent un `activity_event` : la Map s'anime en direct. Le scénario de démo utilise le même
  service (`lib/services/ops.ts`).

## Back-office — Finance (`/finance`)

- **À faire aujourd'hui** : retards à relancer (niveau proposé selon le retard : rappel, relance ferme, mise en
  demeure), dossiers livrés à facturer, brouillons, échéances sous 7 jours ; facturé du mois, reste à encaisser,
  retards, délai moyen de paiement.
- **Zéro double saisie** : « Facturer le dossier » (fiche OF ou tuile) reprend les lignes du devis et déduit les
  acomptes déjà facturés ; « % Acompte » facture un pourcentage du devis ; un dossier sans devis facture ses heures.
- **Facture** : brouillon modifiable, puis émise et figée (correction par **avoir**), envoi par e-mail pré-rempli
  (simulé), PDF avec mentions légales (pénalités, indemnité de 40 €, IBAN), paiements partiels ou complets — le
  statut et le montant payé sont recalculés en base (trigger), passage automatique « en retard ».
- **Trésorerie** : prévisionnel 6 mois (prévisions + factures à encaisser), graphique entrées / sorties, cumul.
- Rôles : Comptabilité et Direction écrivent ; Commercial lit ; Opérateur n'a pas accès.

## Back-office — Ressources & stock (`/resources`)

- **À faire aujourd'hui** : articles sous le minimum pas encore commandés (cochés, « Commander la sélection »),
  commandes à réceptionner, maintenances dues ou en retard, pannes et bons à envoyer.
- **Réassort en un clic** : quantité calculée (double du minimum ou délai fournisseur × consommation des 30 derniers
  jours + 50 %, au conditionnement), un bon par fournisseur, pas de doublon si l'article est déjà en commande.
- **Commandes fournisseurs** : brouillon ajustable, envoi par e-mail pré-rempli (simulé, demande de certificats
  matière), réception en un clic via la fonction SQL `receive_purchase_order` (stock incrémenté, mouvements tracés,
  rayonnages de la Map remplis en direct).
- **Stock** : jauges, filtres, fiche article (consommation moyenne, jours de couverture, mouvements, sortie liée à un
  dossier, inventaire) ; le passage sous le minimum déclenche l'alerte live.
- **Équipements** : état (panne, remise en service, maintenance) synchronisé avec la Map, maintenance préventive
  (périodicité par machine, « effectuée aujourd'hui », planification ajoutée au planning).

## Back-office — RH (`/hr`) et Mon espace (`/me`)

- **Mon espace** (tous les rôles) : badgeuse virtuelle (même effet que la badgeuse : la Map réagit), heures de la
  semaine, solde de congés (25 j ouvrés/an, période au 1er juin, prorata temps partiel), demande de congé avec calcul
  automatique des jours ouvrés (week-ends et 11 jours fériés français exclus).
- **À faire aujourd'hui** : congés à valider en un clic, oublis de pointage, habilitations qui expirent (60 j),
  candidatures à traiter, tâches d'intégration en retard ; présents, pauses, congés, absents.
- **Présences** : grille hebdomadaire calculée depuis les badges (pauses déduites), écart au contrat, correction des
  oublis tracée, export CSV (Excel FR).
- **Congés** : validation en un clic, alerte de chevauchement dans le service.
- **Équipe** : fiche (heures badgées vs heures saisies sur dossiers, congés, formations, entretiens, intégration) ;
  rémunération visible uniquement par la direction et les RH (RLS).
- **Recrutement** : postes, kanban des candidats (score, résumé).
- **Variables de paie** : base mensuelle, heures, heures sup., absences par type ; export CSV pour le cabinet.
  Le bulletin (cotisations, net) reste produit par le logiciel de paie.

## Back-office — Communication (`/comms`) et notifications

- **Boîte de réception unifiée** : tous les fils (clients, fournisseurs, notes internes) rangés par interlocuteur et
  par dossier ; filtres « à répondre », « brouillons à relire », « mes échanges », recherche.
- **Brouillons préparés** : à l'arrivée d'un message, une réponse est rédigée à partir du dossier lié (étape et
  échéance de l'OF, solde de la facture, état du devis). On relit, on envoie en un clic. Règles explicites
  (`lib/domain/replies.ts`) en attendant l'assistant IA de la phase 4.
- **Fil** : historique, panneau dossier (client, OF, facture, devis), responsable du fil, pièces jointes du dossier,
  « classer sans réponse ». En mode simulé, « Simuler une réponse de l'interlocuteur » fait arriver un message
  (la Map l'affiche, le responsable est notifié).
- **Notes internes** à un collègue sur un dossier : notification au destinataire, puis à l'auteur quand il répond.
- **Documents** : dépôt dans un stockage privé (dossier par organisation, RLS du bucket), rattachés à un client, un
  dossier ou un fournisseur, versions, téléchargement par lien signé de 60 s ; devis et factures PDF générés à la demande.
- **Notifications** (cloche, tous les rôles) : messages internes, échanges confiés, décisions de congé.

L'envoi d'e-mails est **simulé** (badge « envoi simulé ») : le message est rangé dans le fil, rien ne part.

## Tableau de bord (`/dashboard`) et Pilotage (`/pilotage`)

- **Ma journée** (tous les rôles) : file « à faire aujourd'hui » limitée aux modules du rôle (messages à répondre,
  devis à relancer, dossiers en retard, factures échues, stock bas, congés à valider…), mes tâches, notifications.
- **Tableau de bord direction** : décisions à prendre triées par gravité (factures échues, pannes, retards,
  dépassements d'heures, habilitations expirées), CA facturé 12 mois, encours et délai de paiement, trésorerie
  prévisionnelle, pipeline pondéré, carnet de commandes, transformation et marge des devis, production, stock, équipe.
  Tout est calculé à la volée (`lib/domain/pilotage.ts`, testé) ; chaque section n'apparaît que si le rôle lit le module.
- **Journal d'audit** : écrit par des triggers PostgreSQL sur les tables sensibles (factures, paiements, devis,
  affaires, dossiers, congés, pointages, salaires, droits, comptes…), avec auteur, date et avant → après ;
  filtres, historique d'une fiche, export CSV. La RLS ne montre que les tables des modules lisibles par le rôle
  (la production ne voit pas l'historique des factures, les salaires restent réservés).

La **page technique** (`/settings/tech`) montre la session, la matrice de droits du rôle,
le nombre de lignes visibles par table (RLS) et le flux `activity_events` en temps réel.

## Architecture

| Dossier | Rôle |
| --- | --- |
| `config/` | Fiche secteur typée et validée par Zod |
| `supabase/migrations/` | Schéma (45 tables), RLS par organisation × module × action, audit, Realtime |
| `scripts/seed.ts` | Données de démo générées depuis la fiche secteur |
| `lib/domain/` | Logique pure testée : TVA et arrondis, devis et marge, étapes d'OF, budget d'heures, présence |
| `lib/supabase/`, `lib/auth.ts` | Clients Supabase (navigateur, serveur, middleware), contexte utilisateur |
| `components/map/` | Scène 3D : kits procéduraux (imprimantes, portiques, avions, mobilier), personnes, effets, HUD |
| `lib/map/` | Données de la map : chargement, état (Zustand), disposition, temps réel, moteur du scénario |
| `app/` | Next.js 15 (App Router) : connexion, Map, back-office, paramètres |

## État d'avancement

- [x] Phase 0 — fiche secteur
- [x] Phase 1 — socle : Next.js 15, Supabase, schéma, authentification (mot de passe, lien magique, TOTP), rôles, données de démo
- [x] Phase 2 — Map vivante 3D : 2 sites, objets cliquables, fiches, animations, temps réel, scénario live, mode édition
- [x] Phase 3 — back-office module par module
  - [x] Commercial : à faire aujourd'hui, pipeline kanban, clients 360°, devis (éditeur, marge, PDF, envoi et relance pré-remplis, acceptation → OF)
  - [x] Production : à faire aujourd'hui, tableau des OF par étape, fiche dossier (étapes, CQ, heures, tâches, checklist, traçabilité), planning machines
  - [x] Finance : à faire aujourd'hui, factures (depuis le dossier, acompte, avoir), envoi, paiements, relances graduées, PDF, trésorerie
  - [x] Ressources & stock : à faire aujourd'hui, stock et mouvements, réassort en un clic, commandes fournisseurs (envoi, réception), équipements et maintenance
  - [x] RH : mon espace (badgeuse, heures, congés), à faire aujourd'hui, équipe, présences, congés, recrutement, variables de paie
  - [x] Communication : boîte de réception unifiée, brouillons préparés, notes internes, documents, notifications
  - [x] Pilotage : ma journée, tableau de bord direction, journal d'audit
- [ ] Phase 4 — intégrations, IA, finitions, déploiement

**Mode simulé :** aucune intégration (Microsoft 365, Google Workspace, SSO, API Claude) n'est branchée.
Les boutons SSO sont affichés « Non configuré ».
