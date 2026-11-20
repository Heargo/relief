# App Tauri : `relief <path>` ouvre la carte

Status: resolved
Type: task
Blocked by: N03
UI: oui
Doc: non ici (N08 réécrit « Commencer »)

Spec: `../spec.md` (Décisions : app native) ; ADR 0006

## À faire

- Crate `src/interfaces/relief-desktop` (Tauri 2), binaire `relief` : `relief [path] [range]`. Composition root : enregistre `TsAdapter` et les detectors, ouvre la `Session`, puis la fenêtre. Pas un dépôt git : message sur stderr, code 2, pas de fenêtre.
- Commandes Tauri `meta`, `snapshot`, `diff`, `review_summary`, `code` : désérialisent la requête, appellent la `Session`, convertissent `AppError` en `ApiError`.
- `ReliefApiService` appelle `invoke` (`@tauri-apps/api`) ; mêmes signatures publiques qu'aujourd'hui.
- Capabilities limitées aux commandes de relief, CSP stricte, aucun plugin shell, fs, http.
- `just dev` : `tauri dev` sur la fixture acme-shop ; `just build` : UI puis app. `relief-server` reste en place jusqu'à N07, pour les e2e Playwright.

## Critères d'acceptation

- [x] Tests Rust des commandes (`tauri::test`, runtime simulé) sur acme-shop : une réponse et une erreur par commande.
- [x] Tests Vitest de `ReliefApiService` avec `invoke` simulé (`@tauri-apps/api/mocks`) : nom de commande, arguments, erreur relayée en `Error` avec le message de l'`ApiError`.
- [x] Vérifié par l'utilisateur : `relief <dossier acme-shop> main...feat/promo-codes` ouvre la carte avec le calque de diff.
- [x] `relief /tmp` (pas un dépôt) : code 2 et message, sans fenêtre.

## Baseline

Après N04 (`c6ef0ae`) : cargo 437 passed, web 308 passed, e2e 58 passed ; `just lint` propre.

## Décisions (orchestrateur)

- **Nom du binaire** : tant que `relief-cli` existe (jusqu'à N07), son binaire s'appelle déjà `relief` et les e2e Playwright en dépendent (`tests/e2e/scripts/serve-acme.mjs`). Deux binaires `relief` dans le workspace entreraient en collision. Le binaire de `relief-desktop` s'appelle donc **`relief-desktop`** pour ce ticket ; N07 supprime `relief-cli` et le renomme `relief` (à noter dans le ticket N07).
- Crate `src/interfaces/relief-desktop` (Tauri 2, dernière 2.x stable). Dépend de `relief-app`, `relief-detect`, `relief-lang-ts`, `relief-model`, `tauri`, `serde`, `clap` ; jamais de `relief-server`. Composition root : `default_detectors()` + `TsAdapter` + `DataDirEnv::from_process()` dans les `SessionOptions`.
- Arguments : `relief-desktop [path] [range]`, `path` par défaut `.`, `range` par défaut HEAD contre le working tree. La `Session` est ouverte **avant** de créer la fenêtre ; erreur d'ouverture (pas un dépôt, plage invalide, ref inconnue, `data_dir`) : message en anglais sur stderr, code 2, aucune fenêtre (rien de Tauri n'est démarré).
- Structure testable : une fonction publique `relief_desktop::builder(session: Arc<Session>) -> tauri::Builder<R>` générique sur le runtime (enregistre l'état et les commandes), utilisée par `main` avec le runtime Wry et par les tests avec `tauri::test::mock_builder()` / `MockRuntime` (feature `test` en dev-dependency).
- Commandes `meta`, `snapshot { rev }`, `diff { range? }`, `review_summary { range? }`, `code { node, side, range? }` (noms d'arguments en camelCase côté JS comme le veut Tauri : `rev`, `range`, `node`, `side`) : construisent la requête typée (`RangeSpec::parse`, `NodeId`, `Side`), appellent la `Session` sur un thread bloquant, renvoient les types de `relief-model` ; l'erreur est l'`ApiError { code, message }` du contrat (code de l'`AppError`, ou `bad_request` pour un argument invalide comme `side`).
- `tauri.conf.json` : `frontendDist` = `../../ui/dist/relief/browser`, `devUrl` = `http://localhost:4200`, `beforeDevCommand`/`beforeBuildCommand` vides (le `justfile` s'en charge). Capabilities : la fenêtre principale n'a que `core:default` restreint au nécessaire et les commandes de relief ; aucun plugin. CSP : `default-src 'self'`, avec seulement ce qu'Angular exige (`style-src 'self' 'unsafe-inline'`, `ipc:` et `http://ipc.localhost` pour l'IPC), aucune origine distante. Icône : une icône PNG simple générée, dans `icons/`.
- **UI, transitoire jusqu'à N07** : `ReliefApiService` garde ses signatures publiques. Dans l'app Tauri (`isTauri()` de `@tauri-apps/api/core`), il appelle `invoke` ; sinon il garde le chemin HTTP actuel, que les e2e Playwright utilisent encore. N07 supprime le chemin HTTP. Une `ApiError` reçue de `invoke` est relayée en `Error(message)`, comme aujourd'hui.
- Dépendances npm de `src/ui` (versions exactes épinglées) : `@tauri-apps/api` (dependencies) et `@tauri-apps/cli` (devDependencies). `just dev` : construit acme-shop, lance `ng serve` puis `npx tauri dev` depuis `src/ui` avec `--config ../interfaces/relief-desktop/tauri.conf.json` (ou équivalent) et les arguments `<acme> main...feat/promo-codes`. `just build` : docs, UI, puis `cargo build --release` (l'app Tauri se construit avec cargo, le bundle n'est pas demandé). Garder une recette `serve-acme` (HTTP) pour `.claude/launch.json` jusqu'à N07.
- Les prérequis Linux (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk+-3.0`) sont présents sur la machine ; les mentionner dans `docs/dev/rules.md` (Commandes / prérequis).

## Seams

1. **Commandes Tauri sur acme-shop** (`src/interfaces/relief-desktop/tests/commands.rs`, `tauri::test` avec `MockRuntime`, `relief-fixtures`) : pour chaque commande, une réponse (comparée à ce que rend la `Session` ou aux valeurs connues d'acme-shop) et une erreur (`invalid_range`, `unknown_ref`, `unknown_node`, `bad_request` pour `side`), avec la forme `{ code, message }`. Attrape : la traduction IPC. Rate : la fenêtre réelle.
2. **Binaire `relief-desktop`** (`assert_cmd`) : sur un dossier qui n'est pas un dépôt git, code 2 et message sur stderr, sans démarrer Tauri (le test passe sans affichage) ; plage invalide sur acme-shop, idem. Attrape : l'ouverture avant la fenêtre. Rate : le cas qui ouvre la fenêtre (vérifié à la main par l'utilisateur).
3. **`ReliefApiService` en Vitest** (`relief-api.service.spec.ts`) : avec `mockIPC` de `@tauri-apps/api/mocks` (et `isTauri` vrai), chaque méthode appelle la bonne commande avec les bons arguments ; une `ApiError` rejetée devient une `Error` avec son message. Les tests HTTP existants restent verts hors Tauri. Attrape : le client de l'UI. Rate : la vraie webview.

## Red

- Fichiers de test : `src/interfaces/relief-desktop/tests/commands.rs`, `src/interfaces/relief-desktop/tests/binary.rs`, `src/ui/src/app/core/services/relief-api.service.spec.ts`. Squelette : `src/interfaces/relief-desktop/{Cargo.toml,src/lib.rs,src/main.rs}` (compile sans `build.rs` ni config) ; `@tauri-apps/api` 2.12.5 (exact) ajouté à `src/ui/package.json`.
- Lancer : `cargo test -p relief-desktop --test commands 2>&1 | tail -30` ; `cargo test -p relief-desktop --test binary 2>&1 | tail -30` ; `cd src/ui && npx ng test --watch=false --include src/app/core/services/relief-api.service.spec.ts 2>&1 | tail -30`
- En échec : 23 tests
  - `commands.rs` (11 tests, le fichier ne compile pas) — `relief_desktop::builder` n'existe pas : meta, snapshot, snapshot unknown_ref, diff, diff sans plage, diff invalid_range, review_summary, review_summary unknown_ref, code, code unknown_node, code bad_request.
  - `binary.rs` (3) — le binaire sort avec le code 0 et sans message : dossier non dépôt, plage invalide `main...`, ref inconnue `nope...main`.
  - `relief-api.service.spec.ts` (9, par timeout de 5 s : le service passe par HTTP, pas par `invoke`) — meta, snapshot, diff, diff sans plage, reviewSummary, code, code sans plage, ApiError relayée en `Error(message)`, ApiError de chaque commande.

## Green

- Fichiers : `src/interfaces/relief-desktop/{Cargo.toml,build.rs,tauri.conf.json,capabilities/main.json,icons/icon.png,permissions/,.gitignore,src/lib.rs,src/main.rs}`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/package.json` + lock (`@tauri-apps/cli` 2.12.6 exact), `justfile` (`dev` = tauri dev, `dev-web` = ancien `dev`, `build` + app, `serve-acme` gardé), `.claude/launch.json` (web-dev -> `dev-web`), `docs/dev/rules.md`, `.scratch/native-app/issues/07-remove-http.md`.
- Changement : `builder<R: Runtime>(Arc<Session>)` + cinq commandes (spawn_blocking, `AppError` -> `ApiError`, `side` invalide -> `bad_request`, node non parsable -> `unknown_node`) ; `main` clap `[path] [range]`, Session ouverte avant Tauri, code 2 + stderr ; `build.rs` déclare les commandes (ACL `allow-*`), capability `main` sans plugin, CSP stricte ; `ReliefApiService` passe par `invoke` si `isTauri()`, HTTP sinon.
- Suite : cargo 451 passed / 0 failed (baseline 437 + 14 rouges) ; web 317 passed / 0 failed (baseline 308 + 9) ; e2e non relancés. fmt, clippy -D warnings, ng build, prettier propres ; `target/debug/relief-desktop /tmp` -> code 2 ; aucun fichier de test modifié. `just` absent de la machine : les commandes de `test-summary` et `lint` ont été lancées à la main, les recettes `dev` / `build` ne sont pas exécutées.
- Questions ouvertes :
  - Les tests `commands.rs` ne passent sous Linux que grâce à un shim `#[cfg(feature = "mock")]` dans `base_builder` (lib.rs) : `mock_builder()` fixe seul la clé d'invocation, et l'URL `http://tauri.localhost` du test n'est « locale » que si le schéma `http` est enregistré (sinon ACL distante, refus). Activé uniquement par une auto-dev-dependency `relief-desktop` avec `features = ["mock"]` ; le binaire de production n'y touche pas.
  - `tauri dev` / la fenêtre réelle non essayés (refusé par l'environnement) ; `just dev` lance la CLI depuis `src/interfaces/relief-desktop` (qui trouve `tauri.conf.json`), à vérifier par l'utilisateur. `just build` compile l'app avec `--features custom-protocol` (UI embarquée).

## Review

- Verdict : ship, sans Must fix.
- Consider (non traités, à reprendre en N07) : remplacer le shim `#[cfg(feature = "mock")]` de `base_builder` (feature `mock` + auto-dev-dependency) par une fonction publique `register<R>(Builder<R>, Arc<Session>) -> Builder<R>` qu'appellent `main` et les tests ; déplacer le parsing de `side`/`node` des commandes vers `relief-app` ; le code `index` d'une erreur de join n'est pas dans le contrat ; un seul transport interne dans `ReliefApiService` quand le chemin HTTP disparaît ; le trap de `just dev` ne tue pas forcément les fils de `ng serve`.

## Vérification

- Automatique : cargo 451 passed, web 317 passed, e2e 58 passed (chemin HTTP de l'UI intact), `just lint` propre ; `relief-desktop /tmp` → code 2, `relief: not a git repository: /tmp`.
- Manuel : l'utilisateur a lancé `relief-desktop .cache/acme-shop main...feat/promo-codes` ; la première fois l'UI s'affichait sans styles, puis correctement après `c0f72fa`.

## Answer

- `src/interfaces/relief-desktop` (Tauri 2), binaire `relief-desktop` jusqu'à N07 (le nom `relief` est encore pris par `relief-cli`). Composition root : `default_detectors()`, `TsAdapter`, `DataDirEnv::from_process()`. La `Session` est ouverte avant toute fenêtre : en cas d'erreur, message sur stderr et code 2.
- Commandes `meta`, `snapshot`, `diff`, `review_summary`, `code`, minces, sur un thread bloquant, `AppError` → `ApiError { code, message }`. Capability `main` limitée aux cinq commandes, aucun plugin, CSP stricte.
- `ReliefApiService` : `invoke` dans l'app (`isTauri()`), chemin HTTP gardé pour les e2e Playwright jusqu'à N07. `@tauri-apps/api` et `@tauri-apps/cli` épinglés.
- `justfile` : `dev` = `tauri dev` sur acme-shop, `dev-web` = l'ancien mode navigateur, `build` construit aussi l'app (`--features custom-protocol`).
- Trouvé à la vérification manuelle : le CSS critique inliné d'Angular (`media="print"` + script inline) est bloqué par la CSP, l'app s'affichait sans styles ; corrigé en désactivant `inlineCritical` (`c0f72fa`). Ce changement de timing a rendu systématique une course déjà présente dans l'UI (changement de plage pendant une animation de niveau), corrigée dans une session séparée (`6079db2`).
- Vérifié : cargo 451, web 317 (puis + le test de `6079db2`), e2e 58/58, `just lint` propre, fenêtre vérifiée par l'utilisateur.
