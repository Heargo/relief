# Benchmarks sur de vrais dépôts

Status: resolved
Type: task
Blocked by: S01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : budgets)

## À faire

- `just bench` : clone (une fois, dans `~/dev/relief-bench/<nom>` (variable `RELIEF_BENCH_DIR`), jamais dans un `.relief/`) 2 dépôts TS publics de tailles différentes à un SHA épinglé, et mesure des cas d'usage de `relief-app` : `Session::open` + `snapshot` à froid (`.relief/cache/` du clone supprimé) et à chaud, `Session::analyse` sur une plage fixe, `snapshot` avec budget. Chaque clone a son propre `.relief/`, créé par la `Session` : c'est voulu.
- Écrit `docs/bench.md` (date, machine, chiffres).
- Profiler le pire poste et corriger s'il dépasse les budgets fixés dans ce ticket : indexation à chaud < 2 s pour 5 000 fichiers, diff d'une PR de 50 fichiers < 1 s.
- Si S01 a trouvé le coût de l'IPC significatif, ajouter une mesure de bout en bout de `invoke` (WebdriverIO).

## Critères d'acceptation

- [x] `docs/bench.md` contient une première mesure ; les budgets sont tenus ou les écarts sont expliqués dans `## Answer`.

## Décision (utilisateur, 2026-11-20)

- Clones dans `~/dev/relief-bench/<nom>` (pas dans `~/.cache`), dossier réglable par `RELIEF_BENCH_DIR`.
- Dépôts : `excalidraw/excalidraw` (moyen, yarn workspaces, React/TSX) et `n8n-io/n8n` (gros, pnpm workspace). SHA épinglés au moment du premier clone, notés dans `justfile` et `docs/bench.md`.

## Baseline

`just test-summary` (develop, 507600b) : cargo 561 passed, 0 failed ; web 476 passed, 0 failed.

## Clones (2026-11-20, `--depth 400 --single-branch`)

- `excalidraw` : `2c3dcc06ec807e81ab9437eceb1a8f7a3c590743`, 702 fichiers `.ts`/`.tsx`, 400 commits clonés, 100 Mo.
- `n8n` : `b12dbc37be53b1d0e151de30debc0a4281502a9c`, 25 662 fichiers `.ts`/`.tsx`, 411 commits clonés, 404 Mo.

n8n fait environ 5 fois la référence de 5 000 fichiers du budget : le budget « indexation à chaud < 2 s pour 5 000 fichiers » se compare au prorata du nombre de fichiers.

## Seams

- **Harnais de bench (binaire ou bibliothèque, par exemple `tests/relief-bench`) testé sur une fixture (`acme-shop`)** : attrape que chaque mesure (ouverture + snapshot à froid et à chaud, `analyse` d'une plage, snapshot avec budget) tourne et produit une ligne de rapport (nom, durée, nœuds, fichiers) ; rate les chiffres réels, mesurés à la main sur les clones et écrits dans `docs/bench.md`.

## Red

- Fichiers de test : `tests/relief-bench/tests/smoke.rs` (squelette : `tests/relief-bench/Cargo.toml`, `tests/relief-bench/src/lib.rs` avec `BenchPlan { range: String, budget: usize }` et `Measure { name, millis, nodes, files }` ; crate ajouté aux `members` du `Cargo.toml` racine ; `relief-app` en dépendance, `relief-fixtures` et `tempfile` en dev-dépendances)
- Lancer : `cargo test -p relief-bench --test smoke`
- En échec : 2 tests, ne compilent pas (rouge) : `unresolved import relief_bench::run`
  - `reports_the_four_measures_in_order` — `run(repo, &BenchPlan) -> Result<Vec<Measure>, _>` manque ; attend les noms `open_snapshot_cold`, `open_snapshot_warm`, `analyse`, `snapshot_budget` dans cet ordre
  - `every_measure_has_nodes_and_files` — même symbole manquant ; attend 4 mesures avec `nodes > 0` et `files > 0`

## Green

- Fichiers : `tests/relief-bench/src/lib.rs`, `tests/relief-bench/src/main.rs`, `tests/relief-bench/Cargo.toml`, `justfile` (`just bench`), `docs/bench.md`, `src/analysis/lang/relief-lang-ts/src/{lib,resolve}.rs`, `src/analysis/relief-index/src/lib.rs`, `src/analysis/relief-git/src/lib.rs`
- Changement : `relief_bench::run` (4 mesures) et binaire `relief-bench <repo> <plage> [budget]` ; `just bench` clone seulement si le dossier manque, mesure excalidraw et n8n, plages = un commit de PR squashée (~50 fichiers, l'historique n'a aucun merge) : excalidraw `8fd9703..47cbb5b` (56 fichiers), n8n `ce38a06..fea1ec0` (54 fichiers). Corrections locales trouvées au profilage : requête tree-sitter compilée une fois par grammaire (et non par fichier), recherche de blob par table, tsconfig/package.json mémoïsés par fichier lié, `repo_id`/`log` tolèrent les clones superficiels (le bench échouait dessus).
- Suite : cargo 563 passed, 0 failed (baseline 561 + 2 tests de fumée) ; web 476 passed, 0 failed. `just lint` échoue uniquement sur `cargo fmt --check` à cause du test figé `smoke.rs` (tableau d'une ligne que rustfmt veut éclater) ; clippy, ng build et prettier sont propres.
- Questions ouvertes : budgets non tenus (voir `docs/bench.md`). Excalidraw (702 fichiers ts) : à chaud 1,6 s contre 0,28 s au prorata ; analyse 3,1 s contre 1 s. n8n (25 662 fichiers ts) : à chaud 30,0 s contre 10,3 s ; analyse 65 s. Cause restante : le cache disque garde l'extraction mais pas l'index de fichier dont `link` a besoin, donc chaque snapshot reparse chaque fichier (~1,2 à 2,4 ms/fichier) et `analyse` indexe les deux côtés en entier. Corriger demande de persister l'index de fichier dans le cache ou de partager le parse entre `extract` et `link` (changement de conception, hors de ce ticket). Fmt de `smoke.rs` : à formater à l'étape de review (le fichier est figé ici).

### Red : clone superficiel (relief-git)

- Fichier de test : `src/analysis/relief-git/tests/shallow.rs` (fixture `churn`, clonée avec `git clone --depth 2 file://…`)
- Lancer : `cargo test -p relief-git --test shallow`
- 6 tests, 1 rouge, 5 verts (le code existe déjà) :
  - rouge : `touching_commits_skips_the_shallow_boundary_commit` — `touching_commits` renvoie c6 et c5 ; c5, à la frontière, est comparé à un arbre vide (`parent_tree` renvoie `None`) au lieu d'être sauté.
  - verts : `shallow_clone_repo_id_and_log_do_not_fail`, `shallow_clone_repo_id_is_the_oldest_stored_commit`, `full_repo_id_is_the_first_commit`, `full_repo_log_is_unchanged`, `a_missing_parent_without_shallow_file_is_an_error`.

### Mise à jour après review (fix first)

- Changement : `touching_commits` saute le commit à la frontière d'un clone superficiel ; commentaire de `repo_id` (id = plus ancien commit stocké, instable d'un clone à l'autre) et section « Shallow clones » dans `docs/bench.md` ; `by_blob` renommé `by_path` ; helper `symbols_query(tsx)` pour les `OnceLock` TS/TSX. Bench non relancé (indexation, analyse et snapshot ne dépendent pas du churn ni du log).
- Suite : cargo 569 passed, 0 failed ; web 476 passed, 0 failed. `just lint` échoue seulement sur `cargo fmt --check` des tests figés `smoke.rs` et `relief-git/tests/shallow.rs` (non reformatés, à formater par qui a le droit de les toucher) ; clippy propre.

## Answer

- Construit : crate `tests/relief-bench` (`relief_bench::run`, 4 mesures : `open_snapshot_cold`, `open_snapshot_warm`, `analyse`, `snapshot_budget`) et binaire `relief-bench <repo> <plage> [budget]` ; `just bench` (release) mesure excalidraw et n8n dans `${RELIEF_BENCH_DIR:-$HOME/dev/relief-bench}` et ne clone que si le dossier manque ; `docs/bench.md` (machine, SHA, plages, chiffres, budgets, causes).
- Chiffres (Ryzen 7 7700X, release) : excalidraw 702 fichiers TS : froid 2,7 s, chaud 1,6 s, `analyse` 3,1 s, budget 16 ms ; n8n 25 662 fichiers TS : froid 54 s, chaud 30 s, `analyse` 65 s, budget 356 ms.
- Budgets non tenus (critère : écarts expliqués) : chaud 1,6 s contre 0,28 s au prorata (excalidraw), 30 s contre 10,3 s (n8n) ; diff d'une PR de ~50 fichiers 3,1 s et 65 s contre 1 s. Cause : l'index de fichier n'est pas en cache, chaque snapshot reparse chaque fichier, `analyse` indexe les deux côtés. Suite : S04.
- Corrigé au passage (profilage) : requête tree-sitter compilée une fois par grammaire (chaud 3,5 s → 1,65 s sur excalidraw), table chemin → entrée dans `relief-index` (`by_path`), tsconfig/package.json mémoïsés par fichier lié, `repo_id`/`log`/`touching_commits` tolérants aux clones superficiels (le commit à la frontière est sauté au lieu d'être comparé à un arbre vide ; l'id d'un clone superficiel est le plus ancien commit stocké, documenté).
- Mesure de bout en bout de `invoke` non faite : S01 a mesuré l'IPC (9,5 ms de sérialisation pour 6 000 nœuds), pas significatif.
- Review : « fix first » (clone superficiel non testé, frontière comptée comme « tout ajouté »), corrigé avec tests (`relief-git/tests/shallow.rs`), puis vérifié par l'orchestrateur.
- Vérifié : `just test-summary` cargo 569/0, web 476/0 (baseline 561/476) ; `just lint`. Pas de doc utilisateur.
