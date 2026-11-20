# Données du dépôt dans `.relief/`

Status: resolved
Type: task
Blocked by: N03
UI: non
Doc: `docs/user` « Commencer » (où vivent les données de relief)

Spec: `../spec.md` (Décisions : `.relief/`) ; ADR 0007

## À faire

- `DataDir` dans `relief-app` : résout l'emplacement (`RELIEF_CACHE_DIR`, sinon `<racine du worktree>/.relief/`, sinon `~/.cache/relief/<repo-id>/` pour un dépôt bare ou en lecture seule), crée `cache/`, `state/`, `.gitignore` (`*`) et `relief.json` (version du format, repo-id, version de relief).
- Format plus ancien : migré. Format plus récent que le binaire : erreur claire, rien n'est écrasé.
- Le cache d'index passe dans `cache/index.sqlite`, en WAL avec un délai d'attente sur les verrous.
- `relief-git` exclut `.relief/` du working tree, de l'index et des arbres de commit, comme `.git/`.
- Mettre à jour la mention `~/.cache/relief/<repo-id>/review/` de `.scratch/review-ui/spec.md` (état « vu ») vers `.relief/state/`.

## Critères d'acceptation

- [x] Ouvrir une `Session` sur une fixture crée `.relief/` avec ses quatre entrées ; `git status --porcelain` reste vide.
- [x] Un `.relief/` commité par erreur n'apparaît ni dans le snapshot ni dans le diff du working tree.
- [x] Dépôt bare et dossier en lecture seule : repli sur le dossier de cache utilisateur.
- [x] `relief.json` d'un format futur : `AppError` explicite, fichier intact.
- [x] Deux `Session` sur le même dépôt en parallèle écrivent le cache sans erreur de verrou.

## Baseline

Après N03 (`738a1aa`) : cargo 422 passed, web 308 passed, e2e 58 passed ; `just lint` propre.

## Décisions (orchestrateur)

- `relief-app` exporte `DataDir` et `DataDirEnv`. `DataDirEnv { relief_cache_dir: Option<PathBuf>, xdg_cache_home: Option<PathBuf>, home: Option<PathBuf> }` porte les variables d'environnement utiles ; `DataDirEnv::from_process()` les lit. Les tests construisent un `DataDirEnv` à la main : aucun test ne modifie l'environnement du process.
- `DataDir::open(repo: &Path, env: &DataDirEnv) -> Result<DataDir, AppError>` résout l'emplacement : `relief_cache_dir` s'il est donné (le dossier lui-même est la racine des données) ; sinon `<racine du worktree>/.relief/` ; sinon (dépôt bare, ou création impossible, par exemple dossier en lecture seule) `<xdg_cache_home ou home/.cache>/relief/<repo-id>/`. Il crée `cache/`, `state/`, `.gitignore` (contenu `*\n`) et `relief.json`. Accesseurs : `root()`, `cache_dir()`, `state_dir()`, `is_fallback()`.
- `relief.json` : `{ "format": 1, "repoId": "<sha>", "reliefVersion": "<CARGO_PKG_VERSION>" }`. Absent ou format plus ancien (`format` absent ou < 1) : (ré)écrit au format courant, sans toucher à `cache/` ni `state/`. Format plus récent : `AppError::DataDirFormat { found, supported }` de code `data_dir` (nouveau code), fichier intact, aucune autre écriture.
- `SessionOptions.cache_dir: Option<PathBuf>` devient `data_dir: Option<DataDirEnv>` : `None` = aucune donnée écrite (tests, `--no-cache`), `Some(env)` = `DataDir::open` au `Session::open`. `Session::data_dir() -> Option<&DataDir>`. Le cache d'index est `cache/index.sqlite` (`Indexer::with_cache(data.cache_dir())`). `default_cache_dir` disparaît ; la CLI passe `Some(DataDirEnv::from_process())`, ou `None` avec `--no-cache`.
- `relief-index` (cache) : SQLite en `journal_mode=WAL` et `busy_timeout` (5 s) ; deux process ou deux `Session` sur le même `index.sqlite` ne doivent pas échouer sur un verrou.
- `relief-git` exclut le dossier `.relief` à la racine du dépôt de `list_tree` (commits), du working tree (`WORKTREE`) et de l'index (`INDEX`), comme `.git`.
- Doc utilisateur : `docs/user` « Commencer » (FR et EN), un paragraphe « Où relief range ses données » ; `.scratch/review-ui/spec.md` : l'état « vu » va dans `.relief/state/`.

## Seams

1. **`DataDir` et `Session` sur un dépôt de fixture** (`src/app/relief-app/tests/data_dir.rs`) : création des quatre entrées et `git status --porcelain` vide ; `relief_cache_dir` forcé ; repli pour un dépôt bare et pour un dossier en lecture seule (vers un `xdg_cache_home` temporaire) ; `relief.json` futur → code `data_dir`, octets du fichier inchangés ; `relief.json` ancien ou absent → réécrit au format 1 ; `Session` avec `data_dir: Some(..)` écrit `cache/index.sqlite` ; deux `Session` sur le même dépôt, indexées en parallèle dans deux threads, sans erreur ni avertissement de cache. Attrape : `DataDir`, migration, verrous. Rate : l'exclusion côté git.
2. **`GitSource` sur un dépôt de fixture où `.relief/` est commité, indexé et présent dans le working tree** (`src/analysis/relief-git/tests/`) : aucun chemin sous `.relief/` dans `list_tree` d'un commit, de `WORKTREE` ni de `INDEX`. Plus un test `relief-app` : le snapshot et le diff du working tree ne contiennent aucun nœud sous `.relief/`. Attrape : l'exclusion en dur. Rate : rien du `DataDir`.

## Red

- Fichiers de test : `src/app/relief-app/tests/data_dir.rs`, `src/app/relief-app/tests/relief_excluded.rs`, `src/analysis/relief-git/tests/relief_dir.rs` ; adaptés : `src/app/relief-app/tests/common/mod.rs`, `src/app/relief-app/tests/use_cases.rs` (commentaire), `src/interfaces/relief-server/tests/{api,docs,review_summary}.rs` (`data_dir`), `src/interfaces/relief-cli/tests/cache.rs` (le cache est maintenant `cache/index.sqlite`)
- Lancer : `cargo test -p relief-app --test data_dir`, `cargo test -p relief-app --test relief_excluded`, `cargo test -p relief-git --test relief_dir`
- En échec : 17 tests
  - relief-git `relief_dir` (3 tests, échec par assertion) : `relief_dir_is_not_listed_in_a_commit`, `..._in_the_worktree`, `..._in_the_index` — `.relief/...` est listé
  - relief-app `data_dir` (9 tests, ne compile pas : `DataDir`, `DataDirEnv`, `SessionOptions.data_dir`, `Session::data_dir`, code `data_dir` manquants) : création des quatre entrées + git status vide ; aucune donnée sans `data_dir` ; `cache/index.sqlite` ; `relief_cache_dir` forcé ; repli bare (xdg) ; repli bare (home/.cache) ; repli dossier en lecture seule (sauté si root) ; format futur → `data_dir` et fichier intact ; format ancien/absent réécrit
  - relief-app `data_dir` (1 test) : deux sessions parallèles sans erreur de verrou
  - relief-app `relief_excluded` (2 tests, compile rouge) : snapshot et diff du worktree sans `.relief/`
- Le crate relief-app (tous ses fichiers de test) et relief-server ne compilent plus tant que `data_dir`/`DataDirEnv` n'existent pas : rouge de symbole manquant, attendu.

## Green

- Fichiers : `src/app/relief-app/src/{data_dir.rs,lib.rs,error.rs}`, `src/app/relief-app/Cargo.toml`, `src/analysis/relief-git/src/lib.rs`, `src/analysis/relief-index/src/{cache.rs,lib.rs}`, `src/interfaces/relief-cli/src/main.rs`, `docs/user/src/content/docs/{,en/}getting-started.md`, `docs/dev/rules.md`, `.scratch/review-ui/spec.md`
- Changement : `DataDir`/`DataDirEnv` (résolution, quatre entrées, `relief.json`, migration, `AppError::DataDirFormat` de code `data_dir`), `SessionOptions.data_dir`, `Session::data_dir()`, cache dans `cache/index.sqlite` (créé à l'ouverture), `default_cache_dir` supprimée ; WAL + `busy_timeout` 5 s dans le cache ; `.relief/` exclu de `list_tree` (commits, `WORKTREE`, `INDEX`) ; CLI passe `Some(DataDirEnv::from_process())` ou `None` et complète le message d'erreur de format futur ; doc FR/EN et rules mises à jour.
- Suite : cargo 436 réussis / 1 échoué (baseline 422 ; les 17 tests rouges passent sauf le test CLI ci-dessous). Web/e2e non relancés (UI non touchée). `just` absent de la machine : clippy, fmt et prettier lancés à la main, propres.
- Questions ouvertes : `src/interfaces/relief-cli/tests/cache.rs::unreadable_cache_warns_on_stderr_and_is_rebuilt` (test adapté, indexé) écrit encore le fichier corrompu en `<cache>/index.sqlite` alors que le cache est maintenant `<cache>/cache/index.sqlite` : il faut le corriger côté red (écrire dans `cache/` après `create_dir_all`). Test non modifié.

## Review

- Verdict : fix first, corrigé. Must fix : `README.md` décrivait encore le cache dans `~/.cache/relief/` ; réécrit comme la page « Commencer ».
- Consider (non traités) : pas de test sur un worktree lié (`git worktree add`) ; `relief.json` illisible traité comme absent et réécrit sans écriture atomique ; repli silencieux sur toute erreur de création de `.relief/` (aucun avertissement) ; une entrée nommée exactement `.relief` (fichier ou symlink) n'est pas exclue de `list_tree` ; `Indexer::with_cache` crée le fichier dans un builder.

## Answer

- `relief-app` : `DataDir` et `DataDirEnv`. Résolution : `RELIEF_CACHE_DIR`, sinon `<racine du worktree>/.relief/`, sinon repli `$XDG_CACHE_HOME` ou `~/.cache` + `relief/<repo-id>/` (dépôt bare, création impossible). Crée `cache/`, `state/`, `.gitignore` (`*`) et `relief.json` (`format`, `repoId`, `reliefVersion`). Format ancien ou absent : réécrit ; format futur : `AppError::DataDirFormat` (code `data_dir`), lu avant toute écriture, rien n'est touché.
- `SessionOptions.data_dir: Option<DataDirEnv>` remplace `cache_dir` ; `Session::data_dir()` ; cache d'index dans `cache/index.sqlite` ; `default_cache_dir` supprimée. La CLI passe `DataDirEnv::from_process()`, ou rien avec `--no-cache`.
- `relief-index` : SQLite en WAL avec `busy_timeout` de 5 s.
- `relief-git` : `.relief/` à la racine exclu des arbres de commit, du working tree et de l'index.
- Doc : page « Commencer » FR et EN (« Où relief range ses données »), README, `docs/dev/rules.md`, et `.scratch/review-ui/spec.md` (état « vu » dans `.relief/state/`).
- L'orchestrateur a corrigé un oubli de red dans `relief-cli/tests/cache.rs` (fichier corrompu écrit dans `cache/index.sqlite`).
- Vérifié : cargo 437 passed (baseline 422 + 15), web 308, e2e 58, `just lint` et `just docs-build` propres. Captures de doc inchangées (la page ne gagne que du texte).
