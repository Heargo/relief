# K11 Imports de paquets entre dépôts

Status: resolved
Type: task
Blocked by: K08
UI: non
Doc: docs/user `map` (arêtes entre dépôts)

Spec: `../spec.md` (Arêtes entre dépôts)

## Comportement

- Contrat des adapters (`relief-adapter-api`) : un adapter déclare les noms de paquets qu'un dépôt publie (TS : `name` des `package.json` ; Python : `[project].name` de `pyproject.toml`).
- Un import vers un de ces noms depuis un autre dépôt de l'espace est résolu vers les fichiers du dépôt qui le publie (point d'entrée du paquet), comme un import de workspace, au lieu d'un nœud externe.
- Aucun cas particulier par langage dans `relief-index`.

## Critères d'acceptation

- [x] Fixture à deux dépôts (front qui importe `@acme/shared` publié par l'autre) : arête `imports` entre dépôts, plus de nœud externe pour ce paquet ; même chose en Python.

## Baseline

Après K10 (`a8bdd98`) : cargo 785/0 ; web 1140/0 ; e2e 194 passés, 1 ignoré.

## Seams

- **Contrat d'adapter (`relief-adapter-api`) + adapters TS et Python**, testés directement sur des arbres de fichiers en mémoire ou une fixture : chaque adapter déclare les noms de paquets publiés (TS : `name` des `package.json` ; Python : `[project].name` de `pyproject.toml`) et leur point d'entrée. Rate l'union.
- **Cas d'usage `relief-app` sur un espace de deux dépôts** (`shop-space` pour TS : `shop-web` importe `@shop/api` publié par `shop-api` ; une petite fixture Python à deux dépôts) : arête `imports` de `repo:web/…` vers les fichiers de `repo:api/…`, plus de nœud externe pour ce paquet ; monodépôt inchangé ; aucun cas particulier par langage dans `relief-index` / l'union. Rate l'UI.

## Red

- Fichiers de test : `src/analysis/lang/relief-lang-ts/tests/published_packages.rs`, `src/analysis/lang/relief-lang-python/tests/published_packages.rs`, `src/app/relief-app/tests/cross_repo_packages.rs` ; fixtures `tests/fixtures/py-core`, `py-app`, `py-space/py.relief.json`
- Contrat attendu (nom choisi par le red) : `LanguageAdapter::published_packages(&self, paths: &[&str], read: &dyn Fn(&str) -> Option<Vec<u8>>) -> Vec<PublishedPackage>`, `PublishedPackage { name: String, entry: String }` exporté par `relief_adapter_api` (entry = chemin dépôt du point d'entrée ; Python : `__init__.py` du module `name` avec `-` en `_`, à la racine du projet ou sous `src/`)
- Lancer : `cargo test -p relief-lang-ts --test published_packages ; cargo test -p relief-lang-python --test published_packages ; cargo test -p relief-app --test cross_repo_packages`
- En échec : 13 tests
  - TS `published_packages` (5 tests) — ne compile pas : `PublishedPackage` et `published_packages` n'existent pas
  - Python `published_packages` (5 tests) — idem
  - `a_ts_import_of_a_package_published_by_another_repository_is_an_edge_between_them` — l'import reste une arête vers `repo:web/pkg:external/@shop/api`
  - `the_published_ts_package_is_no_longer_an_external_node` — le nœud `repo:web/pkg:external/@shop/api` existe encore
  - `a_python_import_of_a_package_published_by_another_repository_is_an_edge_between_them` — arête vers `repo:app/pkg:external/shop_core`
  - `the_published_python_package_is_no_longer_an_external_node` — le nœud `repo:app/pkg:external/shop_core` existe encore
- Garde (passe déjà, voulu) : `on_a_single_repository_the_package_is_still_external` (monodépôt inchangé)

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/relief-index/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/lib.rs`, `src/analysis/lang/relief-lang-python/src/lib.rs` (+ `Cargo.toml`, `Cargo.lock`), `src/app/relief-app/src/union.rs`, `docs/user/src/content/docs/map.md`, `docs/user/src/content/docs/en/map.md`
- Changement : `LanguageAdapter::published_packages` (défaut vide) et `PublishedPackage` dans l'adapter-api, implémentés par TS (`package.json` name + main) et Python (`[project].name` + `__init__.py`, racine ou `src/`) ; `Indexer::published_packages` agrège les adapters sans nommer de langage. Dans `union.rs`, les nœuds externes dont le nom correspond à un paquet publié par un autre dépôt sont redirigés vers le fichier d'entrée (arêtes du snapshot et du diff), puis supprimés avec leur groupe s'il est vide. Doc `map` FR/EN : une phrase.
- Suite : cargo 800/0 (baseline 785/0, +15 tests rouges), web 1140/0 ; lint propre ; e2e non relancé.
- Questions ouvertes : la correspondance nom externe / nom publié est exacte, puis tolérante (casse, `-` `.` `_` équivalents) car Python importe `shop_core` pour `shop-core` ; cette tolérance vaut pour tous les langages (générique, pas de cas par langage).

### Correctifs de review (partiels)

- Fait : doc FR dédoublonnée ; redirections du diff fusionnées base + tête (la tête l'emporte), groupes externes vidés retirés du diff comme du snapshot (`prune_externals`) ; test `src/app/relief-app/tests/cross_repo_removed_import.rs`.
- Limite connue : un `package.json` sans `main` ne publie rien (pas de lecture de `exports` ni de repli sur `index.ts` pour l'instant).
- Fait ensuite : `import_name` (TS = name ; Python = module en minuscules, `-` et `.` en `_`), égalité exacte dans `union.rs`, `loose` supprimé, `redirects` indexe fichiers et paquets par HashMap.

## Review

Verdict initial : fix first. Corrigé : doc FR dédupliquée ; redirections base + tête dans le diff, groupes externes vidés retirés (`cross_repo_removed_import.rs`). Décision orchestrateur : plus de correspondance tolérante ; `PublishedPackage.import_name` déclaré par l'adapter (TS = `name`, Python = module en minuscules, `-`/`.` → `_`), égalité exacte dans l'union, HashMap dans `redirects`. L'orchestrateur a ajouté `import_name` aux helpers des tests rouges `published_packages.rs`. Verdict final : ship. Laissés : `is_external_group` lit le format d'id à la main ; `list_tree` relancé par membre dans le diff.

## Answer

- `relief-adapter-api` : `LanguageAdapter::published_packages` (défaut vide) → `PublishedPackage { name, import_name, entry }`. TS : `name` et `main` des `package.json` ; Python : `[project].name` et le `__init__.py` du module (racine ou `src/`).
- `relief-index` agrège les adapters sans nommer de langage ; l'union d'un espace redirige un import externe dont le nom est publié par un autre dépôt vers son fichier d'entrée (snapshot et diff), et retire le nœud externe.
- Fixtures `py-core`, `py-app`, `py-space`. Limite : un `package.json` sans `main` ne publie rien.
- Vérifié : cargo 801/0, web 1140/0, e2e 194 passés / 1 ignoré, lint propre.
- Doc : `map` FR/EN.
