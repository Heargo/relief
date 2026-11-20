# Constructeur de dépôts de fixture

Status: resolved
Type: task
Blocked by: F01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : format d'une fixture)

## À faire

- Crate `relief-fixtures` : `Fixture::load("tiny")` lit `fixtures/tiny/fixture.yaml` ; `fixture.build(dir) -> BuiltRepo` crée le dépôt git (via le binaire `git`, variables `GIT_AUTHOR_*`/`GIT_COMMITTER_*` fixes, `commit.gpgsign=false`), applique chaque commit en surcouche, gère `_delete.txt` et les branches.
- `BuiltRepo` expose le chemin, et le SHA de chaque commit par son `id`.
- Options pour les tests de commits virtuels : `build_with_worktree(dir, |wt| …)` qui laisse des modifications non commitées, indexées ou non, et des fichiers non suivis.
- Binaire `relief-fixtures build <nom> <dossier>` (recette `just fixture <nom> <dossier>`).
- Fixture `fixtures/tiny/` : 3 commits sur 2 dossiers (`src/a.ts`, `src/b.ts`, `docs/readme.md`), dont un renommage et une suppression.

## Critères d'acceptation

- [x] Construire deux fois `tiny` dans deux dossiers donne exactement les mêmes SHA (test).
- [x] Le dernier commit de `tiny` contient le renommage et la suppression attendus (`git ls-tree` dans le test).
- [x] Une fixture inconnue ou un `fixture.yaml` invalide donne une erreur qui nomme le fichier et le champ.

## Baseline

`just test-summary` sur `develop` (b813a44) : cargo 28 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **API publique de `relief-fixtures`** (`Fixture::load`, `Fixture::build`, `build_with_worktree`, `BuiltRepo::path`/`sha`), en test d'intégration `crates/relief-fixtures/tests/*.rs` sur la vraie fixture `tiny` et des `fixture.yaml` temporaires (invalides) : attrape SHA déterministes, contenu du dernier commit (`git ls-tree`), branches, worktree sale, erreurs qui nomment fichier et champ. Rate l'interface du binaire.
2. **Binaire `relief-fixtures build <nom> <dossier>`** (`assert_cmd`) : attrape le câblage CLI (dépôt créé, SHA identiques à l'API, erreur sur fixture inconnue). Rate le détail des erreurs de parsing (couvert par le seam 1).

## Red

- Fichiers de test : `crates/relief-fixtures/tests/build.rs`, `crates/relief-fixtures/tests/cli.rs` ; données `fixtures/tiny/` (commits `init`, `edit`, `reshape`) ; dev-dependencies `assert_cmd`, `tempfile` ajoutées à `crates/relief-fixtures/Cargo.toml`
- Lancer : `cargo test -p relief-fixtures --test build` puis `cargo test -p relief-fixtures --test cli`
- API attendue par les tests : `Fixture::load(name)`, `Fixture::load_from(dir)` (dossier contenant `fixture.yaml`, pour les yaml temporaires), `fixture.build(dir) -> Result<BuiltRepo, _>`, `fixture.build_with_worktree(dir, |wt: &Path| …)`, `BuiltRepo::path() -> &Path`, `BuiltRepo::sha(id) -> Option<&str>`, erreurs `Display`. Format yaml : clé racine `commits:` (liste de `id`, `message`, `date` ISO 8601 `…Z`, `branch` optionnel qui persiste pour les commits suivants) ; branche par défaut `main`. Le binaire cherche `fixtures/` à la racine du workspace.
- En échec : 2 fichiers, 11 tests (aucun ne compile : `Fixture` absent de `relief_fixtures`)
  - build.rs : building_tiny_twice_gives_identical_shas, built_repo_has_three_commits_in_order_with_fixed_author, last_commit_of_tiny_renames_and_deletes, overlay_commits_keep_files_of_previous_commits, branch_field_puts_commits_on_a_named_branch, build_with_worktree_leaves_dirty_state, unknown_fixture_error_names_the_file, missing_field_error_names_file_and_field, invalid_date_error_names_file_and_field — symbole `Fixture` manquant
  - cli.rs : build_subcommand_creates_the_same_repo_as_the_api, build_subcommand_fails_on_unknown_fixture — symbole `Fixture` manquant (et binaire `relief-fixtures` absent)

## Green

- Fichiers : crates/relief-fixtures/src/lib.rs, crates/relief-fixtures/src/bin/relief-fixtures.rs, crates/relief-fixtures/Cargo.toml (serde, serde_yaml, thiserror), Cargo.lock, justfile (recette `fixture`)
- Changement : `Fixture::load/load_from/build/build_with_worktree`, `BuiltRepo`, erreurs nommant fichier et champ ; dépôt construit via le binaire `git` (auteur fixe, dates en `+0000`, gpgsign=false), surcouches et `_delete.txt`, branches persistantes ; binaire `relief-fixtures build` et recette `just fixture`.
- Suite : cargo 11 réussis / 1 échoué (baseline 28/0, le total diffère car `just test-summary` ne compte pas les tests build non compilés avant) ; web 2/0. Lint propre. Aucun fichier de test modifié.
- Questions ouvertes : `built_repo_has_three_commits_in_order_with_fixed_author` attend `%aI` = `…+00:00` mais git 2.56.1 affiche `…Z` pour une date UTC ; le test est dépendant de la version de git, à corriger côté test (accepter `Z`).

## Review

- Verdict : ship
- Must fix : aucun. Les trois critères d'acceptation sont couverts (SHA identiques sur deux builds, `ls-tree`/`diff-tree -M` du dernier commit, erreurs qui nomment fichier et champ).
- Consider :
  - `git()` : isoler la config git de la machine (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`) pour protéger les SHA.
  - `apply_overlay` : refuser les chemins absolus ou avec `..` dans `_delete.txt`.
  - Tests : la persistance de `branch` sur les commits suivants n'est pas testée ; aucun SHA figé en littéral.
  - `Cargo.toml` : ordre des sections ; `serde_yaml` 0.9 est déprécié.
  - `copy_tree`/`apply_overlay` : paramètre drapeau `top`.
  - `valid_iso_utc` accepte `2024-13-45T99:99:99Z` (git rejette ensuite sans nommer le champ).

## Documentation

Ticket interne (outillage de test) : la doc utilisateur ne change pas.

## Answer

- Construit : crate `relief-fixtures` avec `Fixture::load(nom)` / `Fixture::load_from(dossier)`, `build(dir) -> BuiltRepo` (`path()`, `sha(id)`) et `build_with_worktree(dir, |wt| …)` ; dépôt créé par le binaire `git` (auteur `Fixture <fixture@relief.invalid>`, dates fixes `+0000`, `commit.gpgsign=false`), surcouches par commit, `_delete.txt`, branches (le champ `branch` persiste pour les commits suivants, défaut `main`). Erreurs `thiserror` qui nomment le fichier et le champ. Binaire `relief-fixtures build <nom> <dossier>` et recette `just fixture`. Fixture `fixtures/tiny/` (commits `init`, `edit`, `reshape` : renommage `src/b.ts` → `src/c.ts`, suppression de `docs/readme.md`).
- Décision : le test d'auteur/date compare `%at` (timestamps Unix) et non `%aI`, dont le format (`Z` ou `+00:00`) dépend de la version de git.
- Vérifié : `cargo test -p relief-fixtures` (build 9/9, cli 2/2) ; `just test-summary` : cargo 39 passed (baseline 28), web 2 passed ; `just lint` propre ; review : ship.
