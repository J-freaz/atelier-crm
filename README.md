# Atelier CRM
CRM multimarque en français. Interface statique compatible GitHub Pages, données privées dans un projet Supabase dédié.

## État
Interface et démonstration fonctionnelles. **Base privée, comptes et contrôle des droits en production non activés tant que la configuration n'est pas renseignée et la recette d'accès terminée.** La démo contient uniquement des exemples fictifs, gardés en mémoire. Elle ne constitue pas une preuve d'authentification.

## Fonctions
- Marques distinctes, propriétaires, éditeurs et lecteurs. Vue personnelle par responsable, vue équipe.
- Contacts, opportunités en colonnes, tâches avec échéance, commandes et encaissements déclarés, catalogue.
- Notes partagées, rattachement au contact, archives/restauration, import tabulé prévisualisé avec doublons, export CSV.
- Historique automatique côté base, version de fiche pour prévenir les écrasements concurrents.
- Brouillons manuels, aucune automatisation d'envoi, exclusion « Ne plus contacter ».

## Activation
1. Créer un projet Supabase distinct après accord sur organisation/coût. Appliquer `database/001_crm.sql`.
2. Configurer Auth pour comptes individuels confirmés ; désactiver l'inscription publique. Créer les comptes via le tableau de bord. Les utilisateurs définissent eux-mêmes leurs mots de passe. Ne jamais les stocker dans ce dépôt.
3. Créer Nanayé et ses membres dans la base, en utilisant leurs vrais `auth.users.id`. Jefferson : owner. Lyne : rôle/accès explicitement validés. Aucun membre ajouté aux futures marques automatiquement.
4. Renseigner uniquement l'URL du projet et sa clé **publishable** dans `config.mjs`. Jamais de clé service_role ni de mot de passe. L'autorisation dépend de RLS, pas du secret de la clé publique.
5. Réaliser la recette `docs/RECETTE.md` avec plusieurs comptes avant d'importer des données réelles.
6. Activer GitHub Pages sur la branche main, racine. Le dossier `work/crm-private` du projet de travail ne doit jamais être publié.

## Tests locaux
`node --test tests/*.test.mjs`
`python3 -m http.server 8765` puis http://localhost:8765

## Limites explicites
- Les sessions sont en mémoire et expirent à l'échéance du jeton ; une reconnexion est requise au rechargement. Aucun secret persistant dans localStorage.
- Pas de modification/invitation des membres via l'interface : administration réservée au gestionnaire de la base.
- Actualisation manuelle des changements de l'équipe ; contrôle de version lors d'une sauvegarde.
- Notes de marque partagées entre ses membres, aucun coffre privé individuel.
- Suivi commercial ; pas de facture légale, synchronisation bancaire, calcul de TVA, stock transactionnel ni automatisation e-mail.
- Sauvegardes/restauration de la base à configurer et tester selon le plan retenu avant exploitation durable. Les exports CSV sont des extractions, pas une sauvegarde complète.
- Dépôt public : ne pas joindre fichiers clients, exports, captures privées ou secrets aux commits/issues.
