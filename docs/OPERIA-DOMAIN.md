# Profil Opéria — contrat de données

Mise à jour du 19 octobre 2026. Le schéma Opéria a été appliqué en production depuis l’éditeur SQL Supabase, après autorisation de publication. Les contrôles locaux et les vérifications de production sont distingués ci-dessous.

## Structure

`crm_brands.profile` vaut `general` par défaut ou `operia`. Les marques existantes et leurs montants TTC ne changent pas. Une entreprise Opéria est un `crm_records.kind = contact`, avec les informations dédiées dans `metadata.operia`.

Les montants natifs `amount_cents` et `paid_cents` restent les montants TTC du CRM général. Ils ne doivent pas recevoir les abonnements Opéria HT. Les indicateurs Opéria utilisent uniquement `monthlyHtCents` et les activités `amountHtCents`.

`emptyOperia()` fournit :

- `schemaVersion: 1`, `siren`, `creationDate`, `city`, `naf`, `employees` ;
- `registryStatus`, `registryDate`, `registrySource` ;
- `contactName`, `contactRole`, `contactSource`, `contactVerifiedAt` ;
- `businessEvidence`, `businessSource`, `businessDate`, `need` ;
- `fit: {sites, agents, organization, tool, pain, painConfirmed, budget, source, date, kind}` ;
- `stage`, `nextAction`, `due`, `monthlyHtCents` (entier centimes ou `null`), `originator` ;
- `legacy: {source, id, created, updated, exportedAt, stage}` ;
- `activities: [{id, kind, at, note, amountHtCents, source}]`.

Les dates de vérification sont celles des sources et ne sont jamais remplacées par la date de transfert. L’apporteur (`originator`) ne se déduit pas du responsable du dossier. Aucun taux de commission ni prix de catalogue par défaut n’est créé. Le logiciel déjà utilisé et l’intérêt restent inconnus tant qu’ils ne sont pas renseignés.

## Fonctions

- `normalizeOperia(value)` renvoie une copie normalisée ; `operiaOf(record)` lit les métadonnées. `validateOperia(value)` refuse les SIREN, dates et montants invalides pour l’écriture.
- `qualification(record, now)` renvoie quatre contrôles, leur complétude, l’exclusion éventuelle et `firstContactAllowed`. Une fiche incomplète peut servir à préparer un premier appel ; cette valeur ne constitue pas une autorisation d’envoi.
- `commercialPriority(record, now)` explique une priorité. Une création récente n’établit pas l’absence de logiciel ni le besoin.
- `fromLegacyLead(lead, {brandId, activities, sourceLabel, exportedAt})` convertit le format de l’ancien CRM. Son `monthly` est en euros HT ; les événements source `amount` sont déjà en centimes HT.
- `planLegacyImport(payload, {brandId, existingRecords})` accepte l’export `{leads, events, source, exportedAt}` ou une liste de leads. Il renvoie `{create, skip, conflicts, suppress, warnings, total}`. Il ne persiste rien.
- `operiaMetrics(records, {now, from, to})` calcule les activités enregistrées sur la période, les étapes et abonnements du portefeuille actuel. La date finale au format jour inclut toute cette journée. Les encaissements sont les événements `Paiement reçu`, sans déduction depuis le statut Gagné.
- `byCreation(a,b,oldest=false)` trie les entreprises par date, dates absentes à la fin.

Les identités source et les SIREN servent au rapprochement, puis le nom et l’email. En cas de SIREN contradictoires ou de plusieurs correspondances, un conflit exige un rapprochement manuel. Une fiche existante n’est pas écrasée. Les fiches archivées participent au rapprochement. Une opposition importée produit une mise à jour `suppress` de la fiche existante, préservant ses autres données ; cette liste ne doit jamais être ignorée lors de l’exécution d’un transfert.

L’ancien statut ambigu `Démo` devient `Démo réalisée` seulement en présence d’un événement `Démo tenue`, sinon `Démo planifiée`. Le statut source reste dans `legacy.stage` pour contrôle humain.

## Base de données et droits

`database/005_operia_profile.sql` conserve le SQL préparé. Sa copie `supabase/migrations/20261016162535_operia_profile.sql` a été générée avec la CLI Supabase, puis remplie à l’identique. Ce SQL a été appliqué en production le 19 octobre 2026 depuis l’éditeur SQL Supabase.

**Ne pas rejouer ces scripts sur cette base : les colonnes, fonctions et index existent déjà.** Avant une future opération de migration par la CLI, vérifier la cohérence entre le schéma effectivement appliqué et l’historique des migrations ; une exécution dans l’éditeur SQL ne prouve pas à elle seule l’enregistrement dans cet historique. Les fichiers SQL déjà appliqués restent inchangés.

RPC ajoutées :

- `public.crm_create_profiled_brand(brand_name text, brand_profile text)` : création atomique d’une marque et de son propriétaire, réservée à un propriétaire déjà existant ;
- `public.crm_set_brand_profile(brand_id uuid, brand_profile text)` : réservée au propriétaire de cette marque. Le retour à `general` est refusé si des fiches Opéria existent.

Les points d’entrée publics utilisent `security invoker`, les écritures privilégiées sont dans `crm_private` avec contrôle `auth.uid()` et du rôle stocké en base. Aucune modification des règles RLS ni aucun nouveau droit UPDATE sur les marques. Les droits existants owner/editor/viewer continuent de s’appliquer aux fiches et aux nouvelles métadonnées. Les index uniques SIREN et identité source sont limités à chaque marque et incluent les fiches archivées. Le statut natif `Ne plus contacter` est prioritaire et synchronisé avec l’étape `Opposition`.

## Vérifications réalisées

Contrôles locaux, relancés le 19 octobre 2026 :

- 20 tests de domaine : montants, opposition, doublons, marques, données absentes, sources périmées ou futures, tri et historique.
- 11 tests de parcours : préparation des brouillons, séparation des marques, droits et reprise du lot source avec contrôle de non-duplication. Les 31 tests de domaine et de parcours ont réussi.
- `tests/operia-migration-check.mjs` exécuté avec PGlite local : propriétaires/éditeurs/lecteurs/extérieurs, isolation, profil et création atomique, compatibilité Nanayé, validation JSON, index SIREN et origine, opposition.
- La vérification PGlite simule `auth.uid()` et ne valide ni les comptes réels, ni la configuration distante, ni la publication.

Contrôles de production après application du SQL, le 19 octobre 2026 :

- Présence des colonnes, index, fonctions et protections RLS vérifiée.
- Empreintes des données Nanayé comparées avant et après : identiques. Les nouvelles colonnes additives sont exclues de la comparaison des colonnes d’origine.
- Publication GitHub Pages confirmée et parcours de création de marque/import vérifié dans le CRM privé en ligne.
- Contenu importé comparé à l’export source : correspondance exacte, sans fiche manquante ni fiche supplémentaire. Les données privées et les preuves détaillées restent hors du dépôt.
- Isolation vérifiée sous le rôle authentifié d’un membre exclusivement Nanayé : aucune marque, fiche, adhésion ni activité Opéria visible. La lecture anonyme des fiches est interdite.
- Recherche officielle contrôlée depuis le site publié et tri des fiches par date de création vérifié. Les résultats de recherche restent limités aux pages chargées.

Références consultées : [JSON et JSONB](https://supabase.com/docs/guides/database/json), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [changements Supabase](https://supabase.com/changelog).
