# Cache par blob

Status: resolved
Type: task
Blocked by: I01, T01
UI: non
Doc: user-docs `cli` (option `--no-cache`, emplacement du cache)

Spec: `../spec.md` (Décisions : cache)

## À faire

- Table SQLite `file_index(blob, adapter, adapter_version, payload)` ; lecture avant parsing, écriture après.
- Compteurs exposés dans `meta` : fichiers parsés, fichiers servis par le cache.
- Option CLI globale `--no-cache` ; variable `RELIEF_CACHE_DIR`.
- Cache illisible (version de schéma différente, fichier corrompu) → recréé, avertissement.

## Critères d'acceptation

- [x] Deux snapshots successifs d'acme-shop : le second parse 0 fichier (compteur).
- [x] Snapshot de `main` puis de `feat/promo-codes` : seuls les fichiers aux blobs nouveaux sont parsés (nombre littéral dans le test).
- [x] Un fichier de cache rempli d'octets aléatoires ne fait pas échouer l'indexation.

## Baseline

`just test-summary` (develop @ 95a23c2) : cargo 169 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

- **`relief_index::Indexer` sur la fixture acme-shop (avec l'adapter TS), cache dans un dossier temporaire** : attrape les compteurs de `SnapshotMeta` (fichiers parsés / servis par le cache), le second snapshot à 0 fichier parsé, le nombre littéral de blobs nouveaux entre `main` et `feat/promo-codes`, la clé (blob, adapter, version), et le cache corrompu (octets aléatoires) recréé sans échec ; rate le câblage CLI (option, variable d'environnement).
- **CLI `relief show` (`assert_cmd`) avec `RELIEF_CACHE_DIR` et `--no-cache`** : attrape l'emplacement du cache piloté par la variable, les compteurs visibles dans `meta` du JSON, `--no-cache` qui parse tout et n'écrit pas de cache, l'avertissement sur stderr pour un cache illisible ; rate le détail de la table SQLite.

Décision sur le hash : la clé du cache est l'oid git du blob (déjà calculé par git, gratuit et standard). `content_hash` (FNV-1a, D01) reste pour les hash de corps et de signature des symboles : il est déterministe, sans dépendance, et n'a pas besoin d'être cryptographique. Un changement futur de cet algorithme passe par une hausse de `adapter_version`, ce qui invalide le cache proprement.

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/cache.rs` (seam Indexer, ici car relief-index ne dépend pas de l'adapter TS), `crates/relief-cli/tests/cache.rs` (seam CLI)
- Lancer : `cargo test -p relief-lang-ts --test cache` et `cargo test -p relief-cli --test cache`
- API attendue (à implémenter par green) :
  - `Indexer::with_cache(self, dir: impl AsRef<Path>) -> Self` ; fichier `<dir>/index.sqlite`.
  - `SnapshotMeta::parsed_files` et `cached_files` (`usize`, JSON `parsedFiles` / `cachedFiles`) : fichiers traités par un adapter, parsés ou servis par le cache.
  - `LanguageAdapter::version(&self) -> u32` (méthode par défaut) : fait partie de la clé (blob, nom, version).
  - Cache illisible : recréé, avertissement contenant « cache » dans `meta.warnings` et sur stderr du CLI.
  - CLI : `RELIEF_CACHE_DIR` = le dossier du cache lui-même (fichier `$RELIEF_CACHE_DIR/index.sqlite`) ; `--no-cache` ne lit ni n'écrit ; le CLI enregistre `TsAdapter` ; `show --json` ajoute une clé de premier niveau `meta` (`parsedFiles`, `cachedFiles`) à côté de `commit`/`nodes`/`edges` (les tests existants désérialisent un `GraphSnapshot`, qui ignore la clé en trop). Le CLI doit donc dépendre de `relief-lang-ts`.
  - Blobs TS nouveaux entre `main` et `feat/promo-codes` : 13 (vérifié avec `git ls-tree`).
- En échec : 10 tests
  - `cache.rs` (lang-ts), 6 tests — ne compilent pas : `with_cache`, `parsed_files`, `cached_files`, `LanguageAdapter::version` n'existent pas (first_snapshot_parses_every_file_and_serves_none_from_cache, second_snapshot_of_the_same_commit_parses_nothing, feature_branch_after_main_parses_only_new_blobs, cached_snapshot_equals_uncached_snapshot, a_new_adapter_version_invalidates_the_cache, garbage_cache_file_does_not_fail_and_is_recreated_with_a_warning)
  - `cache.rs` (cli), 4 tests — `meta.parsedFiles` absent du JSON (second_run_is_served_by_the_cache_in_relief_cache_dir, no_cache_parses_everything_and_writes_no_cache, no_cache_ignores_an_existing_cache, unreadable_cache_warns_on_stderr_and_is_rebuilt)

## Green

- Fichiers : `crates/relief-index/src/cache.rs` (nouveau), `crates/relief-index/src/lib.rs`, `crates/relief-index/Cargo.toml`, `crates/relief-cli/src/main.rs`, `crates/relief-cli/Cargo.toml`, `Cargo.lock`
- Changement : cache SQLite `file_index(blob, adapter, adapter_version, payload)` dans `relief-index` (`Indexer::with_cache`, `LanguageAdapter::version`, compteurs `parsed_files`/`cached_files`, cache illisible recréé avec avertissement). Seul `extract` est mis en cache ; à un autre chemin (renommage) les ids sont réécrits depuis l'id du fichier. CLI : `TsAdapter` enregistré, `--no-cache`, `RELIEF_CACHE_DIR` (sinon `~/.cache/relief/<repo-id>`), `meta` dans `show --json`, avertissements de cache sur stderr.
- Suite : les 10 tests rouges passent ; `just lint` propre ; cargo 177 passed, 2 failed (baseline 169/0), web 2/0.
- Questions ouvertes : `show__show_head.snap` et `show__show_init.snap` (insta, tests/show.rs) échouent car enregistrer `TsAdapter` dans le CLI change `symbols`/`edges` (0 -> 3 et 4 sur la fixture) ; snapshots à réviser (`cargo insta review`), je n'y ai pas touché.

## Documentation

Le site `user-docs/` (F05) n'existe pas encore. Quand il sera créé, la page `cli` (FR et EN) devra documenter : l'option globale `--no-cache` (ni lecture ni écriture du cache) ; l'emplacement du cache, `~/.cache/relief/<repo-id>/index.sqlite` ; la variable `RELIEF_CACHE_DIR` (dossier du cache lui-même) ; le fait qu'un cache illisible est recréé avec un avertissement sur stderr ; les compteurs `parsedFiles` / `cachedFiles` dans `meta` de `relief show --json`.

## Review

Premier passage : **fix first**.
- Must fix appliqués : (1) tests CLI non hermétiques (écrivaient dans `~/.cache/relief`) → le helper `relief()` de `show.rs` passe `--no-cache`, sans changer d'assertion ; (2) réécriture des ids d'un blob vu à un autre chemin par `String::replace` sur tout le JSON → `rebase` structuré (id, parent, from/to ; id égal à celui du fichier ou préfixé `<fichier>::sym:`), test unitaire `a.ts` contre `a.tsx`.
- Must fix reporté : la page `cli` de `user-docs/` (le site n'existe pas, F05), consignée sous `## Documentation`.

Revérification : **ship**, aucun Must fix restant.

Consider (non appliqués) :
- Test d'intégration de `rebase` sur un fichier renommé (même blob, autre chemin).
- `relief-cli/src/main.rs` : `starts_with("cache ")` couple la CLI au libellé de l'avertissement ; un type d'avertissement dédié serait plus robuste.
- `relief-index/src/lib.rs` : `entries.iter().find(...)` par fichier, O(n²) ; une `HashMap` chemin → blob suffit.
- `cache.rs` : `Cache::open` renvoie `(Option, Option<String>)` ; un petit type serait plus lisible. `put`/`commit` ignorent leurs erreurs ; `put` clone nodes/edges pour sérialiser.

Changements de tests hors red, vérifiés par l'orchestrateur : snapshots `show__show_head`/`show__show_init` (symbols/edges non nuls, car la CLI enregistre `TsAdapter`) ; `parsedFiles`/`cachedFiles` ajoutés à l'objet attendu de `relief-index/tests/snapshot.rs` ; `--no-cache` dans le helper de `show.rs`. Aucune assertion affaiblie.

## Answer

- Cache SQLite `file_index(blob, adapter, adapter_version, payload)` dans `relief-index` (`src/cache.rs`) : `Indexer::with_cache(dir)` (fichier `<dir>/index.sqlite`), `LanguageAdapter::version()` dans la clé, lecture avant `extract`, écriture après. Un blob déjà vu sous un autre chemin est réutilisé, ses ids réécrits.
- `SnapshotMeta` gagne `parsedFiles` / `cachedFiles`. Cache illisible (schéma, octets non SQLite) → recréé, avertissement dans `meta.warnings` et sur stderr.
- CLI : `TsAdapter` enregistré, `--no-cache` branché (ni lecture ni écriture), `RELIEF_CACHE_DIR` (sinon `~/.cache/relief/<repo-id>`), `meta` dans `show --json`.
- Décision hash : clé = oid git du blob ; `content_hash` (FNV-1a) gardé pour les hash de symboles, changement futur via `adapter_version`. Le retrait des guillemets avant hash (T01) est hors périmètre, non corrigé.
- Vérifié : 10 nouveaux tests (fixture acme-shop : 0 fichier parsé au second snapshot, 13 blobs nouveaux `main` → `feat/promo-codes`, cache corrompu), suite complète cargo 180/0, web 2/0 (baseline 169/0, 2/0), `just lint` propre, `~/.cache/relief` non créé par la suite. Pas d'UI : pas de vérification navigateur.
