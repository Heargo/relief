# D04 Fichiers hors système rangés en dossiers, et manifestes de fixtures ignorés

Status: resolved
Type: task
Blocked by: D03, L01
UI: non (la carte change par les données, pas par le code de l'UI)
Doc: user-docs `about` (FR et EN) : une phrase sur les dossiers de fixtures ignorés pour détecter les systèmes

Spec: `../spec.md` (Décisions : « le générique complète toujours (modules = dossiers) »)

## Constat

`relief .` sur le dépôt relief lui-même : le niveau 0 montre ~660 fichiers en grille et des centaines d'arêtes, aucune arborescence.

1. Le detector `pyproject` (L01) trouve `tests/fixtures/py-shop/base/pyproject.toml`, une fixture de test, et en fait le seul système du dépôt (`pkg:py-shop`). Il gagne sur le générique pour tout le dépôt.
2. Dans `pyproject.rs` comme dans `workspaces.rs` (boucle « Files belong to the deepest … containing them, else to the repo »), les fichiers hors de tout système sont rattachés **à plat** au nœud repo, sans nœud `module`. Le spec dit pourtant que le générique complète toujours (modules = dossiers). Sur acme-shop, `types/external.d.ts` est dans ce cas.

## À faire

- **Fichiers hors système** (detectors `workspaces` et `pyproject`) : les ranger avec la même règle que le detector générique (`Folders`, appliquée depuis la racine du dépôt aux seuls fichiers hors système) : modules `pkg:<repo>/<dossier>` (mêmes ids et `subkind` que le générique, `path` = le dossier), rattachés au repo ou à leur module parent ; un fichier va dans le module de son dossier, sinon au repo. Une seule implémentation partagée, pas trois copies.
- **Manifestes de fixtures** : un `pyproject.toml` ou un `package.json` situé sous un dossier `fixtures`, `__fixtures__`, `testdata` ou `test-fixtures` (à n'importe quelle profondeur) ne crée pas de système et ne déclenche pas de detector spécialisé. Les fichiers de ces dossiers restent dans la carte (en dossiers, comme les autres).
- Sur un dépôt sans manifeste hors fixtures (comme relief), c'est donc le générique qui répond.
- Incrémenter la version du cache (I02) pour invalider les anciens snapshots.

## Critères d'acceptation

- [ ] Paths en mémoire, `workspaces` : un workspace `apps/api` plus `docs/guide.md`, `docs/adr/0001.md`, `README.md` à la racine : `docs` et `docs/adr` sont des modules (`pkg:<repo>/docs`, `pkg:<repo>/docs/adr`, path rempli), `docs/guide.md` est enfant de `pkg:<repo>/docs`, `README.md` reste enfant du repo.
- [ ] Idem pour `pyproject` (un projet `services/api/pyproject.toml` et des fichiers hors projet).
- [ ] Un dépôt dont le seul `pyproject.toml` est sous `tests/fixtures/x/` : `relief_detect::detect` répond `generic`, aucun nœud `service`/`package`. Même chose pour un `package.json` à workspaces sous `tests/fixtures/`.
- [ ] Un `pyproject.toml` à la racine et un autre sous `tests/fixtures/` : un seul système (celui de la racine).
- [ ] Les ids restent déterministes (ordre des chemins en entrée indifférent).
- [ ] acme-shop : `types/` devient un module contenant `types/external.d.ts`. Toute mise à jour d'un snapshot ou test existant (insta, e2e, compteurs de croisements de la doc `map`) est listée ici avec sa raison, sans affaiblir d'assertion.

## Baseline

`just test-summary` sur `develop` (da86777) : cargo 569 passed, 0 failed ; web 476 passed, 0 failed. Arbre de travail : seul `quicknotes.md` non suivi (fichier de l'utilisateur, hors ticket).

## Seams

1. **API publique de `relief-detect`** (`relief_detect::detect` et chaque detector sur des listes de chemins en mémoire, plus la fixture acme-shop) : attrape les modules hors système, le rattachement des fichiers, les ids et `path`, l'exclusion des manifestes de fixtures, le déterminisme. Rate le rendu de la carte.
2. **Cas d'usage `relief-app` `Session::snapshot`** sur une fixture construite (`relief-fixtures`) avec un `pyproject.toml` sous `tests/fixtures/` et des dossiers à la racine : attrape la chaîne git → index → snapshot (cache compris). Rate le rendu.

UI : non. Doc : `about` (FR et EN).

## Red

- Fichiers de test : `src/analysis/relief-detect/tests/outside_systems.rs`, `src/app/relief-app/tests/outside_systems.rs`, nouvelle fixture `tests/fixtures/outside-systems/` (un commit `init`, seul manifeste sous `tests/fixtures/x/`)
- Lancer : `cargo test -p relief-detect --test outside_systems` et `cargo test -p relief-app --test outside_systems`
- En échec : 9 tests
  - workspaces_files_outside_a_package_are_filed_in_folder_modules — pas de nœud `pkg:shop/docs` (fichiers à plat sur le repo)
  - pyproject_files_outside_a_project_are_filed_in_folder_modules — idem pour pyproject
  - outside_modules_have_the_same_ids_whatever_the_path_order — pas de module `pkg:shop/docs/adr`
  - a_pyproject_under_fixtures_creates_no_system — le detector répond `pyproject` au lieu de `generic`
  - every_fixture_folder_name_is_ignored_at_any_depth — idem (`fixtures`, `__fixtures__`, `testdata`, `test-fixtures`)
  - a_workspaces_package_json_under_fixtures_creates_no_system — `workspaces` répond avec un package de fixture
  - a_root_pyproject_wins_over_one_under_fixtures — deux systèmes au lieu d'un
  - acme_shop_types_folder_is_a_module — pas de nœud `pkg:acme-shop/types`
  - (relief-app) a_fixture_manifest_creates_no_system_and_folders_are_modules — `pkg:fixture-x` (service) gagne, dossiers `docs` non modules

## Green

- Fichiers : `src/analysis/relief-detect/src/generic.rs`, `src/analysis/relief-detect/src/workspaces.rs`, `src/analysis/relief-detect/src/pyproject.rs`, `src/analysis/relief-index/src/cache.rs`, `src/analysis/relief-detect/tests/snapshots/workspace_modules__acme_shop_workspace_nodes_snapshot.snap`
- Changement : `generic.rs` gagne `outside_nodes` (modules-dossiers `pkg:<repo>/<dir>` avec `path`, fichiers dans leur module) et `is_fixture_path` (`fixtures`, `__fixtures__`, `testdata`, `test-fixtures`), partagés par `workspaces` et `pyproject` à la place du rattachement à plat. Ces deux detectors ignorent les manifestes sous un dossier de fixtures. `SCHEMA_VERSION` du cache passe de 3 à 4.
- Suite : cargo 578 passed, 0 failed (baseline 569) ; web 476 passed, 0 failed (baseline 476). Lint propre.
- Snapshot mis à jour : `workspace_modules__acme_shop_workspace_nodes_snapshot.snap` gagne le seul nœud `pkg:acme-shop/types` (module, path `types`), conséquence voulue du ticket ; aucune assertion affaiblie. La doc `about` (FR/EN) reste à faire à l'étape doc.
- Questions ouvertes : aucune

## Review

- Verdict : fix first
- Must fix : docs/user (about, FR et EN) — aucune phrase sur les dossiers de fixtures ignorés (ligne `Doc:` du ticket), pas de diff sous docs/ — l'ajouter dans les deux langues (étape doc du workflow)
- Consider : src/analysis/relief-detect/src/workspaces.rs et pyproject.rs — `by_owner.remove(&None)` puis reconstruction d'une `BTreeMap` : la boucle suivante garde un `owner.and_then(...)` / `let Some ... else continue` devenu mort pour le cas `None` ; simplifier. src/analysis/relief-detect/src/generic.rs `is_fixture_path` — sensible à la casse (`Fixtures`) ; acceptable, à assumer. Ticket : ligne ROADMAP 53a encore non cochée, à cocher à la clôture.

## Answer

- `generic.rs` porte une seule implémentation partagée, `outside_nodes` : les fichiers hors de tout système sont rangés en modules de dossiers `pkg:<repo>/<dossier>` (avec `path`), selon la règle `Folders` du générique. `workspaces.rs` et `pyproject.rs` l'appellent au lieu de rattacher ces fichiers à plat au repo.
- `is_fixture_path` (`fixtures`, `__fixtures__`, `testdata`, `test-fixtures`, à n'importe quelle profondeur, sensible à la casse) : un manifeste sous un de ces dossiers ne crée pas de système et ne déclenche pas de detector spécialisé. Leurs fichiers restent sur la carte, en dossiers.
- Cache : `SCHEMA_VERSION` passe de 3 à 4.
- Vérifié :
  - `just test-summary` : cargo 578 passed (baseline 569, +9), web 476 passed (inchangé). `just lint` propre. `just e2e-summary` : 87 passed, 1 skipped, 0 failed.
  - Sur le dépôt relief lui-même (snapshot `WORKTREE`, sans budget) : plus de système `py-shop`. Le premier niveau compte 7 modules (`.claude`, `.scratch`, `docs`, `packaging/arch`, `scripts`, `src`, `tests`) et 9 fichiers racine, contre 659 fichiers à plat avant. Le dépôt compte 260 modules en tout.
- Tests existants mis à jour :
  - `workspace_modules__acme_shop_workspace_nodes_snapshot.snap` gagne un seul nœud, `pkg:acme-shop/types` (module, path `types`). C'est le but du ticket.
  - `tests/e2e/tests/diff-layer.e2e.ts`, test « only client.ts is format-only… » : avec le module `types/`, la rangée du bas (`apps/web`) dépasse en bas de la fenêtre de 3200×2000 au niveau 2. Le test fait désormais glisser la carte de 400 px vers le haut avant de vérifier `Invoices.tsx`. L'assertion n'est pas affaiblie. Vérifié : sans le changement, le test passait ; avec, il échouait sur `toBeDisplayed`.
- Doc : `about` (FR et EN), un paragraphe sur les systèmes, les dossiers de fixtures ignorés et les fichiers hors système. La doc `map` cite 586 → 157 croisements, chiffres tirés du snapshot figé des tests web. L'app réelle sur acme-shop donnait déjà 733 → 231 avant ce ticket, et donne 733 → 237 après : l'écart est antérieur à ce ticket, la doc `map` n'est pas changée ici.
- Laissé de côté (Consider de la review) : le garde-fou `let Some … else { continue }` après `by_owner.remove(&None)` dans `workspaces.rs` et `pyproject.rs`.
