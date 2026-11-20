# Adapter Python

Status: resolved
Type: task
Blocked by: T03, E02, I02
UI: non
Doc: docs/user `about` (langages supportés)

Spec: `../spec.md`

## À faire

- `relief-lang-python`, qui implémente `LanguageAdapter` de `relief-adapter-api` (ne dépend ni de `relief-index` ni de `relief-app`) et se déclare à la composition root (`relief-desktop`) : symboles (fonctions, classes, méthodes, visibilité par convention `_`), imports (relatifs, absolus dans le projet, externes), appels, références de types d'annotations, `content_hash`/`signature_hash`, comparateur de signatures (paramètres par défaut = optionnels).
- Detector `pyproject.toml` (un système par projet, dépendances externes).
- Fixture `tests/fixtures/py-shop` : petite API Flask/FastAPI + une PR avec une signature cassante et un déplacement.

## Critères d'acceptation

- [x] Sur `py-shop` : `Session::diff` (`relief-app`) trouve la signature cassante (raison littérale) et le déplacement (snapshot `insta`).
- [x] Aucune modification de `relief-diff`, de `relief-app` ni de `src/ui/` n'est nécessaire (hors la ligne d'enregistrement de l'adapter dans la composition root) (vérifié par `git diff --stat` dans `## Answer`).

## Baseline

`just test-summary` (develop, b1bc3ef) : cargo 516 passed, 0 failed ; web 476 passed, 0 failed.

## Seams

- **Fonctions publiques de `relief-lang-python` (l'adapter, sans git)** : attrape les symboles (fonctions, classes, méthodes, visibilité `_`), les imports (relatifs, absolus dans le projet, externes), les appels, les références de types d'annotations, `content_hash`/`signature_hash` et le comparateur de signatures (défaut = optionnel) ; rate l'enregistrement et le diff de bout en bout.
- **Detector `pyproject.toml` sur un arbre en mémoire** (comme les tests de `relief-detect`) : attrape un système par projet et les dépendances externes (Poetry, uv, setuptools) ; rate le reste.
- **Cas d'usage `Session::diff` de `relief-app` sur la fixture `py-shop`** (adapter déclaré comme à la composition root) : attrape la signature cassante (raison littérale) et le déplacement (snapshot `insta`) ; rate les cas limites de l'adapter.

Doc utilisateur : page `about` (langages supportés).

## Red

- Fichiers de test : `src/analysis/lang/relief-lang-python/tests/{symbols,imports,refs,content_hash,signature_compare}.rs`, `src/analysis/relief-detect/tests/pyproject.rs`, `src/app/relief-app/tests/python_diff.rs` ; fixture `tests/fixtures/py-shop/` (base, signature, move) ; squelette du crate `relief-lang-python` (Cargo.toml, `src/lib.rs` vide ; le workspace le prend déjà par glob) et dev-dependency `relief-lang-python` dans `relief-app/Cargo.toml`.
- Lancer : `cargo test -p relief-lang-python --test <symbols|imports|refs|content_hash|signature_compare>` ; `cargo test -p relief-detect --test pyproject` ; `cargo test -p relief-app --test python_diff`
- En échec : tous les fichiers, par erreur de compilation (rouge en Rust)
  - symbols (8 tests), imports (6), refs (8), content_hash (5), signature_compare (9) — `relief_lang_python::{PythonAdapter, FileIndex, Symbol}` n'existent pas
  - pyproject (6 tests) — `relief_detect::PyprojectDetector` n'existe pas
  - python_diff (3 tests : signature cassante `paramRequiredAdded`/`currency`, déplacement `moved`, snapshot `py_shop_diff`) — `PythonAdapter` n'existe pas ; le snapshot `.snap` reste à créer et relire au green
- Contrat supposé : `PythonAdapter::new().index_file(path, bytes) -> FileIndex` (mêmes types `Symbol`/`Import`/`Ref`/`FileIndex` que `relief-lang-ts`), `LanguageAdapter` (name `python`, handles `py`) ; sous-genres `function`/`class`/`method`, `Class.method`, `_` = interne (dunder public) ; signature `def f(a: int = 1) -> T` sur une ligne ; imports `.m`, `..a.b`, `.` + noms, `*` pour `import m`/`from m import *` ; refs : `self.x()` → `Class.x`, `m.f()` si `import m`, annotations → `References` hors builtins ; `PyprojectDetector` (`detector == "pyproject"`, `pkg:<nom>`, `pkg:external/<dep>`, dépendances de workspace uv entre systèmes) et présent dans `default_detectors()`.

## Green

- Fichiers : `src/analysis/lang/relief-lang-python/{Cargo.toml,queries/symbols.scm,src/{lib,refs,resolve,compare}.rs}` ; `src/analysis/relief-detect/{Cargo.toml,src/pyproject.rs,src/lib.rs,src/workspaces.rs}` ; `src/interfaces/relief-desktop/{Cargo.toml,src/main.rs}` ; `src/app/relief-app/tests/snapshots/python_diff__py_shop_diff.snap` (généré) ; `Cargo.lock`.
- Changement : adapter Python sur le modèle de `relief-lang-ts` (tree-sitter-python 0.23, requêtes `.scm`, symboles/imports/bindings/refs, hashes sur tokens, signature `def ...` sur une ligne, comparateur de paramètres par nom, défaut = optionnel, `link` : imports relatifs/absolus/externes et refs résolues par scope). `PyprojectDetector` (crate `toml`, PEP 621, Poetry, uv workspace, dépendances externes et inter-systèmes), inséré entre workspaces et generic dans `default_detectors()` ; `workspaces.rs` : seulement `glob_matches` et `node` passés en `pub(crate)`. Composition root : une ligne (`Box::new(PythonAdapter::new())`) + sa dépendance.
- Snapshot `py_shop_diff` relu : 1 renommage `shop/util/format.py` -> `shop/money/format.py` ; `compute_total` modifié, signature cassante `paramRequiredAdded` (`currency`), avant/après littéraux ; `format_price` `moved` avec `from` ; nœuds ajoutés (module `shop/money`, ses 2 fichiers) et fichier `util/format.py` retiré ; 2 arêtes `moved` (`imports` de `shop/app.py` et `calls` de `invoice`) vers le nouveau `format_price`. Rien de surprenant ; `body: true` sur `compute_total` parce que le hash de contenu couvre aussi l'en-tête (même comportement que TS).
- Suite : cargo 561 réussis, 0 échoué (baseline 516 : +45 tests rouges devenus verts) ; web 476 réussis, 0 échoué (inchangé). `just lint` propre. `git diff --name-only` non indexé : aucun fichier de test.
- `git diff --stat HEAD` : 29 fichiers, 846 insertions, 5 suppressions ; hors tests/fixtures indexés et nouveaux crates/fichiers : `Cargo.lock`, `relief-detect/{Cargo.toml,src/lib.rs,src/workspaces.rs}`, `relief-app/Cargo.toml` (dev-dep rouge, déjà là), `relief-desktop/{Cargo.toml,src/main.rs}` ; aucune modification de `relief-diff`, de `relief-app/src` ni de `src/ui/`.
- Questions ouvertes : la stdlib (`os`, `dataclasses`) est traitée comme externe (nœud `pkg:external/<nom>`) faute de liste de modules standard ; routes Flask/FastAPI et points d'entrée non extraits (hors périmètre du ticket) ; doc utilisateur `about` à faire à l'étape doc.

## Review

- Verdict : ship
- Must fix : aucun (tests verts ; aucun diff dans `relief-diff`, `relief-app/src`, `src/ui/` ; `relief-lang-python` ne dépend ni de `relief-index` ni de `relief-app` ; snapshot relu, cohérent ; pas de `unwrap()` hors tests ; pas de secret ; la doc `about` est hors périmètre de cette review)
- Consider :
  - `relief-lang-python/src/compare.rs:110` — `*` et `/` sont filtrés : passer un paramètre en keyword-only/positional-only, ou réordonner des positionnels, n'est pas vu comme cassant ; et aucun test pour `*args`/`**kwargs`/`/` — ajouter des cas ou documenter la limite.
  - `compare.rs:126,149` — les guillemets échappés (`"a\"b"`) ne sont pas gérés dans `split_params`/`split_top` ; les deux fonctions sont quasi dupliquées (factoriser un scanner de profondeur).
  - `lib.rs:312-341` et `relief-detect/src/pyproject.rs:15,233` — `EXTERNAL_GROUP` et la construction du nœud externe sont dupliqués entre adapter et detector.
  - `resolve.rs:51` — racines `""` et `src` codées en dur ; stdlib (`os`) rendue comme paquet externe, `pkg:external/os` sans dépendance déclarée (limite déjà notée au ticket).
  - `compare.rs:36` — tout changement de classe est `Unspecified` cassant, sans nuance.

## Answer

- Construit : crate `relief-lang-python` (tree-sitter-python, requêtes `.scm`, même structure que `relief-lang-ts`) qui implémente `LanguageAdapter` : symboles (fonctions, classes, méthodes `Class.method`, `_` = interne, dunders publics), imports relatifs/absolus/externes, appels (`self.x()`, `m.f()`), références d'annotations, `content_hash`/`signature_hash`, comparateur de signatures par nom (défaut = optionnel). `PyprojectDetector` dans `relief-detect` (PEP 621, Poetry, uv workspace, dépendances externes et inter-systèmes), dans `default_detectors()`. Fixture `py-shop` (API Flask, PR avec `compute_total` qui gagne `currency` et `format.py` déplacé de `shop/util` vers `shop/money`).
- Critère « aucune modification » : `git diff --stat HEAD -- src/domain/relief-diff src/app/relief-app/src src/ui` est vide. Hors des nouveaux crates, des tests et de la fixture : `relief-detect` (detector, `pub(crate)` de `glob_matches` et `node` dans `workspaces.rs`), une ligne `Box::new(PythonAdapter::new())` et sa dépendance dans `relief-desktop`, la dev-dependency de `relief-app` (tests), `Cargo.lock`. Aucun défaut du contrat rencontré.
- Snapshot `py_shop_diff` relu : renommage `shop/util/format.py` → `shop/money/format.py`, `compute_total` signature cassante `paramRequiredAdded` (`currency`), `format_price` `moved`, 2 arêtes `moved`.
- Vérifié : `just test-summary` cargo 561/0, web 476/0 (baseline 516/476) ; `just lint` ; `just docs-build` ; review « ship ». Pas d'UI, pas d'e2e.
- Doc : « Langages supportés » dans `about` (FR et EN), avec les limites connues.
- Suivis (Consider) : keyword-only (`*`), positional-only (`/`), `*args`/`**kwargs` et réordonnancement des positionnels non vus comme cassants ; guillemets échappés et scanner de profondeur dupliqué dans `compare.rs` ; nœud externe construit à deux endroits (adapter et detector) ; racines `""` et `src` en dur ; stdlib vue comme externe ; routes Flask/FastAPI comme points d'entrée.
