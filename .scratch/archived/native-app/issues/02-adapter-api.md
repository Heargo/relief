# Contrats des extracteurs dans `relief-adapter-api`

Status: resolved
Type: task
Blocked by: N01
UI: non
Doc: non (interne)

Spec: `../spec.md` (Décisions : couches) ; ADR 0008

## À faire

- Nouvelle crate `src/analysis/relief-adapter-api` : `LanguageAdapter`, `Detector`, `Extraction`, `LinkContext` (déplacés de `relief-index` et `relief-detect`), sérialisables comme aujourd'hui.
- `relief-lang-ts` et `relief-detect` dépendent de `relief-adapter-api` et `relief-model`, plus de `relief-index`.
- `relief-index` reçoit ses adapters et detectors de l'appelant ; il n'en nomme aucun. L'enregistrement de `TsAdapter` remonte au binaire (aujourd'hui `relief-cli` et `relief-server`, en attendant `relief-desktop`).
- Supprimer les placeholders `crate_name()` de toutes les crates.

## Critères d'acceptation

- [x] `cargo tree -p relief-lang-ts` et `cargo tree -p relief-detect` ne contiennent pas `relief-index`.
- [x] `relief-index` ne dépend d'aucune crate `relief-lang-*`.
- [x] Suite verte, mêmes comptes que la baseline (au déplacement de tests près).

## Baseline

Après N01 (`b257c46`) : `just test-summary` → cargo 386 passed, web 308 passed ; `just lint` propre.

## Décisions (orchestrateur)

- `relief-adapter-api` (`src/analysis/relief-adapter-api`, dépend de `relief-model` seulement) exporte `LanguageAdapter`, `LinkContext`, `Extraction` (déplacés de `relief-index`, inchangés) et `Detector` + `Detection` (déplacés de `relief-detect`).
- Le trait `Detector` devient : `fn detect(&self, repo_name: &str, paths: &[&str], read_blob: &dyn Fn(&str) -> Option<Vec<u8>>) -> Option<Detection>` (`None` = « ce n'est pas mon type de projet »). `Detection` garde ses champs actuels (`detector`, `nodes`, `edges`, `warnings`, `package_dirs`).
- `relief-detect` : `WorkspacesDetector` (npm/pnpm/yarn, `None` sans workspace) et `GenericDetector` (toujours `Some`) implémentent `Detector`. `relief_detect::default_detectors() -> Vec<Box<dyn Detector>>` rend la chaîne actuelle (workspaces puis générique). `relief_detect::detect(...)` reste, comme raccourci qui parcourt cette chaîne (tests existants inchangés).
- `relief-index` ne dépend plus ni de `relief-detect` ni d'aucun `relief-lang-*`. `Indexer::new(repo_name)` n'a aucun detector ni adapter ; `with_detector(Box<dyn Detector>)` et `with_detectors(Vec<Box<dyn Detector>>)` les ajoutent, `with_adapter` reste. Les detectors sont essayés dans l'ordre d'enregistrement, le premier `Some` gagne ; si aucun ne répond, `snapshot` renvoie `IndexError::NoDetector`.
- Composition : `relief-server` (`analysis.rs`) et `relief-cli` enregistrent `default_detectors()` et `TsAdapter` eux-mêmes.
- Les tests d'intégration qui assemblent index + adapter TS + detectors sur une fixture quittent `relief-lang-ts` (qui ne peut plus dépendre de `relief-index`, même en dev-dependency, puisque `cargo tree` les montre) pour une crate de tests `tests/relief-integration` (sans `src/` utile, `publish = false`), qui dépend de git, index, detect, lang-ts, fixtures. Les tests de `relief-diff` et `relief-index` qui construisent un `Indexer` ajoutent les detectors (et l'adapter) explicitement.
- Les `crate_name()` disparaissent, avec les tests `skeleton.rs` qui ne testent qu'eux.

## Seams

1. **Types publics de `relief-adapter-api` et `relief-detect`** (tests de `relief-detect`, sans git) : `WorkspacesDetector` rend `None` hors workspace et `Some` sur un workspace, `GenericDetector` rend toujours `Some`, `default_detectors()` donne le même résultat que `detect()`. Attrape : contrat `Detector` et chaîne par défaut. Rate : l'assemblage dans l'index.
2. **`Indexer` sur un dépôt de fixture** (tests de `relief-index`, avec un detector et un adapter factices définis dans le test, aucune dépendance à `relief-detect` ni `relief-lang-*`) : seuls les detectors fournis sont utilisés, dans l'ordre, le premier `Some` gagne, `NoDetector` sans réponse, l'adapter fourni est appliqué. Attrape : l'index ne choisit plus rien. Rate : le câblage réel des binaires (couvert par les tests CLI/API existants).
3. **Graphe des crates** (`tests/relief-integration/tests/layers.rs`, via `cargo metadata`, toutes sortes de dépendances confondues) : `relief-lang-ts` et `relief-detect` ne dépendent pas de `relief-index` ; `relief-index` ne dépend d'aucun `relief-lang-*` ni de `relief-detect` ; `relief-adapter-api` ne dépend que de `relief-model` parmi les crates relief. Attrape : les critères `cargo tree` du ticket, durablement. Rate : rien du comportement.

## Red

- Fichiers de test : `src/analysis/relief-detect/tests/detectors.rs` (seam 1), `src/analysis/relief-index/tests/detectors.rs` (seam 2), `tests/relief-integration/tests/layers.rs` (seam 3). Déplacés dans `tests/relief-integration/tests/` (avec imports/detectors adaptés) : `cache.rs`, `http_edges.rs`, `refs_resolution.rs`, `indexer.rs`, `imports_resolution.rs` (depuis `relief-lang-ts`), `index_snapshot.rs` (ex `relief-index/tests/snapshot.rs`, avec son snapshot `snapshots/index_snapshot__tiny_head_graph.snap`). Adaptés : `generic.rs` (detect), `content_hash.rs`, `signature_compare.rs` (lang-ts), tests de `relief-diff` (`with_detectors(default_detectors())`, `relief_adapter_api::LanguageAdapter`). Supprimés : tous les `skeleton.rs`.
- Mise en place hors tests : crate `relief-adapter-api` réduite à un stub (`Cargo.toml` + `lib.rs` vide, nécessaire pour que le workspace se résolve) ; crate `tests/relief-integration` (membre du workspace) ; `[dev-dependencies]` ajoutées (`relief-adapter-api` dans detect, index, lang-ts, diff ; `relief-detect` dans diff).
- Écart au brief : les tests de `relief-index` qui utilisaient les vrais detectors (tiny, acme-shop, bad-package-json, fichiers binaires) sont déplacés dans `relief-integration` (`index_snapshot.rs`), car `relief-index` ne peut pas avoir `relief-detect` même en dev-dependency (seam 3, tous types de dépendances). `relief-index` garde `tests/detectors.rs` avec detectors factices. Le `[dependencies] relief-detect` de `relief-index` est encore là (le green le retire) ; les `crate_name()` des `src/` aussi.
- Lancer : `cargo test -p relief-detect --test detectors`, `cargo test -p relief-index --test detectors`, `cargo test -p relief-integration --test layers` (et les autres fichiers de `tests/relief-integration/tests/`)
- En échec :
  - `relief-detect/detectors.rs` (5 tests : workspaces_detector_answers_none_without_workspace, workspaces_detector_answers_on_a_workspace, generic_detector_always_answers, default_chain_is_workspaces_then_generic, default_chain_gives_the_same_result_as_detect) — ne compile pas : `relief_adapter_api::{Detector, Detection}`, `WorkspacesDetector`, `default_detectors` n'existent pas.
  - `relief-index/detectors.rs` (5 tests : first_detector_that_answers_wins, with_detector_registers_in_call_order, no_detector_registered_is_an_error, every_detector_declining_is_an_error, the_adapter_provided_is_reported_in_meta) — ne compile pas : `relief_adapter_api::{Detector, Detection, Extraction, LanguageAdapter}`, `with_detectors`, `with_detector`, `IndexError::NoDetector` manquants.
  - `relief-integration/layers.rs` — `lang_ts_does_not_depend_on_the_index` et `index_depends_on_no_language_crate_nor_detect` échouent à l'assertion ; `detect_does_not_depend_on_the_index` et `adapter_api_depends_only_on_model` passent déjà (stub, detect sans index).
  - Tests déplacés/adaptés (`relief-integration` : cache, http_edges, refs_resolution, indexer, imports_resolution, index_snapshot ; `relief-lang-ts` : content_hash, signature_compare ; `relief-detect` : generic ; `relief-diff` : acme_moves, acme_coupling, acme_format_only, impact_acme, signature_diff) — ne compilent plus : `relief_adapter_api::*`, `with_detectors`, `default_detectors` manquants. Leur comportement attendu est inchangé (comptes de la baseline à retrouver au vert, moins les `skeleton.rs`).

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/relief-detect/src/{lib,generic,workspaces}.rs`, `src/analysis/relief-index/src/{lib,cache}.rs`, `src/analysis/lang/relief-lang-ts/src/{lib,resolve}.rs`, `src/interfaces/relief-server/src/{analysis,lib}.rs`, les `Cargo.toml` (detect, index, lang-ts, server), `crate_name()` retirés de toutes les crates, `docs/dev/rules.md`
- Changement : `relief-adapter-api` porte `LanguageAdapter`, `LinkContext`, `Extraction`, `Detector` (rend `Option<Detection>`) et `Detection`. `relief-detect` ajoute `WorkspacesDetector` et `default_detectors()` (`detect()` parcourt cette chaîne, `Detection` réexporté). `Indexer` n'a plus de detector par défaut : `with_detector(s)`, `IndexError::NoDetector`, plus de dépendance à `relief-detect`. `relief-lang-ts` dépend de `relief-adapter-api`. La composition est dans `relief_server::analysis::indexer` (la CLI l'utilise déjà).
- Suite : `cargo test --workspace` 391 réussis / 0 échoué (baseline cargo 386, skeletons retirés, tests de détecteurs et de couches ajoutés) ; clippy (`-D warnings`) et `cargo fmt --check` propres.
- Questions ouvertes : `GenericDetector` émet désormais l'avertissement « package.json invalide » à la racine (avant fait par `detect()` quand workspaces déclinait) pour garder le comportement ; `cargo clippy --all-targets` échoue sur des `unwrap` de `relief-model/tests/contract_api` (hors périmètre, non couvert par `just lint`).

## Answer

- Nouvelle crate `src/analysis/relief-adapter-api` (dépend de `relief-model` seulement) : `LanguageAdapter`, `LinkContext`, `Extraction`, `Detector` et `Detection`. `Detector::detect` rend `Option<Detection>` (`None` : pas mon type de projet).
- `relief-detect` : `WorkspacesDetector`, `GenericDetector`, `default_detectors()` (workspaces puis générique) ; `detect()` reste comme raccourci sur cette chaîne. L'avertissement « package.json invalide » à la racine est émis par `GenericDetector` (le detector workspaces ne peut pas renvoyer d'avertissement avec `None`).
- `relief-index` ne dépend plus ni de `relief-detect` ni de `relief-lang-*` : `with_detector`, `with_detectors`, `with_adapter`, et `IndexError::NoDetector` si aucun detector ne répond. `relief-lang-ts` dépend de `relief-adapter-api` au lieu de l'index.
- Composition : `relief_server::analysis::indexer` enregistre `default_detectors()` et `TsAdapter`, partagé par la CLI et l'API, en attendant `relief-desktop` (N03, N05).
- Les tests qui assemblent index, detectors et adapter TS sur une fixture sont dans la nouvelle crate de tests `tests/relief-integration`, avec `layers.rs` qui verrouille le sens des dépendances via `cargo metadata`. Les `crate_name()` et les `skeleton.rs` sont supprimés. `docs/dev/rules.md` (Structure, Couches) est à jour.
- Après review : le `expect` de `detect()` est remplacé par `unwrap_or_default()` (`Detection` dérive `Default`).
- Vérifié : cargo 391 passed (baseline 386, moins les `skeleton.rs`, plus 11 tests de detectors et de couches), web 308 passed, `just lint` propre, `cargo tree -p relief-lang-ts` et `-p relief-detect` sans `relief-index`, `cargo tree -p relief-index` sans `relief-detect` ni `relief-lang-*`. Pas de doc utilisateur : ticket interne.
