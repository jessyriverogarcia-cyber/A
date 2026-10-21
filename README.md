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
- [ ] Phase 3 — back-office module par module
  - [x] Commercial : à faire aujourd'hui, pipeline kanban, clients 360°, devis (éditeur, marge, PDF, envoi et relance pré-remplis, acceptation → OF)
  - [ ] Production · Finance · Ressources · RH · Communication · Pilotage
- [ ] Phase 4 — intégrations, IA, finitions, déploiement

**Mode simulé :** aucune intégration (Microsoft 365, Google Workspace, SSO, API Claude) n'est branchée.
Les boutons SSO sont affichés « Non configuré ».
