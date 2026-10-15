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

## Livraison du 6 octobre 2026 — plaquette et suivi du contact
- Commit publié : cfacb1e4fd40d783036bf2929e6b27901e7e5400.
- Option de lien vers la plaquette EVJF, désactivée par défaut ; PDF à joindre manuellement. Document limité à l’identité de la marque Nanayé (et sa démonstration), jamais choisi par simple homonymie.
- Fiche contact : dossiers liés, y compris archivés, et 50 derniers événements du contact et de ses dossiers liés. Filtrage par marque et identifiants.
- La copie n’est pas un envoi. Aucune intégration mail ni récupération des réponses ajoutée.
- Vérification : 20 tests réussis ; attribution à Lyne puis historique de modification Jefferson vérifiés en démonstration locale ; inclusion de la plaquette vérifiée sur GitHub Pages.


## Brouillons — vérification locale du 15 octobre 2026

Résultat : 27 tests JS réussis, migration testée dans PGlite (auth simulée), restauration du brouillon et trace dans la fiche vérifiées par navigateur. Pas de déploiement distant.

Avant activation : appliquer la migration après accord ; vérifier avec les comptes réels éditeur/lecteur/hors marque, deux sauvegardes concurrentes, expiration de session, contact exclu et désactivation du drapeau. L’enregistrement d’un brouillon ne doit jamais afficher « envoyé » ni passer le contact en « contacté ».
