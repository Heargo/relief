# Snapshot d'un commit

Status: resolved
Type: task
Blocked by: G01, D01
UI: non
Doc: aucune

Spec: `../spec.md`

## À faire

- `relief-index` : `Indexer` avec un registre de detectors et d'adapters (vide d'adapters au départ ; TS s'y branche quand T01 existe).
- `snapshot(source, commit)` : arbre → structure → nœuds `file` → symboles des adapters disponibles → `GraphSnapshot::validate()`.
- `meta` du snapshot : commit, date, detector utilisé, adapters utilisés, nombre de fichiers ignorés, avertissements.

## Critères d'acceptation

- [x] Sur `tiny` : snapshot `insta` du graphe (repo → dossiers → fichiers) du dernier commit.
- [x] Les nœuds et ids sont identiques entre deux exécutions et entre deux constructions de la fixture.
- [x] Un fichier binaire ou exclu n'apparaît pas ; il est compté dans `meta`.

## Baseline

`just test-summary` sur `develop` (bc7d5c5) : cargo 81 passed, 0 failed ; web 2 passed, 0 failed.

## Décisions d'orchestration

- Ids de module (`pkg:<repo>/<dir>`, D01) : hors périmètre d'I01. Ni le ticket ni `spec.md` ni les ADR ne fixent un segment module ; I01 reprend les ids produits par le detector tels quels. À trancher dans un ticket de modèle (segment `mod:` dans `relief-model`) avant que relief-diff s'appuie dessus.
- `content_hash` des fichiers (FNV-1a maison, D01) : conservé dans I01. Il est déterministe, ce que demande le critère « ids et nœuds identiques entre deux exécutions ». Le cache de `spec.md` est indexé par l'oid du blob git, indépendamment de `content_hash` ; le remplacement éventuel par un hash standard (ou l'oid) relève du ticket cache, pas d'I01.

## Seams

1. `relief_index::Indexer::snapshot(&source, commit)` sur un dépôt de fixture (`relief-fixtures` : `tiny`, plus si besoin un petit dépôt construit dans le test avec un fichier binaire et un fichier exclu), test d'intégration `crates/relief-index/tests/snapshot.rs` avec snapshot `insta` du graphe et de `meta`. Attrape : forme repo → dossiers → fichiers, `validate()`, déterminisme entre deux exécutions et deux constructions de la fixture, exclusion et comptage dans `meta`, contenu de `meta` (commit, date, detector, adapters vides). Rate : le branchement d'un vrai adapter (aucun n'existe avant T01) et les performances.

## Red

- Fichiers de test : `crates/relief-index/tests/snapshot.rs`, `crates/relief-index/tests/snapshots/snapshot__tiny_head_graph.snap` (écrit à la main, à relire), dev-dependencies ajoutées à `crates/relief-index/Cargo.toml`
- Lancer : `cargo test -p relief-index --test snapshot`
- API supposée : `Indexer::new(repo_name: &str)`, `Indexer::snapshot(&GitSource, &CommitId) -> Result<IndexedSnapshot, _>`, `IndexedSnapshot { graph: GraphSnapshot, meta: SnapshotMeta }` ; `meta` sérialisé en JSON `{commit, date (ISO UTC du commit), detector: "generic", adapters: [], ignoredFiles, warnings: []}`. Le nom du repo est passé explicitement (déterminisme : ne pas le tirer du chemin du dépôt).
- En échec : 4 tests (le fichier ne compile pas : `relief_index::Indexer` et `relief_index::IndexedSnapshot` n'existent pas)
  - tiny_head_graph_is_repo_then_folders_then_files — symbole manquant ; snapshot repo → `pkg:tiny/src` → `a.ts`, `c.ts` du dernier commit
  - tiny_head_meta_describes_the_run — symbole manquant ; meta commit/date/detector/adapters/ignoredFiles/warnings
  - two_runs_and_two_builds_give_identical_nodes — symbole manquant ; mêmes graphes entre deux exécutions et deux constructions
  - binary_and_excluded_files_are_left_out_and_counted — symbole manquant ; fichier binaire, `.png` et `node_modules` absents, `ignoredFiles` = 3

## Green

- Fichiers : `crates/relief-index/src/lib.rs`, `crates/relief-index/Cargo.toml`, `crates/relief-git/src/lib.rs`, `Cargo.lock`
- Changement : `Indexer` (detector générique + registre d'adapters via le trait `LanguageAdapter`, vide pour l'instant), `snapshot()` = `list_tree` → detector → adapters → `validate()`, avec `SnapshotMeta` (date ISO UTC calculée sans dépendance). Ajout de `GitSource::commit_time` dans `relief-git` (la date du commit n'était pas exposée). `ignoredFiles` = entrées de l'arbre moins nœuds `file`.
- Suite : cargo 85 passed, 0 failed (baseline 81/0) ; web 2/0 ; lint propre.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `crates/relief-index/src/lib.rs` : l'adapter retrouve le chemin du fichier en découpant `id.to_string()` sur `::file:` ; fragile. Table id → chemin, ou champ chemin sur le nœud.
  - `read` cherche le blob par `entries.iter().find(..)` : quadratique. `HashMap<path, blob>` avant l'appel au detector.
  - Un blob illisible est ignoré en silence (`.ok()`) et `warnings` reste vide : y remonter ces échecs, ou retirer le champ.
  - Aucun test ne passe par un adapter (`with_adapter`, `LanguageAdapter`, `meta.adapters`) : test avec un faux adapter au plus tard dans T01.
  - `iso_utc` : test unitaire sur l'époque 0, un 29 février, un timestamp avant 1970. `detector_name` figé à "generic" à côté du `Box<dyn Detector>` : le detector pourrait exposer son nom.
- Décisions d'orchestration (ids de module, `content_hash`) : acceptées.

## Answer

- Construit : `relief_index::Indexer` (detector générique + registre d'adapters `LanguageAdapter`, vide), `snapshot(&GitSource, &CommitId) -> IndexedSnapshot { graph, meta }` : arbre → detector → adapters par fichier → `validate()`. `SnapshotMeta` : commit, date ISO UTC (heure du committer, `GitSource::commit_time` ajouté dans relief-git), detector, adapters, `ignoredFiles` (entrées de l'arbre sans nœud `file`), warnings.
- Décisions : ids de module `pkg:<repo>/<dir>` et `content_hash` FNV-1a de D01 conservés (voir « Décisions d'orchestration ») ; le nom du repo est passé à `Indexer::new` pour ne pas dépendre du chemin du dépôt.
- Vérifié : `cargo test -p relief-index --test snapshot` (4 tests, snapshot `insta` relu) ; suite cargo 85/0, web 2/0 (baseline 81/0, 2/0) ; `just lint` propre. Pas d'UI, pas de doc utilisateur (ticket interne).
