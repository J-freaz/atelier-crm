# Accès commercial restreint à Opéria

Migration appliquée le 16 novembre 2026, avec enregistrement de sa version dans l’historique Supabase. Elle ne crée elle-même aucun utilisateur, membre ou accès réservé. Les réservations nominatives restent des opérations privées, hors du dépôt public.

## Périmètre

Le nouveau rôle stocké est `commercial`. Il est accepté seulement pour une marque dont `profile = 'operia'`, dans les adhésions comme dans les réservations d’accès. Les rôles `owner`, `editor` et `viewer` existants gardent leurs droits ; aucune attribution ni donnée Nanayé n’est modifiée.

Le commercial ne voit que ses contacts et tâches actifs : `owner_id = auth.uid()`. La création d’une fiche sans responsable l’attribue au compte connecté ; choisir un autre responsable est refusé. Une fiche non attribuée, attribuée à quelqu’un d’autre, archivée, située dans une autre marque ou d’un autre type est inaccessible. Créer une fiche ne conserve aucun accès si le propriétaire la réattribue ensuite.

Une tâche liée à un contact est visible seulement si ce contact est lui aussi actif et attribué au commercial. Les événements et les brouillons suivent ce même périmètre. La liste des membres ne renvoie au commercial que sa propre adhésion.

## Droits appliqués dans la base

| Opération | Commercial |
|---|---|
| Créer individuellement un contact Opéria ou une tâche | Oui, attribué à soi |
| Modifier coordonnées, qualification, besoin, relance, échéance | Oui, sur une fiche accessible |
| Changer le nom d’une tâche et son avancement | Oui |
| Changer le nom ou le SIREN d’une entreprise existante | Non |
| Réattribuer un dossier, changer sa source d’origine ou son lien existant | Non |
| Modifier l’apporteur, les montants, encaissements, quantités ou données de reprise | Non |
| Réécrire des notes ou activités existantes | Non ; ajout uniquement |
| Ajouter un compte rendu non financier | Oui ; aucune activité « Paiement reçu » ni montant |
| Marquer un dossier gagné ou le déclasser après validation | Non |
| Enregistrer une opposition | Oui, y compris pour un client gagné ; pas de suppression de l’opposition |
| Ajouter une activité après opposition | Note uniquement |
| Archiver, restaurer ou supprimer une fiche | Non |
| Préparer et enregistrer un brouillon | Oui, pour un prospect accessible, non opposé, non perdu/gagné et non cessé |
| Utiliser la pièce jointe EVJF de Nanayé | Non |
| Gérer les membres, les marques ou leur profil | Non |
| Accéder à la messagerie Gmail Nanayé ou à son analyse de site | Non |

Sur une fiche gagnée par un rôle autorisé, le commercial peut continuer le suivi non financier, en conservant l’étape et les montants validés. Il peut toujours enregistrer une opposition. Les anciens rôles `owner` et `editor` restent habilités à enregistrer un gain ; cette migration ne réduit pas les droits des éditeurs existants.

Un SIREN manquant à la création devra être complété par un rôle habilité : l’identité de l’entreprise devient protégée dès le premier enregistrement. Une tâche peut être créée avec un contact lié accessible ou sans lien ; ce lien est ensuite protégé.

Les champs financiers restent lisibles lorsqu’ils appartiennent à une fiche accessible, mais sont protégés en écriture. La restriction des boutons d’export et d’import global relève également de l’interface. Aucun mécanisme ne peut empêcher la copie des données que le commercial est autorisé à consulter ; les règles de la base empêchent l’accès aux autres dossiers, pas la copie du portefeuille accessible.

## Mise en œuvre

Migration : `supabase/migrations/20261116144958_commercial_access.sql`, créée par la CLI Supabase. Ne pas modifier les migrations déjà appliquées. Vérifier l’état distant avant d’appliquer cette migration une seule fois, avec l’interface compatible.

- `crm_private.can_access(brand_id, write_access)` conserve son sens d’accès à toute une marque et exclut le rôle `commercial`. Les protections existantes de Gmail et de l’analyse Nanayé ne sont donc pas élargies.
- `crm_private.is_commercial(brand_id)` vérifie le rôle enregistré en base, le profil Opéria et `auth.uid()`.
- `crm_private.can_access_record(brand_id, record_id, write_access)` contrôle l’accès à la fiche ; événements et brouillons utilisent cette autorisation.
- Les politiques des fiches contrôlent la marque, le type, l’affectation et l’archivage. Une politique restrictive complète les politiques existantes.
- Des déclencheurs contrôlent les changements champ par champ, les ajouts à l’historique et les brouillons. Ces contrôles s’appliquent aussi aux appels directs de l’API.
- Les nouvelles fonctions privilégiées sont uniquement dans `crm_private`, avec `search_path = ''`, contrôle d’identité et autorisations explicites. Aucun rôle n’est lu dans `user_metadata`.
- Les brouillons conservent le contrôle de version, l’auteur réel et la colonne `attach_evjf` ajoutée en novembre. Aucun envoi d’email n’est ajouté.

## Réservations et connexion

Le mécanisme existant `crm_claim_access()` exige un email confirmé correspondant à une réservation non réclamée et non expirée. Il reste indépendant de la méthode de connexion. La réservation porte sur la marque Opéria et le rôle `commercial` ; aucune adresse réelle n’est inscrite dans les sources.

Le claim parcourt toutes les réservations valides de l’adresse. Avant l’activation, vérifier l’absence d’une autre adhésion ou réservation non souhaitée, puis contrôler le rôle effectivement créé. Une adhésion existante n’est pas remplacée par le claim. L’expiration de réservation n’est pas une expiration de l’adhésion après activation.

### Connexion par code e-mail, préparée mais désactivée

`config.emailOtpEnabled` reste à `false`. La connexion Google existante reste disponible. Le formulaire e-mail n’est pas affiché tant que son service d’envoi n’est pas opérationnel.

Le code utilise `signInWithOtp({options:{shouldCreateUser:false}})` puis `verifyOtp({type:'email'})`, avec le même client Supabase que le CRM. La session reste en mémoire. Le chargement du CRM n’est validé qu’après la réclamation de l’accès et la lecture des données ; un échec peut être réessayé sans consommer le code une seconde fois. Une réponse tardive ne remplace pas un écran quitté.

Avant activation :

1. Raccorder un fournisseur SMTP autorisé et un expéditeur vérifié dans Supabase Auth. Ne jamais placer les identifiants SMTP ou une clé privée dans ce dépôt.
2. Configurer les modèles Magic Link, Invite user et Confirm sign up pour afficher `{{ .Token }}`. Le projet a été contrôlé le 16 novembre 2026 : ses codes ont 8 chiffres et expirent après 3600 secondes. `emailOtpLength` est aligné à 8 ; ne pas réduire le réglage du fournisseur pour adapter le formulaire.
3. Provisionner le compte destinataire avec le mécanisme administrateur prévu et sa preuve de possession de l’adresse. La réservation d’un rôle ne crée pas ce compte.
4. Vérifier la réception réelle, les codes expirés/incorrects, la connexion, le rôle effectivement obtenu et l’absence d’autre marque accessible. Ne pas inviter un commercial dans l’organisation Supabase pour contourner les limites d’envoi.
5. Activer le formulaire, publier la configuration et attribuer les dossiers Opéria au compte commercial. Vérifier à nouveau la visibilité avec ce compte réel.

La préparation technique et les tests simulés ne constituent pas un test de délivrance. Références : [connexion sans mot de passe](https://supabase.com/docs/guides/auth/auth-email-passwordless), [configuration SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Le bouton « J’ai déjà un code » permet de saisir directement un code d’invitation reçu, sans déclencher un nouvel envoi. Il capture l’adresse et conserve les limites de tentative ; la vérification utilise le même client et `type: 'email'`. Le parcours d’invitation numérique reste à vérifier avec le fournisseur réel après activation SMTP. Éviter la redirection d’invitation implicite par défaut : le client actuel est configuré en PKCE. La confirmation de possession de l’adresse doit provenir de la vérification du code, pas d’une affirmation de réception par l’administrateur.

## Vérifications locales

`tests/commercial-migration-check.mjs` exécute 117 assertions dans PGlite, avec des identités fictives et sans connexion distante. Le schéma de départ inclut les migrations Gmail, brouillons et choix de pièce jointe existantes.

Les tests couvrent les créations et modifications autorisées, les accès refusés, la réattribution avec masquage immédiat des fiches/brouillons/événements, les tâches liées hors portefeuille, les champs financiers et d’identité, les notes et activités immuables, les oppositions, la pièce jointe, les réservations expirées ou non confirmées, les tentatives de promotion de rôle et les droits Nanayé inchangés. Le compte commercial ne peut appeler les fonctions Gmail, même via leur point d’entrée serveur contrôlant l’appartenance Nanayé.

PGlite simule `auth.uid()` : ces résultats ne prouvent ni la délivrance d’un email de connexion, ni une connexion réelle du collaborateur, ni l’application de la migration en production. Après déploiement, contrôler les permissions avec le compte réel et vérifier les empreintes des données Nanayé et Opéria avant/après.

Références : [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [politiques PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
