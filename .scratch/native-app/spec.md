# Spec : refonte, app native et architecture propre (N)

Status: ready-for-agent
Date: 2026-11-19

## But

Remplacer `relief serve` (serveur HTTP + navigateur) par une application native : `relief <path>` ouvre une fenêtre sur le dépôt `path`. Profiter de la migration pour repartir sur une architecture propre plutôt que de faire des compromis : une couche application, des sources rangées par couche sous `src/`, les données d'un dépôt dans son `.relief/`. Une migration lourde est acceptée.

Décisions : ADR 0006 (app native Tauri, sans HTTP), ADR 0007 (`.relief/`), ADR 0008 (couche application, arborescence).

## Décisions

### Arborescence (N01)

- Toutes les sources sous `src/`, par couche : `domain/` (`relief-model`, `relief-diff`, `relief-rules`), `analysis/` (`relief-git`, `relief-adapter-api`, `relief-detect`, `relief-index`, `lang/relief-lang-ts`), `app/` (`relief-app`), `interfaces/` (`relief-desktop`), `ui/` (ex `web/`).
- `tests/` : `e2e/`, `fixtures/` (ex `fixtures/`), `relief-fixtures/` (la crate qui construit les dépôts de test).
- `docs/` : `adr/`, `contract/`, `dev/` (`rules.md`, `workflow.md`, `agents/`), `product/` (`BRAINSTORM.md`, `maquette/`), `user/` (ex `user-docs/`).
- À la racine, seulement ce que les outils exigent : `Cargo.toml`, `Cargo.lock`, `justfile`, `rust-toolchain.toml`, `rustfmt.toml`, `clippy.toml`, `.gitignore`, `README.md`, `CLAUDE.md`. `.relief/` est ajouté au `.gitignore` de relief, qui s'utilise sur lui-même.
- Le déplacement se fait par `git mv`, sans changement de code. Les tickets archivés gardent leurs anciens chemins ; les tickets et specs ouverts sont mis à jour.

### Couches (N02, N03)

- `relief-adapter-api` porte `LanguageAdapter`, `Detector`, `Extraction`, `LinkContext`. `relief-lang-ts` et `relief-detect` ne dépendent plus que d'elle et de `relief-model` ; `relief-index` reçoit des adapters, il n'en connaît aucun.
- `relief-app` porte les cas d'usage. Point d'entrée : `Session::open(path, options)` (dépôt ouvert, indexer, `DataDir`), puis `session.snapshot(req)`, `session.diff(req)`, `session.review_summary(req)`, `session.code(req)`. Les requêtes sont typées (`RangeSpec` parsé une fois, `NodeId`, `Side`) ; les erreurs sont une `AppError` (plage invalide, ref inconnue, nœud inconnu, dépôt invalide, erreur d'index), avec un code stable.
- La `Session` garde le dépôt ouvert et mémorise les snapshots des commits réels ; ceux du working tree et de l'index sont recalculés à chaque demande (le cache par blob les rend rapides).
- La composition root est dans le binaire : il enregistre `TsAdapter` et les detectors, puis ouvre la `Session`.
- Ce qui vit aujourd'hui dans `relief_server::analysis` et dans les handlers passe dans `relief-app`. Les placeholders `crate_name()` disparaissent.

### `.relief/` (N04)

- Selon l'ADR 0007 : `cache/`, `state/`, `.gitignore` (`*`), `relief.json` (version du format, repo-id, version de relief). Un `.relief/` par worktree ; repli sur `~/.cache/relief/<repo-id>/` pour un dépôt bare ou en lecture seule ; `RELIEF_CACHE_DIR` force un dossier ; sans cache possible pour les tests.
- `relief-git` exclut `.relief/` de tout ce qu'il liste (working tree, index, arbres), comme `.git/`.
- SQLite en WAL avec un délai d'attente sur les verrous.

### App native (N05, N06, N07, N08)

- `relief-desktop` (binaire `relief`, Tauri 2) : `relief [path] [range]`, `path` par défaut le dossier courant, `range` par défaut HEAD contre le working tree. Un chemin qui n'est pas un dépôt git : message en anglais sur stderr, code 2, pas de fenêtre.
- Les commandes Tauri miroir des cas d'usage : `meta`, `snapshot`, `diff`, `review_summary`, `code`. Elles convertissent `AppError` en `ApiError { code, message }`. Aucune logique propre.
- `ReliefApiService` appelle `invoke` au lieu de `HttpClient` ; ses signatures publiques ne changent pas, donc les business et leurs tests non plus.
- Capabilities : seulement les commandes de relief. CSP stricte. Aucun plugin shell, fs, http.
- `just dev` lance `tauri dev` sur la fixture acme-shop ; `just build` construit l'UI puis l'app.
- e2e : WebdriverIO + `tauri-driver` sur l'app construite, lancée sur la fixture acme-shop. Les tests Playwright existants sont portés un pour un. Les captures de la doc (`docs/user/screenshots/`) passent par le même harnais.
- `docs/dev/workflow.md` et les agents `tdd-*` : le seam « API HTTP » devient « cas d'usage de `relief-app` » (sur une fixture) et « commande Tauri » ; le seam e2e devient WebdriverIO ; l'étape 7 (vérification d'un ticket d'UI) lance les e2e et lit leurs captures.
- La doc utilisateur est embarquée dans l'app et s'ouvre dans une fenêtre (lien « Aide »), hors ligne.
- Une fois l'app et ses e2e en place, le mode HTTP disparaît : `relief-server`, `relief-cli` (`show`, `diff`, `serve`), axum, `rust-embed`, `HttpClient`.

## Hors périmètre (reporté)

- L'intégration au terminal et au système : sous-commandes sans interface (`relief show`, `relief diff`, `relief check` d'A02), détachement du terminal et `--wait`, une seule instance pour plusieurs fenêtres, paquets `.deb`, AppImage, `.dmg`, `.msi`.
- Événements poussés par le cœur (progression de l'indexation, working tree modifié) et surveillance des fichiers.
- Adapters MCP ou VS Code.

Ces points sont réévalués avec le reste de la roadmap par N09.
