# Mode exploration et points d'entrée

Status: resolved
Type: task
Blocked by: U06, R01, N02
UI: oui
Doc: docs/user `explore`

Spec: `../spec.md`

## À faire

- Bascule « Relire la PR » / « Explorer le repo » (côté UI, sur la commande `snapshot` existante, sans nouvelle commande) ; en exploration, carte du snapshot head sans diff, ni anciens emplacements, ni arêtes retirées.
- Détection des points d'entrée : routes et pages sont des faits d'un langage, donc le contrat de `relief-adapter-api` (`LanguageAdapter`, `Detector` pour les scripts du `package.json`) gagne la façon de les marquer ; `relief-index` les recopie dans le snapshot (`entry: true` + type, contrat régénéré) sans nommer d'adapter. Monter `LanguageAdapter::version()` de TS pour invalider le cache par blob. Section « Points d'entrée » de la barre de gauche.
- Vue d'ensemble chiffrée : detector, packages, externes, fichiers, symboles, liens par type.

## Critères d'acceptation

- [x] Test de snapshot : sur acme-shop, les points d'entrée sont les 4 routes (5 dans la maquette, voir « Correction du critère »), les 3 pages et le job `renewSubscriptions`.
- [x] e2e WebdriverIO : la bascule masque `legacyCoupon.ts` (supprimé) et affiche la section « Points d'entrée ».

## Baseline

`just test-summary` (develop, dfe4971) : cargo 459 passed, 0 failed ; web 427 passed, 0 failed.

## Seams

- **Snapshot d'un commit sur la fixture acme-shop** (`relief-index` avec les vrais adapters, ou cas d'usage `Session::snapshot`) : attrape le marquage `entry` + type par le contrat de `relief-adapter-api` (5 routes, 3 pages, le job `renewSubscriptions`) recopié par l'index, et l'invalidation du cache par la version de l'adapter TS ; rate l'UI.
- **Module de logique TS (`explore.logic.ts` ou voisin, Vitest)** : attrape la vue d'exploration (graphe du head sans diff, sans anciens emplacements ni arêtes retirées), la liste des points d'entrée groupée par type et la vue d'ensemble chiffrée (detector, packages, externes, fichiers, symboles, liens par type) ; rate le rendu.
- **e2e WebdriverIO sur l'app construite et acme-shop** : la bascule « Explorer le repo » masque `legacyCoupon.ts` et affiche la section « Points d'entrée » ; rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/entry_points.rs`, `src/ui/src/app/modules/explore/helpers/explore.logic.spec.ts`, `tests/e2e/tests/explore.e2e.ts`
- Lancer : `cargo test -p relief-app --test entry_points` ; `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/explore/helpers/explore.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/explore.e2e.ts`
- En échec : 11 tests (4 + 7), aucun ne passe
  - entry_points.rs (4, ne compile pas) — `Node.entry` et `Node.entry_type` n'existent pas (les 4 tests ratent à la compilation, dont la version de `TsAdapter` > 2)
  - explore.logic.spec.ts (7 : 3 exploreView, 3 entryPoints, 1 overview) — le module `explore.logic` (`exploreView`, `entryPoints`, `overview`) et `Node.entry/entryType` du contrat n'existent pas
  - explore.e2e.ts (3) — `explore-toggle` introuvable (bascule, retour à « Relire la PR », liste des points d'entrée)
- Écart à signaler : sur acme-shop, `feat/promo-codes` compte 4 routes (`POST /checkout`, `POST /promo/validate`, `GET /invoices/:id`, `GET /invoices`), pas 5 (3 sur `main`) ; 3 pages (Checkout, Invoices, Login) et 1 job collent. Le test affirme 5 comme le ticket, sans l'ajuster : à trancher (ticket ou fixture).
- Contrat supposé : `Node.entry: bool` + `Node.entry_type: Option<String>` (JSON `entry`, `entryType` : route | page | job | script | main) ; `data-testid` : `explore-toggle`, `entry-points-section`, `entry-point-row` (`data-node-id`, `data-entry-type`).

## Correction du critère

La fixture acme-shop (`feat/promo-codes`) déclare 4 routes : `POST /checkout`, `POST /promo/validate`, `GET /invoices/:id`, `GET /invoices` (vérifié dans les sources de la fixture). Le 5 venait de la maquette. Comme pour T04, R04, E07 et R05, le critère suit la fixture : 4 routes, 3 pages, 1 job. Décision de l'orchestrateur.

## Green

- Fichiers : `relief-model/src/{types,testing}.rs`, `relief-adapter-api/src/lib.rs`, `relief-index/src/{lib,cache}.rs`, `relief-detect/src/{generic,workspaces}.rs`, `relief-lang-ts/src/lib.rs`, `docs/contract/*`, `contract.ts`, `src/ui/src/app/modules/explore/*`, `modules/map/components/map-page/*`, `modules/review/business/diff.business.ts`, `src/ui/public/i18n/{en,fr}.json`, et `relief-index/tests/detectors.rs` (littéraux `Node` et `Detection`, une ligne chacun).
- Changement : `Node.entry/entry_type`, `Extraction.entries` et `Detection.entries` (contrat `EntryPoint`) ; l'index recopie les deux sources sur les nœuds (indexés par id) sans nommer d'adapter ni de detector ; le detector workspaces marque le package une fois par script du `package.json` ; `TsAdapter` v3 marque routes, pages et jobs. UI : bascule, section « Points d'entrée », vue d'ensemble avec types de liens et « Détecteur » traduits EN/FR. Version du detector inchangée (pas de cache par detector).
- Suite : cargo 467/0, web 434/0, e2e 75 réussis, 1 ignoré, 0 échoué ; lint propre (baseline 459/0 et 427/0).
- Questions ouvertes : `marks` de `exploreView` conservé, car `explore.logic.spec.ts` le lit (test non modifiable) ; l'id réel `pkg:@acme/api` / `pkg:@acme/web` colle à l'hypothèse.

## Review (2e passe)

- Verdict : ship
- Must fix : aucun
- Consider : `relief-detect/src/workspaces.rs:~273` — un script devient N entrées identiques sur le nœud du package (`for _ in 0..script_count`) : le nom du script est perdu et les doublons n'ont qu'un effet de comptage ; un seul marquage par package (ou un nœud par script) serait plus net.

## Answer

- Construit : `Node.entry` / `entry_type` ; contrat `EntryPoint` dans `relief-adapter-api`, porté par `Extraction.entries` (adapters) et `Detection.entries` (detectors) ; `relief-index` recopie les deux sur les nœuds (indexés par id) sans nommer d'adapter ni de detector. `TsAdapter` version 3 : routes (`app.get/post…`), pages (`.tsx` sous `pages/`), jobs (fonctions exportées sous `jobs/`). Le detector workspaces marque le package de chaque `package.json` qui a des `scripts`. UI : bascule « Explorer le repo » / « Relire la PR » (`explore.logic.ts` : graphe du head sans diff, ni anciens emplacements, ni arêtes retirées), section « Points d'entrée » groupée par type (clic = sélection) et vue d'ensemble chiffrée, chaînes EN/FR.
- Décisions : 4 routes (la fixture), pas 5 (la maquette) ; les scripts d'acme-shop (`@acme/api`, `@acme/web`) sont des points d'entrée en plus des 8 du critère ; un script = un `EntryPoint` sur le nœud du package (pas de nœud par script, nom du script non porté).
- Review : « fix first » (scripts du `package.json` non détectés), corrigé avec tests, puis « ship ».
- Vérifié : `just test-summary` cargo 467/0, web 434/0 (baseline 459/427) ; `just e2e-summary` 75 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots` et lecture de `explore-entry-points` FR ; `just docs-build`.
- Doc : sections « Le mode exploration » et « Points d'entrée » de `explore` (FR et EN) avec capture.
- Suivis : un marquage par package (ou un nœud par script portant son nom) au lieu de N entrées identiques ; tests unitaires des cas limites de `link_entries` (`.spec.`, `pages/` sans `.tsx`) ; `marks` de `exploreView` non lu en production ; « Detector : … » garde la ponctuation française en EN ; la section « Chercher un symbole » de `explore` dit encore « à venir » alors que la recherche existe (U05).
