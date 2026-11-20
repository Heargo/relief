# S05 Mesurer le rendu de la carte

Status: resolved
Type: task
Blocked by: S02
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Retour du 2026-11-20 : la carte rame (zoom, déplacement, sélection) quand beaucoup de nœuds et d'arêtes sont affichés. Lecture du code (2026-11-20), à confirmer par la mesure : à chaque frame de pan ou de zoom, `MapBusiness` recalcule `computeModes` deux fois sur tout le layout (`visibleNodes`, `boxIds`), parcourt tous les nœuds du layout, recalcule pour chaque arête sa forme, son statut de diff, ses violations et ses comptes, place chaque étiquette en la testant contre toutes les boîtes visibles (O(arêtes × boîtes)), puis `MapCanvasComponent` réécrit les styles de chaque nœud, les attributs de chaque arête, reconstruit les infobulles et recalcule l'emphase de la sélection.

## À faire

- Une fixture générée avec beaucoup d'arêtes (`wide` n'en a aucune) : par exemple `dense`, 10 packages × 150 fichiers qui s'importent entre packages, avec des changements dans le working tree.
- Un harnais de mesure du rendu (WebdriverIO sur l'app native, `just bench-ui`) : pan, zoom à la molette et sélection scriptés sur `dense` et sur excalidraw (S02), temps par frame (p50, p95) et temps des longues tâches, relevés par `PerformanceObserver` (`longtask`) et des `performance.mark` autour des `computed` et des `sync*` de la carte.
- Ajouter les chiffres et la répartition du temps (calcul, écriture DOM, style et layout du navigateur) à `docs/bench.md`.
- Fixer le budget à tenir par S06 à S09 (ex. p95 < 16 ms au pan, < 33 ms au zoom, sélection < 100 ms sur `dense`).

## Critères d'acceptation

- [x] `just bench-ui` tourne sur `dense` et sur excalidraw et écrit ses chiffres.
- [x] `docs/bench.md` contient la mesure, la répartition du temps et le budget du rendu.

## Suite

Les optimisations sont dans S06 (caméra en un seul transform), S07 (ne recalculer à chaque frame que ce qui suit la caméra), S08 (arêtes hors de la vue et niveau de détail) et S09 (disposition hors du thread principal). Chacune reprend le budget fixé ici.

## Baseline

`just test-summary` (2026-11-20, après S04, d87b1bc) : cargo 626 passed, 0 failed ; web 690 passed, 0 failed.

## Seams

- **Fixture `dense` (`relief-fixtures`, testée par un test d'intégration qui l'indexe)** : attrape la forme de la fixture (10 packages × 150 fichiers, imports entre packages donc beaucoup d'arêtes au niveau système et modules, changements dans le working tree) et qu'elle se construit de façon déterministe ; rate le rendu.
- **`just bench-ui`** (mesure, pas un test) : harnais WebdriverIO sur l'app native, pan, zoom et sélection scriptés sur `dense` et excalidraw ; chiffres p50 / p95 par frame, longues tâches et répartition (calcul, DOM, style/layout) dans `docs/bench.md`, avec le budget de S06 à S09. Il ne fait pas partie de `just e2e` (trop long, dépend des clones de S02).

## Red

- Fichiers de test : `tests/relief-fixtures/tests/dense.rs`, `src/app/relief-app/tests/dense.rs`
- Lancer : `cargo test -p relief-fixtures --test dense` et `cargo test -p relief-app --test dense`
- Contrat pour green : `tests/fixtures/dense/fixture.yaml` (fixture générée : 10 packages × 150 fichiers `packages/pkg-NN/file-NNN.ts`, chaque fichier importe au moins un fichier d'un autre package, au moins 10 fichiers modifiés dans le working tree après `build` par le CLI, sortie déterministe) ; `generate:` et le CLI `build` doivent donc savoir produire imports et changements du working tree.
- En échec : 4 tests
  - `build_dense_creates_ten_packages_of_one_hundred_fifty_files` — `tests/fixtures/dense/fixture.yaml` n'existe pas
  - `dense_is_committed_on_main_and_leaves_changes_in_the_working_tree` — idem
  - `dense_is_deterministic` — idem
  - `indexing_dense_finds_many_import_edges_between_packages` (relief-app) — idem (ensuite : 1500 fichiers, au moins 1000 arêtes `Imports` entre packages)

## Green

- Fichiers : `tests/relief-fixtures/src/lib.rs`, `tests/fixtures/dense/fixture.yaml`, `src/ui/src/app/core/helpers/perf.ts`, `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts`, `tests/e2e/wdio.bench.conf.ts`, `tests/e2e/bench/{render,dense.bench,excalidraw.bench}.ts`, `justfile`, `docs/bench.md`, `docs/dev/rules.md`
- Changement : `generate:` accepte `imports_per_file` et `modified_files` (imports vers les packages suivants, fichiers réécrits dans le working tree après le dernier commit) ; fixture `dense` (10 x 150, 3 imports, 30 modifiés). Marques `performance.measure('relief:*')` (auto-temps, inactives hors `window.__reliefPerf`) sur les `computed` et les `sync*` de la carte. `just bench-ui` (harnais WebdriverIO hors `just e2e`, JSON dans `target/bench-ui/`), lancé sur `dense` et excalidraw ; mesure, répartition et budget (p95 pan < 16 ms, zoom < 33 ms, sélection < 100 ms, aucune longue tâche) dans `docs/bench.md`.
- Suite : cargo 630 passed / 0 failed (baseline 626, +4 tests rouges) ; web 690 / 0 (= baseline) ; e2e 140 passed, 1 skipped, 0 failed ; lint propre.
- Questions ouvertes : l'API Long Tasks n'existe pas dans WebKitGTK (repli : étapes dont `work` > 50 ms) ; la sélection coûte ~100 ms hors des marques (Angular, `selectedNodeEdges`, `selectedEdge` non marqués) à détailler par S07 ; mesure sous Xvfb sans GPU, une seule exécution.
- Lint : `cargo fmt --check` échoue uniquement sur le test rouge `src/app/relief-app/tests/dense.rs` (ligne `package_of` trop longue, laissée telle quelle car indexée) ; à reformater à l'étape review. Le reste de `just lint` passe.

## Answer

- Fixture `dense` (`tests/fixtures/dense/fixture.yaml`) : 10 packages × 150 fichiers, 3 imports par fichier vers les packages suivants, 30 fichiers modifiés dans le working tree ; `generate:` accepte `imports_per_file` et `modified_files`. Déterministe.
- Marques `performance.measure('relief:*')` (`core/helpers/perf.ts`, `measured()`) sur `visibleNodes`, `boxIds`, `allEdges`, `edgeLines`, `coChangeLines` et les `sync*` du canvas, inactives hors `window.__reliefPerf`.
- `just bench-ui` (`tests/e2e/wdio.bench.conf.ts`, `tests/e2e/bench/`), hors de `just e2e` : pan, zoom molette et sélection sur `dense` et excalidraw, chiffres dans `target/bench-ui/*.json`.
- Mesure (dense, vue d'ensemble, 1 349 nœuds, 4 500 arêtes) : pan p50 231 ms, p95 248 ms, dont `syncEdges` ~73 ms, style/layout ~79 ms, `edgeLines` ~30 ms ; `computeModes`, `visibleNodes`, `boxIds` < 1 ms (le constat de lecture du code ne se confirme pas) ; sélection 120 à 150 ms dont ~100 ms hors marques.
- Budget fixé dans `docs/bench.md` pour S06 à S09 : p95 de travail par frame pan < 16 ms, zoom < 33 ms, sélection < 100 ms, aucune tâche > 50 ms. Aucun n'est tenu aujourd'hui.
- Vérifié : cargo 630 / 0, web 690 / 0 (baseline 626 / 690), `just lint` propre, `just e2e-summary` 140 passés, 1 ignoré, 0 échec. Review : ship.
- Limites : une seule exécution sous Xvfb sans GPU (les parts comptent plus que les valeurs) ; pas d'API Long Tasks dans WebKitGTK (repli : étapes > 50 ms). `Consider` non appliqués : test Vitest de `measured`, ordre d'import dans `map-canvas`, reformatage du tableau de `rules.md` par Prettier inclus dans ce commit.
