# D03 Modules (dossiers) dans les packages d'un workspace, et label du système par son chemin

Status: resolved
Type: task
Blocked by: D02
UI: oui (libellé des systèmes et nouveaux modules sur la carte)
Doc: user-docs `map` (exemples de libellés, compteurs de croisements si changés, captures)

Spec: `../spec.md` (Décisions : générique, workspaces)

Débloque U05 : son critère e2e attend le fil d'Ariane `acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh` (maquette : `M('auth', …)` dans `apps/api`). Aujourd'hui `workspaces.rs` (D02) rattache les fichiers directement au package, sans nœud Module, et la carte affiche `@acme/api` au lieu de `apps/api`.

## À faire

- Dans chaque package d'un workspace, créer les nœuds `module` des dossiers du package, avec la même règle que le detector générique (D01) appliquée à partir de la racine du package : dossiers de premier et second niveau, un dossier sans fichier à enfant dossier unique n'est pas un module, mêmes exclusions. Les fichiers se rattachent au module de leur dossier, sinon au package.
- Ids (déterministes, sans dépendre de l'ordre des chemins) : système inchangé `pkg:<name>` (le spec identifie un système par le `name` du `package.json`) ; module `pkg:<name>/<dossier relatif au package>` (ex. `pkg:@acme/api/auth`, même `subkind` que les modules du générique) ; fichier `<id du parent>::file:<chemin dans le dépôt>` comme le générique. Les ids de fichiers sous un module changent donc (parent différent) ; c'est voulu.
- Ajouter au `Node` du modèle un champ optionnel `path` (dossier dans le dépôt, sans `/` final), rempli pour les systèmes de workspace (`apps/api`) et les modules (`apps/api/auth`), absent (non sérialisé) ailleurs. Régénérer le contrat TS (M02).
- Libellé affiché : un système `service`/`package` qui a un `path` est libellé par ce chemin (`apps/api`) ; le nom de package reste lisible dans l'id (`pkg:@acme/api`). Les modules gardent le libellé `<dernier segment>/` (`auth/`).
- Incrémenter la version utilisée par le cache (I02) pour que les anciens snapshots soient invalidés.

## Critères d'acceptation

- [ ] `relief-detect` sur acme-shop (`main`) : `pkg:@acme/api` (path `apps/api`) contient un module `pkg:@acme/api/auth` (path `apps/api/auth`), qui contient le fichier `apps/api/auth/session.ts` ; idem `routes`, `billing`, `jobs`. Snapshot insta relu.
- [ ] Les ids sont identiques quel que soit l'ordre des chemins en entrée, et d'un run à l'autre.
- [ ] Le package `@acme/api` reste retrouvable : id `pkg:@acme/api`, `package_dirs` inchangée.
- [ ] Vitest : le libellé d'un système avec `path` est `apps/api` ; sans `path`, il reste dérivé de l'id ; un module donne `auth/`.
- [ ] e2e : sur acme-shop, la carte montre une boîte `apps/api` qui contient `auth/`.
- [ ] Toute mise à jour d'un snapshot ou d'un test existant (CLI, `/api/diff`, couplings E03, fixture web U04, e2e U02-U04) est listée ici avec sa raison, sans affaiblir d'assertion. Si les compteurs de croisements de U04 changent, la doc `map` est mise à jour (FR et EN) et la réduction reste d'au moins 50 %.

## Baseline

`just test-summary` sur `develop` (0cada66) : cargo 329 passed, 0 failed ; web 127 passed, 0 failed. `just build` puis `just e2e-summary` : e2e 34 passed, 0 failed.

## Seams

1. **API publique de `relief-detect`** (`relief_detect::detect` sur les chemins et blobs de la fixture acme-shop `main`, plus des listes en mémoire, snapshot insta) : attrape les modules dans un package, le rattachement des fichiers, les ids et `path`, le déterminisme (ordre des chemins), `package_dirs` inchangée. Rate le libellé affiché et le rendu.
2. **Module de logique TS `node-info.logic.ts`** (Vitest, `labelOf` / `buildNodeInfos` sur un `GraphSnapshot` littéral) : attrape le libellé `apps/api` d'un système avec `path`, le repli sur l'id sans `path`, `auth/` pour un module. Rate la donnée produite par le cœur.
3. **e2e Playwright** contre `relief serve` sur acme-shop : attrape la chaîne complète (cœur → contrat → carte), une boîte `apps/api` qui contient `auth/`. Rate le détail des ids.

UI : oui. Doc : `map` (FR et EN), captures, compteurs de croisements si changés.

## Red

- Fichiers de test : `crates/relief-detect/tests/workspace_modules.rs` (nouveau, snapshot insta `crates/relief-detect/tests/snapshots/workspace_modules__acme_shop_workspace_nodes.snap` à créer et relire au green), `web/src/app/modules/map/helpers/node-info.logic.spec.ts` (nouveau), `e2e/tests/map.spec.ts` (un test ajouté). `crates/relief-detect/Cargo.toml` : dev-dependencies `relief-fixtures`, `relief-git`, `tempfile` ajoutées pour construire acme-shop.
- Lancer : `cargo test -p relief-detect --test workspace_modules` ; `cd web && npx ng test --watch=false --include src/app/modules/map/helpers/node-info.logic.spec.ts` ; `cd e2e && npx playwright test map.spec.ts`
- En échec : 6 tests
  - workspace_modules.rs (5 tests : snapshot, auth/session, routes-billing-jobs, déterminisme, package_dirs) — le fichier ne compile pas : champ `path` absent de `Node` (E0609), rouge attendu ; le snapshot et `package_dirs` échoueront au green tant que `path`/modules n'existent pas.
  - node-info.logic.spec.ts « labels a workspace system by its path, not its package name » — reçoit `@acme/api` au lieu de `apps/api`. Les 4 autres tests du fichier (repli sans `path`, `auth/`, fichier sous module, `labelOf`) passent déjà : ce sont des garde-fous. Le `path` est passé par un cast `as unknown as GraphSnapshot` car le contrat TS ne l'a pas encore ; à retirer après `just contract` si souhaité.
  - e2e map.spec.ts « apps/api is a box that contains the auth/ module » — libellé `@acme/api` au lieu de `apps/api` (et pas encore de module `auth/` dans la boîte). Les 7 autres tests du fichier passent.

## Green

- Fichiers : `crates/relief-model/src/types.rs` (+`path`), `crates/relief-model/src/testing.rs`, `crates/relief-lang-ts/src/lib.rs`, `crates/relief-index/src/cache.rs` (`SCHEMA_VERSION` 1 -> 2, `path: None`), `crates/relief-detect/src/generic.rs` (`Folders` extrait), `crates/relief-detect/src/workspaces.rs`, `docs/contract/*.schema.json`, `web/src/app/core/models/contract.ts` (`just contract`), `web/src/app/modules/map/helpers/node-info.logic.ts`.
- Changement : `Node.path` optionnel ; `workspaces.rs` crée par package les modules `pkg:<name>/<dossier>` (subkind `folder`) avec la règle de `generic.rs` (helper `Folders`) et rattache les fichiers au module, sinon au package ; `labelOf` libelle un `service`/`package` avec `path` par ce chemin.
- Mises à jour de tests/snapshots existants (ids de fichier désormais sous un module, nouveaux modules, ordre des symboles dans le texte) : `crates/relief-cli/tests/snapshots/diff__diff_acme_{json,text}.snap`, `crates/relief-server/tests/snapshots/api__api_diff_acme.snap` (ids + ordre), `crates/relief-server/tests/api.rs` (3 constantes d'ids), `crates/relief-diff/tests/acme_moves.rs` (ids de parent), `web/src/testing/fixtures/acme-shop.snapshot.json` (régénérée via `relief serve` : 132 nœuds, 177 arêtes), `map-layout.business.spec.ts` et `layout-optimize.logic.spec.ts` (compteurs). Snapshot créé : `workspace_modules__acme_shop_workspace_nodes_snapshot.snap` (nom dérivé du test, sans `_snapshot` dans le ticket), relu.
- Compteurs U04 : 917 (301+434+182) -> 586 (29+436+121) ; seuil 50 % : 458 -> 293 ; croisements centre à centre au niveau 0 : 2 -> 1. À reporter dans la doc `map` (non touchée) ; le total optimisé exact n'a pas été relevé (assertion <= 293 passe).
- Suite : cargo 334 passed, 0 failed (baseline 329) ; web 132 passed, 0 failed (baseline 127) ; `just lint` propre ; e2e 34 passed, 1 failed (baseline 34, +1 test rouge).
- Questions ouvertes : e2e `map.spec.ts` « apps/api is a box that contains the auth/ module » reste rouge : le libellé `apps/api` passe, mais le test cherche `auth/` en DOM imbriqué (`[data-node-id="pkg:@acme/api"]` .locator(module)) alors que le canvas rend tous les nœuds à plat (`map-canvas.component.ts`, frères dans une couche), et au niveau 1 les modules d'un système fermé sont des `ghost` sans texte (`visibility.logic.ts`). Le test est à revoir (par ex. niveau 2, ou test par `data-node-id="pkg:@acme/api/auth"` et géométrie) ou la spec d'UI à trancher ; je n'ai pas touché au test.

### Correction (e2e)

Le test e2e « apps/api is a box that contains the auth/ module » supposait un `auth/` descendant DOM de `apps/api` et visible au niveau 1. Faux : le canvas rend les nœuds à plat (`map-canvas.component.ts`) et, au niveau 1, les modules d'un système fermé sont des `ghost` sans texte (`visibility.logic.ts`, décision U02, maquette : les boîtes s'ouvrent au zoom). Réécrit au niveau 2 (`level-2`) : boîte `apps/api` visible (libellé `apps/api`, pas `@acme/api`), `pkg:@acme/api/auth` visible avec `auth/`, sa bounding box contenue dans celle de `apps/api`. Aucune assertion affaiblie.

## Croisements (mesure de l'orchestrateur)

Mesuré sur la fixture web régénérée (`acme-shop.snapshot.json`, 132 nœuds, 177 arêtes), niveaux 1 à 3, avec `crossingsAtLevel` dans un spec Vitest temporaire (supprimé ensuite) :
- grille brute (ordre alphabétique) : 29 + 436 + 121 = **586** (avant D03 : 917) ;
- disposition optimisée : 21 + 113 + 23 = **157** (avant D03 : 115).
- Réduction : 73 % (≥ 50 %, critère U04 tenu). Le seuil des tests passe de 458 à 293 parce qu'il vaut `floor(brut / 2)`, ce qu'exige le critère de U04 ; ce n'est pas un ajustement au résultat. Le total brut baisse parce que les fichiers d'`apps/api` et des autres packages sont maintenant regroupés dans des modules : le niveau 1 tombe de 301 à 29.

### Correction (review)

`workspace_modules.rs` : `subkind` attendu `"module"` (celui du générique, generic.rs:207), plus `"folder"`. `node-info.logic.spec.ts` : cast `as unknown as GraphSnapshot` retiré (le contrat TS a `path`), nœuds typés `Node`, `subkind: 'module'`. Snapshot insta non touché.
- Correctifs review : subkind des modules de workspace `folder` -> `module` (`workspaces.rs`) ; `generic.rs` : alias `is_module` supprimé, `owner` réutilise `Folders::module_of` ; snapshot `workspace_modules__acme_shop_workspace_nodes_snapshot.snap` ré-accepté et fixture web régénérée (aucun autre snapshot ne contenait `folder`) ; compteurs inchangés (brut 586, seuil 293 passe) ; cargo 334/0, web 132/0, lint propre, e2e non relancé.

## Review

- Première passe : fix first.
  - Must fix : la doc `map` (FR et EN) disait encore 917 → 115.
  - Consider :
    - duplication de `module_of` dans `generic.rs` ;
    - subkind `folder` dans les workspaces contre `module` dans le générique (erreur du ticket, corrigée) ;
    - cast inutile dans `node-info.logic.spec.ts` ;
    - `detect_workspaces` long.
- Corrections, une boucle :
  - tdd-red : assertion `module` et `satisfies GraphSnapshot` ;
  - tdd-green : subkind `module`, `owner` réutilise `Folders::module_of`, snapshot insta et fixture web régénérés ;
  - orchestrateur : doc 586 → 157, exemples `apps/web` → `packages/db`, captures `map` régénérées.
- Revérification : ship. Must fix : aucun.
- Consider restant : extraire de `detect_workspaces` la construction des nœuds d'un package.

## Navigateur

`relief serve` sur acme-shop (`relief-acme`), à 1280 px, en FR puis en EN. Le niveau 0 montre `apps/api`, `packages/db`, `packages/shared` et `apps/web`, et aucun libellé `@acme/api`. Au niveau 2, la boîte `pkg:@acme/api/auth` affiche `auth/ · 2 fichiers · 10 symboles` et sa bounding box est contenue dans celle d'`apps/api`. Le panneau affiche « Fewer crossings: 157 / Raw grid: 586 ». Console (`onlyErrors`) : vide.

## Documentation

`user-docs` `map` en FR et EN : compteurs passés de 917 → 115 à 586 → 157 ; exemples d'arêtes et d'infobulle en `apps/web` → `packages/db` (au lieu de `@acme/web` → `@acme/db`). Captures `map` FR et EN régénérées (`just docs-shots map`). `just docs-build` passe.

## Answer

- Construit :
  - Dans chaque package d'un workspace, `relief-detect` crée maintenant les modules (dossiers) avec la règle du générique. Leur id est `pkg:<name>/<dossier>` (par ex. `pkg:@acme/api/auth`), leur subkind `module`, comme dans le générique.
  - Les fichiers sont rattachés à leur module. Leur id `<parent>::file:<chemin>` change donc sous un module.
  - Nouveau champ optionnel `Node.path` (`apps/api`, `apps/api/auth`), non sérialisé quand il est absent. Le contrat JSON et le contrat TS sont régénérés.
  - L'UI libelle un service ou un package par son `path`. Le nom de package reste dans l'id `pkg:@acme/api` et dans `package_dirs`.
  - Le `SCHEMA_VERSION` du cache passe de 1 à 2.
- Décisions :
  - L'id d'un système reste son nom de package, car le spec identifie un système par le `name` du `package.json`. Seul le libellé vient du chemin. Aucune ADR ni le spec ne contredit le libellé par le chemin.
- Tests existants mis à jour (ids de fichier sous les modules et compteurs ; aucune assertion affaiblie) :
  - snapshots CLI `diff` (json, texte) et `/api/diff` ;
  - ids dans `relief-server/tests/api.rs` et `relief-diff/tests/acme_moves.rs` ;
  - fixture web régénérée ;
  - compteurs de croisements dans `map-layout.business.spec.ts` et `layout-optimize.logic.spec.ts`, dont le seuil vaut `floor(brut/2)` selon le critère de U04.
  - Un e2e de red (DOM plat, modules en ghost au niveau 1) a été corrigé par tdd-red pour vérifier le niveau 2 et l'inclusion des bounding boxes.
- Croisements :
  - grille brute : 917 → 586 ;
  - disposition optimisée : 115 → 157 ;
  - la réduction reste de 73 %.
- Vérifié :
  - `just test-summary` : cargo 334/0 (baseline 329), web 132/0 (baseline 127) ;
  - `just e2e-summary` : 35/0 (baseline 34) ;
  - `just lint` propre ;
  - navigateur et docs-build : OK.
