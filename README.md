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
| `app/` | Next.js 15 (App Router) : connexion, Map, back-office, paramètres |

## État d'avancement

- [x] Phase 0 — fiche secteur
- [x] Phase 1 — socle : Next.js 15, Supabase, schéma, authentification (mot de passe, lien magique, TOTP), rôles, données de démo
- [ ] Phase 2 — Map vivante 3D
- [ ] Phase 3 — back-office module par module
- [ ] Phase 4 — intégrations, IA, finitions, déploiement

**Mode simulé :** aucune intégration (Microsoft 365, Google Workspace, SSO, API Claude) n'est branchée.
Les boutons SSO sont affichés « Non configuré ».
