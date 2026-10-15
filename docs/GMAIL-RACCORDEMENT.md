# Raccordement Gmail — préparation du 15 octobre 2026

## État au déploiement du 15 octobre 2026

- Boîte cible : commercial.nanaye@gmail.com ; les comptes CRM personnels restent indépendants.
- Migration Gmail et fonction `gmail-connect` déployées sur le projet Nanayé, après accord explicite. Le consentement réel reste à effectuer et vérifier.
- 36 tests JavaScript réussis et contrôles SQL locaux : droits, appartenance, rôle administrateur, état à usage unique, métadonnées seules.
- Le connecteur de gestion Supabase refuse l'accès ; déploiement effectué via la session administrateur du tableau de bord. La migration exécutée dans l'éditeur SQL n'est pas inscrite dans l'historique CLI.
- La fonction propose uniquement `status`, `start` et `finish`. Aucun envoi, aucune récupération de messages, aucune tâche récurrente n'est implémenté.
- Les utilisateurs de test Google incluent la boîte commerciale. La validité du couple ID/secret, Gmail API et l'adresse de retour restent à confirmer par le parcours réel.

## Parcours cible

1. Un administrateur Nanayé lance la connexion depuis sa session CRM personnelle.
2. Le serveur crée un état OAuth aléatoire, à usage unique, valable 10 minutes, lié à l’administrateur et à la marque. Le vérificateur PKCE reste côté serveur.
3. Google demande le consentement de commercial.nanaye@gmail.com. Le CRM refuse les comptes personnels et toute autre marque.
4. Le retour OAuth échange le code côté serveur ; l’état est consommé atomiquement et les droits du membre sont revérifiés. Seul le jeton de renouvellement chiffré est conservé dans un schéma privé ; aucun jeton dans le dépôt, les logs ou le navigateur.
5. La fiche affiche la boîte connectée. Chaque envoi nécessite une prévisualisation et un clic explicite ; l’auteur CRM est enregistré indépendamment de la signature et du responsable du contact.
6. Les réponses sont rapprochées des fils effectivement suivis, à la demande. Aucune tâche récurrente sans accord. Le scope Gmail readonly permet techniquement la lecture de toute la boîte commerciale : le filtrage applicatif ne réduit pas cette permission Google.

## Configuration et exploitation

- Vérifier Gmail API dans le projet nanaye-crm, son audience et les utilisateurs de test.
- Créer de préférence un client OAuth Web dédié à la messagerie afin de conserver le client de connexion CRM inchangé.
- URI de retour prévue : https://j-freaz.github.io/atelier-crm/gmail-callback.html (page à publier avant autorisation).
- Scopes : gmail.send et gmail.readonly, sans modification/suppression des messages. La lecture est un scope restreint : vérifier les obligations Google et les éventuelles exceptions applicables à cet usage privé avant généralisation.
- Le mode test Google peut imposer une durée limitée aux jetons de renouvellement ; ne pas promettre une connexion permanente sans vérifier l’audience.
- Secrets serveur nécessaires : NANAYE_GMAIL_CLIENT_ID et NANAYE_GMAIL_CLIENT_SECRET, saisis directement dans Supabase. Adresse et marque sont verrouillées sur Nanayé.
- Chiffrement AES-GCM : clé dédiée optionnelle NANAYE_GMAIL_ENCRYPTION_KEY (64 caractères hexadécimaux) ; sinon clé dérivée côté serveur par HKDF-SHA256 du secret OAuth, avec contexte propre à cette marque. Toute rotation du secret OAuth ou changement de clé nécessite une reconnexion de la boîte.
- Pour révoquer l'autorisation : retirer l'accès de cette application dans les paramètres du compte Google commercial. Le CRM n'a pas encore de bouton de déconnexion ni de détection d'expiration ; le statut signale une autorisation enregistrée, pas sa validité permanente.
- Les étapes d'envoi et de synchronisation ci-dessous décrivent la cible future, pas des fonctions déjà disponibles.

## Critères de recette avant mise en service

- Session absente/expirée, rôle lecteur, mauvaise marque, mauvais compte Google, consentement partiel, code rejoué et état expiré refusés.
- Aucun secret/jeton accessible par les API publiques ou inscrit dans les logs.
- Désactivation et révocation documentées ; perte d’autorisation affichée clairement.
- Envoi idempotent : un délai réseau ne doit jamais entraîner un nouvel envoi automatique. État « résultat à vérifier » si le résultat Gmail est ambigu.
- Pièces jointes validées, taille plafonnée, contenu MIME testé, aucune injection d’en-têtes.
- Test réel uniquement vers une adresse approuvée, après validation explicite du contenu et de la pièce jointe.
- Synchronisation paginée et bornée, dédoublonnage par identifiant Gmail ; un message envoyé ne constitue pas une preuve de lecture ou de livraison.

Sources vérifiées :
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/guides/sync
- https://supabase.com/docs/guides/functions/auth-headers
