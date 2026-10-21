# Mise en production

L'application est un projet Next.js 15 (Node 20+) adossé à Supabase (Postgres, Auth, Realtime,
Storage, pg_cron). Recommandation : **Vercel** pour l'application, **Supabase Cloud en région UE**
pour les données (RGPD : données hébergées dans l'Union européenne).

## 1. Supabase

1. Créer le projet (région `eu-central-1` Francfort ou `eu-west-3` Paris), noter l'URL, la clé `anon` et la clé `service_role`.
2. Appliquer le schéma depuis le dépôt :
   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push        # applique supabase/migrations/* dans l'ordre
   ```
   Les migrations créent les tables, la RLS, le bucket privé `documents`, la publication Realtime
   et la tâche pg_cron quotidienne (`daily-jobs`, 4 h UTC). Si `pg_cron` n'est pas activée sur le
   projet : Dashboard › Database › Extensions › pg_cron, puis relancer `db push`.
3. Authentification (Dashboard › Authentication) :
   - **Site URL** : l'URL publique, par ex. `https://gestion.entreprise.fr` ;
   - **Redirect URLs** : `https://gestion.entreprise.fr/auth/callback` ;
   - **SMTP** : un fournisseur d'e-mails transactionnels (liens de connexion, invitations) ;
   - **MFA** : TOTP activé (les utilisateurs l'activent dans « Sécurité du compte ») ;
   - désactiver l'inscription libre (*Allow new users to sign up* : off) — les comptes sont créés par invitation.

## 2. Variables d'environnement

Voir `.env.example`. En production :

| Variable | Valeur |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur uniquement (scripts de mise en service) |
| `NEXT_PUBLIC_SITE_URL` | URL publique, sans `/` final |
| `NEXT_PUBLIC_DEMO_MODE` | **`false`** — masque les comptes de démo, désactive le scénario live et la sonde de test |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | assistant IA (vide : mode simulé annoncé) |
| `INTEGRATIONS_SECRET` | 32 caractères minimum (`openssl rand -base64 48`) — chiffre les jetons OAuth |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` | Microsoft 365 (facultatif) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Workspace (facultatif) |

Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INTEGRATIONS_SECRET` ni les
secrets OAuth au navigateur (aucune n'a le préfixe `NEXT_PUBLIC_`).

## 3. Application (Vercel)

1. Importer le dépôt, framework détecté : Next.js. Commande de build : `pnpm build`.
2. Renseigner les variables ci-dessus (environnement *Production*).
3. Région des fonctions : `fra1` (Francfort), au plus près de la base.
4. Domaine personnalisé, puis mettre à jour `NEXT_PUBLIC_SITE_URL` et les URL de redirection Supabase.

L'assistant IA diffuse ses réponses en continu (route `/ai/chat`, `maxDuration` 300 s) : vérifier
que l'offre Vercel autorise cette durée. Les en-têtes de sécurité (CSP, HSTS, `frame-ancestors 'none'`…)
sont définis dans `next.config.ts`.

## 4. Mise en service de l'organisation

Sur un poste disposant de `.env.local` pointant vers la production :

```bash
pnpm bootstrap -- --email prenom.nom@entreprise.fr --first Prénom --last Nom
```

Crée l'organisation, les rôles et droits, les sites et zones de la fiche secteur (`config/sector.config.ts`),
puis invite le premier compte **direction** par e-mail. Aucune donnée de démonstration n'est créée.
Ensuite, dans l'application :

1. activer la double authentification (Sécurité du compte) ;
2. ajuster le plan des bâtiments (Map › Modifier le plan) et placer les équipements ;
3. connecter la boîte d'envoi (Paramètres › Intégrations) : les envois deviennent réels ;
4. inviter l'équipe et attribuer les rôles.

> `pnpm db:seed` est réservé à l'environnement de démonstration : il **supprime et recrée** l'organisation de démo.

## 5. Intégrations messagerie

**Microsoft 365** — Entra ID › Inscriptions d'applications › Nouvelle inscription :
- type de compte : celui de l'organisation (ou multilocataire) ;
- URI de redirection (Web) : `<NEXT_PUBLIC_SITE_URL>/settings/integrations/microsoft/callback` ;
- autorisations déléguées Microsoft Graph : `User.Read`, `Mail.Send`, `Calendars.ReadWrite`, `offline_access` ;
- un secret client → `MS_CLIENT_SECRET`, l'ID d'application → `MS_CLIENT_ID`, l'ID de locataire → `MS_TENANT_ID`.

**Google Workspace** — Google Cloud Console › API et services :
- activer l'API Gmail et l'API Google Calendar ;
- écran de consentement (interne à l'organisation Workspace) ;
- identifiant OAuth « Application Web », URI de redirection : `<NEXT_PUBLIC_SITE_URL>/settings/integrations/google/callback`.

Puis, connecté en direction : Paramètres › Intégrations › Connecter. Les jetons sont chiffrés
(AES-256-GCM) avec `INTEGRATIONS_SECRET` avant d'être stockés ; changer cette clé impose de reconnecter la boîte.

## 6. Exploitation

- **Sauvegardes** : sauvegardes quotidiennes Supabase (PITR selon l'offre). Le bucket `documents` est inclus dans le projet.
- **Traitements quotidiens** : historique dans Paramètres › Page technique (« Traitements planifiés »), lancement manuel possible.
- **Journal d'audit** : Pilotage › Journal d'audit (factures, paiements, devis, salaires, droits, comptes…), export CSV.
- **Mises à jour du schéma** : nouvelles migrations dans `supabase/migrations/`, puis `supabase db push`.
- **Vérifications avant mise en ligne** : `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, puis `pnpm test:e2e` sur une base de démo.
