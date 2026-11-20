# Couche application `relief-app` et `Session`

Status: resolved
Type: task
Blocked by: N02
UI: non
Doc: non (interne)

Spec: `../spec.md` (Décisions : couches) ; ADR 0008

## À faire

- Nouvelle crate `src/app/relief-app` : `Session::open(path, options)` puis `snapshot`, `diff`, `review_summary`, `code`, `meta` (dépôt, plage d'ouverture, branches, tags).
- Requêtes typées : `RangeSpec` (parsé une fois, `A...B`, `A..B`, working tree, staged), `NodeId`, `Side` (base, head). Erreur unique `AppError` avec un code stable (`invalid_range`, `unknown_ref`, `unknown_node`, `not_a_repository`, `index`) ; `thiserror`.
- Y déplacer `relief_server::analysis` et la logique des handlers. La `Session` garde le dépôt ouvert et mémorise les snapshots des commits réels ; working tree et index sont recalculés.
- `relief-server` et `relief-cli` deviennent des appels à `relief-app`, sans logique (ils disparaissent en N07).

## Critères d'acceptation

- [x] Tests d'intégration de `relief-app` sur la fixture acme-shop : chaque cas d'usage, et chaque code d'`AppError`.
- [x] Deux `session.snapshot` successifs sur le même commit réel n'indexent qu'une fois (compteur ou `meta` exposé par la `Session`).
- [x] `relief-server` ne contient plus de module `analysis` ; ses handlers ne parsent plus de `HashMap` à la main.
- [x] Snapshots `insta` de l'API et de la CLI inchangés.

## Baseline

Après N02 (`df0652b`) : cargo 391 passed, web 308 passed ; `just lint` propre.

## Décisions (orchestrateur)

- Crate `src/app/relief-app` (membre du workspace : ajouter `src/app/*`). Dépendances normales : `relief-model`, `relief-diff`, `relief-git`, `relief-index`, `relief-adapter-api`, `thiserror`. **Jamais** `relief-detect`, `relief-lang-*`, `relief-server`, `relief-cli` (sauf en dev-dependencies pour les tests).
- `LanguageAdapter` et `Detector` deviennent `Send + Sync` (supertraits dans `relief-adapter-api`), pour qu'une `Session` soit partageable entre threads.
- `SessionOptions { cache_dir: Option<PathBuf>, range: Option<RangeSpec>, detectors: Vec<Box<dyn Detector>>, adapters: Vec<Box<dyn LanguageAdapter>> }` : l'appelant (composition root) fournit detectors et adapters. `Session::open(path, options) -> Result<Session, AppError>` ouvre le dépôt et vérifie la plage d'ouverture. `Session: Send + Sync`.
- `RangeSpec::parse(&str) -> Result<RangeSpec, AppError>` : `A...B` (merge-base), `A..B`, `REV` seul (REV contre le working tree), plus les constructeurs `RangeSpec::worktree()` (HEAD contre le working tree, le défaut) et `RangeSpec::staged()` (HEAD contre l'index). `Side { Base, Head }`.
- Cas d'usage (méthodes de `Session`, `&self`) : `meta() -> MetaResponse`, `snapshot(&SnapshotRequest { rev })`, `diff(&DiffRequest { range: Option<RangeSpec> })` (sans plage : celle d'ouverture), `review_summary(&ReviewSummaryRequest { range })`, `code(&CodeRequest { node: NodeId, side: Side, range })`. Ils rendent les types de `relief-model` que l'API renvoie aujourd'hui (le green choisit, sans changer le JSON). La CLI peut avoir besoin d'une variante qui rend aussi les snapshots et les avertissements (`relief diff` texte) : à exposer par `relief-app`, pas recalculer dans la CLI.
- `AppError` (`thiserror`) avec `code() -> &'static str` parmi `invalid_range`, `unknown_ref`, `unknown_node`, `not_a_repository`, `index`.
- Mémoire : la `Session` mémorise le snapshot de chaque commit réel ; working tree et index sont recalculés à chaque appel. Exposer `Session::indexed_count() -> usize` (nombre d'indexations réellement faites) pour le tester.
- `relief_server::analysis` disparaît (son contenu va dans `relief-app`). `AppState` détient une `Arc<Session>`. Les handlers extraient leurs paramètres par des structs `Deserialize` (`Query<SnapshotQuery>`...) au lieu de `HashMap`, construisent la requête typée, appellent la session et convertissent `AppError` → `ApiFailure`. **Les réponses HTTP (statut, `code`, corps) et les snapshots insta de l'API et de la CLI ne changent pas** ; les messages d'erreur pour un paramètre manquant peuvent venir de l'extracteur tant que les tests existants passent.
- Composition root : `relief-cli` (`main.rs`) construit les `SessionOptions` avec `relief_detect::default_detectors()` et `TsAdapter`, ouvre la `Session` et la passe au serveur ou l'utilise pour `show`/`diff`. `relief-server` ne dépend plus de `relief-lang-ts` ni de `relief-detect` en dépendances normales (dev-dependencies pour ses tests, qui construisent eux-mêmes leur `Session`).

## Seams

1. **Cas d'usage de `relief-app` sur la fixture acme-shop** (`src/app/relief-app/tests/`, avec `relief-fixtures`, `default_detectors()` et `TsAdapter` en dev-dependencies) : `meta`, `snapshot`, `diff`, `review_summary`, `code` (base et head, symbole déplacé), chaque code d'`AppError` (`invalid_range`, `unknown_ref`, `unknown_node`, `not_a_repository`, `index` — pour ce dernier, une `Session` sans detector suffit), `RangeSpec::parse`, et la mémoire (`indexed_count` : deux `snapshot` du même commit réel = 1, deux du working tree = 2). Attrape : la couche application. Rate : la traduction HTTP.
2. **API HTTP et CLI existantes** (tests `relief-server` en `oneshot`, `relief-cli` en `assert_cmd` + insta) : inchangées sauf la construction de l'état (`AppState::new(Arc<Session>)` ou équivalent, au choix de red, à écrire dans `## Red`). Attrape : interfaces minces sans régression. Rate : rien de neuf.
3. **Graphe des crates** (`tests/relief-integration/tests/layers.rs`, étendu) : `relief-app` ne dépend (dépendances normales) d'aucun `relief-lang-*`, ni de `relief-detect`, `relief-server`, `relief-cli` ; `relief-server` ne dépend (normales) d'aucun `relief-lang-*` ni de `relief-detect`. Attrape : une seule composition root. Rate : le comportement.

## Red

- Fichiers de test : `src/app/relief-app/tests/{use_cases,errors,memory}.rs` (+ `common/mod.rs`), `src/interfaces/relief-server/tests/{api,review_summary,docs}.rs` (construction de l'état seulement), `tests/relief-integration/tests/layers.rs`. Mis en place : `src/app/relief-app/{Cargo.toml,src/lib.rs vide}`, `src/app/*` dans le workspace, dev-dependencies `relief-app`/`relief-detect`/`relief-lang-ts` de `relief-server`.
- API exacte choisie : `AppState::new(Arc<Session>, ServerOptions) -> AppState` (infaillible ; remplace `AppState::open`) ; `ServerOptions { ui: Ui, docs_dir: Option<PathBuf> }` (Default ; `cache_dir` et `range` partent dans `SessionOptions`). `relief-app` exporte à la racine : `Session`, `SessionOptions { cache_dir, range: Option<RangeSpec>, detectors, adapters }` (champs publics, construit en littéral complet), `RangeSpec` (`parse`, `worktree`, `staged` ; `Clone`, `Debug`), `Side { Base, Head }`, `AppError` (`code()`, `Debug`), `SnapshotRequest { rev: String }`, `DiffRequest { range: Option<RangeSpec> }`, `ReviewSummaryRequest { range: Option<RangeSpec> }`, `CodeRequest { node: NodeId, side, range: Option<RangeSpec> }`. `Session::meta() -> MetaResponse` (infaillible), `snapshot -> Result<SnapshotResponse, AppError>` (`PartialEq`), `diff -> Result<DiffResponse, _>`, `review_summary -> Result<ReviewSummary, _>`, `code -> Result<String, _>`, `indexed_count() -> usize`. `Session::open` accepte aussi `rev` = `WORKTREE`/`INDEX` dans `snapshot`. Un range sans plage ni ouverture = working tree. Code `unknown_node` aussi pour un chemin forgé / nœud absent du côté demandé.
- Lancer : `cargo test -p relief-app --test use_cases` (idem `errors`, `memory`) ; `cargo test -p relief-server --test api` (idem `review_summary`, `docs`) ; `cargo test -p relief-integration --test layers`
- En échec : 
  - `relief-app` `use_cases`, `errors`, `memory` : ne compilent pas, symboles absents de `relief_app` (`Session`, `SessionOptions`, `RangeSpec`, requêtes, `AppError`...), tous les tests.
  - `relief-server` `api`, `review_summary`, `docs` : ne compilent pas, `relief_app` sans `Session`/`SessionOptions`/`RangeSpec` et `AppState::new` absent (tous leurs tests, assertions inchangées).
  - `layers::server_depends_on_no_extractor` — `relief-server` dépend (normal) de `relief-detect` et `relief-lang-ts`.
  - `layers::server_goes_through_the_app_layer` — `relief-server` ne dépend pas de `relief-app`.
  - `layers::app_depends_on_no_extractor_nor_interface` passe déjà (crate vide) : garde-fou pour le green.

## Green

- Fichiers : `src/app/relief-app/src/{lib,error,range}.rs` ; `src/interfaces/relief-server/{Cargo.toml,src/lib.rs}` (`analysis.rs` supprimé) ; `src/interfaces/relief-cli/{Cargo.toml,src/main.rs}` ; `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/lib.rs`, `src/analysis/relief-index/src/lib.rs` ; `src/domain/relief-model/src/graph.rs` ; `docs/dev/rules.md`, `README.md`
- Changement : `relief-app` porte `Session` (mémoire des snapshots de commits réels, `indexed_count`), `RangeSpec`, `AppError` et l'ancienne `analysis` (+ `analyse` qui rend aussi snapshots et avertissements, `default_cache_dir`). `LanguageAdapter`/`Detector` sont `Send + Sync` ; nouvelle méthode `LanguageAdapter::symbol_signatures` (défaut vide, implémentée par `TsAdapter`) pour que l'app n'appelle plus `TsAdapter`, `Indexer::adapters()` ajouté, `GraphSnapshot.commit` rendu public (les tests le lisent). Le serveur est mince (`Params<T>` sur `Query<struct>` avec rejet JSON `bad_request`, `AppError` -> `ApiFailure`, mêmes statuts/codes/corps) ; la CLI compose détecteurs et adapter et passe par la `Session`.
- Suite : cargo 422 réussis / 0 échoué (baseline 391 + nouveaux tests) ; `cargo clippy --workspace -- -D warnings` et `cargo fmt --check` propres ; `just` absent de la machine, web et `ng build` non relancés (UI non touchée) ; aucun fichier de test modifié.
- Questions ouvertes : `AmbiguousRef` a le code `invalid_range` (HTTP reste 400 `bad_request`) ; `NoCommits` et l'absence de dossier de cache ont le code `index`.

## Answer

- Nouvelle crate `src/app/relief-app` : `Session::open(path, SessionOptions)` puis `meta`, `snapshot`, `diff`, `review_summary`, `code`, et `analyse` (diff avec snapshots et avertissements, pour `relief diff`). Requêtes typées (`RangeSpec` parsé une fois, `Side`, `NodeId`), `AppError` avec `code()` (`invalid_range`, `unknown_ref`, `unknown_node`, `not_a_repository`, `index`). La `Session` garde le dépôt ouvert et mémorise les snapshots des commits réels (`indexed_count()`), working tree et index recalculés. Le verrou n'est pas tenu pendant l'indexation.
- `relief_server::analysis` supprimé ; les handlers extraient des `Query<struct>`, appellent la `Session` et traduisent `AppError` en `ApiFailure` avec les mêmes statuts, codes et corps. `AppState::new(Arc<Session>, ServerOptions)`. `relief-server` ne dépend plus de `relief-detect` ni de `relief-lang-ts`.
- Composition root : `relief-cli` construit `SessionOptions` avec `default_detectors()` et `TsAdapter`, et passe par la `Session` pour `show`, `diff` et `serve`.
- Contrat des adapters : `LanguageAdapter` et `Detector` sont `Send + Sync` ; `LanguageAdapter::symbol_signatures` (défaut vide) remplace l'appel en dur à `TsAdapter` pour les textes de signatures ; `Indexer::adapters()` en lecture.
- Correspondances choisies : référence ambiguë → `invalid_range` (HTTP 400 `bad_request` comme avant) ; dépôt sans commit et absence de dossier de cache → `index`.
- Après review : arbre de `docs/dev/rules.md` corrigé (`src/app/`), `GraphSnapshot.commit` remis privé (le test lit `commit()`, changement d'une ligne accepté par l'utilisateur).
- Restent en Consider : double indexation possible sur deux requêtes concurrentes du même commit, clone du snapshot à chaque lecture en mémoire (un `Arc` l'éviterait), mémoire non bornée sur de longues plages.
- Vérifié : cargo 422 passed (baseline 391 + tests de `relief-app` et de couches), web 308, e2e 58, `just lint` propre, `just contract` sans diff, snapshots insta de l'API et de la CLI inchangés. Pas de doc utilisateur : ticket interne.
