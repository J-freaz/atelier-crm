# Atelier CRM
CRM multimarque en français. Interface statique compatible GitHub Pages, données privées dans un projet Supabase dédié.

## État au 5 octobre 2026
Interface publiée. Base privée Nanayé dédiée installée ; tests SQL multimarques et d'attribution des accès réussis. Les données commerciales sont uniquement dans la base, jamais dans ce dépôt.

Connexion Google intégrée avec le SDK officiel Supabase 2.117.2, flux PKCE. **Connexions réelles Jefferson et Lyne observées le 6 octobre 2026 ; non retestées lors de la préparation du 15 octobre.** Le bouton reste désactivé tant que `googleEnabled` vaut false. La démonstration reste fictive et temporaire.

## Fonctions
- Marques distinctes, propriétaires, éditeurs et lecteurs. Vue personnelle par responsable, vue équipe.
- Contacts, opportunités en colonnes, tâches avec échéance, commandes et encaissements déclarés, catalogue.
- Notes partagées, rattachement au contact, archives/restauration, import tabulé prévisualisé avec doublons, export CSV.
- Historique automatique côté base, version de fiche pour prévenir les écrasements concurrents.
- Brouillons manuels, aucune automatisation d'envoi, exclusion « Ne plus contacter ».

## Activation
1. Créer un projet Supabase distinct après accord sur organisation/coût. Appliquer les scripts `database/001_crm.sql`, `002_brand_privileges.sql`, puis `003_reserved_access.sql` dans cet ordre.
2. Configurer le fournisseur Google, son client OAuth web et les adresses de retour exactes. Ne pas demander de permissions Gmail/Drive : identité, adresse e-mail et profil suffisent. Garder le secret OAuth exclusivement dans Supabase.
3. Réserver les accès dans `crm_private.reserved_access` (jamais dans le code public). Ils sont attribués à la première connexion avec une adresse vérifiée, une seule fois. Jefferson : owner ; Lyne : editor Nanayé. Une révocation ne peut pas être annulée par une nouvelle connexion.
4. Renseigner uniquement l'URL du projet et sa clé **publishable** dans `config.mjs`. Jamais de clé service_role ni de mot de passe. L'autorisation dépend de RLS, pas du secret de la clé publique.
5. Réaliser la recette `docs/RECETTE.md` avec plusieurs comptes avant d'importer des données réelles.
6. Activer GitHub Pages sur la branche main, racine. Le dossier `work/crm-private` du projet de travail ne doit jamais être publié.

## Tests locaux
`node --test tests/*.test.mjs`
`python3 -m http.server 8765` puis http://localhost:8765

## Limites explicites
- Les sessions sont en mémoire et renouvelées par le SDK pendant la visite. Une reconnexion Google est requise au rechargement. Seul le vérificateur PKCE temporaire utilise sessionStorage pendant la redirection. Aucun jeton de session dans localStorage.
- Pas de modification/invitation des membres via l'interface : administration réservée au gestionnaire de la base.
- Actualisation manuelle des changements de l'équipe ; contrôle de version lors d'une sauvegarde.
- Notes de marque partagées entre ses membres, aucun coffre privé individuel.
- Suivi commercial ; pas de facture légale, synchronisation bancaire, calcul de TVA, stock transactionnel ni automatisation e-mail.
- Sauvegardes/restauration de la base à configurer et tester selon le plan retenu avant exploitation durable. Les exports CSV sont des extractions, pas une sauvegarde complète.
- Dépôt public : ne pas joindre fichiers clients, exports, captures privées ou secrets aux commits/issues.

## Préparation locale du 15 octobre 2026 — brouillons enregistrés

Déploiement autorisé le 15 octobre 2026. Migration appliquée via l’éditeur SQL du projet Nanayé (connecteur indisponible), puis recette transactionnelle distante annulée : sauvegarde, attribution, audit et conflit vérifiés. RLS active, accès anonyme et suppression interdits. `savedDraftsEnabled` activé pour publication. La migration exécutée dans l’éditeur ne crée pas automatiquement une entrée dans l’historique CLI.

- Un brouillon par contact : destinataire, objet, texte et signature ; seule la dernière version est conservée.
- Auteur réel et date imposés côté base ; trace dans l’historique du contact, explicitement sans envoi.
- Contrôle des modifications concurrentes, droits de marque et exclusion des contacts archivés / « Ne plus contacter ».
- Une signature sélectionnée n’autorise pas un envoi depuis cette personne. Gmail n’est pas raccordé.
- La délégation Gmail déclarée par Jefferson ne constitue pas une autorisation OAuth pour le CRM.

Vérifications : 27 tests JavaScript réussis ; enregistrement puis fermeture/réouverture vérifiés dans le navigateur en démonstration. Migration exécutée avec PGlite 0.5.9 en local, auth.uid simulé : création, auteur, version, accès lecteur/extérieur, opt-out et suppression interdite vérifiés. Cela ne remplace pas la recette Supabase distante.

Après accord explicite de publication : appliquer la migration `supabase/migrations/20261015103321_saved_message_drafts.sql` uniquement au projet Nanayé `qoaqzztwkhjvzfyeommm`, vérifier les droits sur le service réel, puis activer le drapeau et publier les fichiers frontend, dont `message-drafts.mjs`. En cas d’échec, laisser le drapeau désactivé. Ne publier aucun fichier de `work/crm-private`.

La connexion Gmail (envoi manuel validé, réponses et pièces jointes) reste une étape séparée, nécessitant le consentement Google de la boîte commerciale et une gestion serveur des jetons.
