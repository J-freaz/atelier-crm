# Recette avant activation commerciale
## Vérifications locales
Les tests de domaine couvrent montant français, arrondis, doublons, filtres, neutralisation CSV/HTML, encaissements, archive, concurrence, création de marque. Ils ne prouvent pas RLS.

## Base dédiée — obligatoire avant données réelles
Créer quatre comptes test : A propriétaire marque 1, B éditeur marque 1, C lecteur marque 1, D propriétaire marque 2. Utiliser leurs vrais JWT via API REST dans un environnement de test, sans les enregistrer dans des fichiers.
- Sans JWT : aucune donnée consultable ou modifiable.
- A/B peuvent lire et écrire marque 1 ; ne peuvent lire/écrire marque 2, y compris avec UUID connu.
- C peut lire marque 1 mais pas écrire, créer de marque ou modifier les membres.
- D ne voit aucune ligne, membre ou événement marque 1.
- Réaffecter un dossier à une autre marque doit échouer.
- Lier un contact ou responsable d'une autre marque doit échouer (clés étrangères composées).
- Écrire directement dans l'historique ou s'attribuer owner doit échouer.
- Révoquer B dans crm_members : son JWT encore valide ne doit plus donner accès.
- Deux mises à jour version N : une réussit, l'autre retourne zéro ligne et affiche conflit.
- Une nouvelle marque n'enrôle que son créateur.
- Une erreur réseau n'affiche pas de succès et ne ferme pas la fiche.
- Archiver puis restaurer un contact doit préserver son historique.
- Contrôler les advisors Supabase puis réaliser une sauvegarde/restauration sur un projet test.

## Utilisateurs
Vérifier connexion, déconnexion, expiration, absence de données au retour après déconnexion, écran mobile, import/doublons, exports et statut Ne plus contacter.

Recette SQL effectuée le 5 octobre 2026 sur le projet Nanayé dédié : `tests/rls.sql` et `tests/reserved-access.sql` réussis, transactions annulées après validation. Appel HTTP anonyme à crm_records : refus 401. Première connexion Google réelle et sauvegarde/restauration restent à valider.

## Attribution et préparation des messages — 6 octobre 2026
- Attribution directe depuis Contacts, enregistrée avec contrôle de version ; membres de la marque uniquement.
- Préparer un message utilise le responsable comme signature par défaut ; signature modifiable.
- Enregistrer la fiche avant de préparer le message si des champs ont changé.
- Analyse manuelle, au plus 4 pages publiques et extraits sourcés datés. 10 scans / heure / utilisateur / marque, 40 / jour / marque. Les échecs comptent.
- Rédaction structurée, sans modèle IA, sans clé tierce. Pas de promesse commerciale ou prix ajouté automatiquement.
- Aucun envoi, aucun changement de statut, aucun stockage du brouillon après fermeture.
- Respect de robots.txt ; sites bloqués, pages volumineuses, PDF ou contenu chargé uniquement par JavaScript peuvent rester non analysables.
- Fonction privée : session vérifiée, RLS, rôle éditeur et contact actif. URL issue de la fiche autorisée, pas d’URL libre dans la requête. DNS IPv4 public validé puis connexion épinglée, redirections vérifiées et limitées au domaine/www.
- Coût : utilisation des quotas d’Edge Functions Supabase existants ; pas de service IA payant ni de collecte programmée.
