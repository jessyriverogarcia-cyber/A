# Recette finale — état réel

Légende : ✅ fait et testé · 🟡 fait, non vérifiable ici (compte réel nécessaire) ou partiel · ⛔ non fait.
La section 11 du prompt maître étant tronquée, cette liste reprend les exigences des sections 1 à 5.

## Principes

| Exigence | État | Preuve |
| --- | --- | --- |
| Tout piloté par la fiche secteur (Zod) | ✅ | `config/sector.config.ts`, `pnpm check:config` ; libellés, étapes, rôles, événements, KPI, sites lus depuis la fiche |
| Honnêteté : simulé = affiché comme tel | ✅ | badges « envoi simulé », « mode simulé — aucune IA », page Intégrations calculée sur l'état réel |
| Données de démo fictives | ✅ | `scripts/seed.ts` (domaines `.test`, entreprises inventées) |
| Actions en un clic pré-remplies | ✅ | relances devis/factures, réassort, réponses préparées, propositions de tâche de l'assistant |
| Le système pousse à agir | ✅ | « À faire aujourd'hui » par module, « Ma journée », décisions à prendre, notifications quotidiennes |
| Zéro double saisie | ✅ | devis → OF → heures → facture ; badge → présence → variables de paie ; PDF recalculés |

## Map vivante 3D

| Exigence | État | Remarque |
| --- | --- | --- |
| 2 sites, bâtiments, zones intérieures/extérieures, machines, avions | ✅ | kits procéduraux |
| Objets cliquables, fiches, liens profonds vers le back-office (et retour) | ✅ | e2e phase 2 |
| 8 événements live animés, temps réel bidirectionnel | ✅ | Realtime + scénario (démo uniquement) |
| Mode édition du plan | ✅ | glisser / pivoter / enregistrer, droit `map:update` |
| 60 fps | 🟡 | qualité adaptative et fusion des maillages ; mesuré seulement en WebGL logiciel (SwiftShader), non représentatif d'un vrai GPU |

## Back-office

| Module | État | Manques connus |
| --- | --- | --- |
| Commercial | ✅ | — |
| Production | ✅ | — |
| Finance | ✅ / 🟡 | Factur-X : XML CII profil EN 16931 généré, **validé contre le XSD officiel**, joint au PDF (relation « Alternative », métadonnées fx). Non faits : certification PDF/A-3 du PDF, règles Schematron (moteur XSLT 2.0 absent ici), transmission par une plateforme agréée (PDP) exigée par la réforme |
| Ressources & stock | ✅ | fournisseurs (fiche, taux de service, archivage) et réception partielle faits |
| RH et Mon espace | ✅ | RTT (horaire au-delà de 35 h, forfait jours) avec solde et contrôle des demandes |
| Notes de frais | ✅ | saisie (montant ou km, justificatif photo/PDF), politique de frais (plafonds, TVA, ancienneté), validation en lot, paie, refacturation au client |
| Communication | ✅ | réception des e-mails entrants depuis Outlook/Gmail ⛔ (seul l'envoi est branché) |
| Pilotage, journal d'audit | ✅ | — |
| Assistant IA | ✅ / 🟡 | boucle vérifiée contre une fausse API ; pas d'appel réel faute de clé dans cet environnement |

## Intégrations

| Intégration | État | Remarque |
| --- | --- | --- |
| Envoi d'e-mails Microsoft 365 / Gmail | 🟡 | OAuth + PKCE, jetons chiffrés, Graph `sendMail` / Gmail `send` testés avec un `fetch` simulé ; aucun locataire réel testé |
| Agendas Outlook / Google | ⛔ | portées demandées, synchronisation non implémentée |
| SSO (connexion Microsoft / Google) | ⛔ | boutons affichés « Non configuré » ; à activer dans Supabase Auth |
| Assistant Claude | 🟡 | actif dès que `ANTHROPIC_API_KEY` est défini |
| Traitements planifiés (pg_cron) | ✅ | e2e : exécution manuelle et dédoublonnage |

## Sécurité

| Exigence | État |
| --- | --- |
| RLS par organisation × module × action, évaluée une fois par requête | ✅ |
| Salaires visibles uniquement direction / RH, y compris dans l'audit et l'assistant | ✅ |
| Journal d'audit par triggers, lecture limitée aux modules lisibles | ✅ |
| Double authentification TOTP | ✅ |
| Stockage privé par organisation, liens signés de 60 s | ✅ |
| En-têtes de sécurité (CSP, HSTS, frame-ancestors) | ✅ |
| Scénario de démo et clé service désactivés hors mode démo | ✅ |

## Tests

- Unitaires : `pnpm test` (domaine, assistant IA, intégrations).
- Bout en bout : `pnpm test:e2e` (Playwright, une base de démo réinitialisée par fichier).
- Captures : `docs/screens/`.
