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

Statut initial : recette distante EN ATTENTE de projet dédié et de comptes validés.
