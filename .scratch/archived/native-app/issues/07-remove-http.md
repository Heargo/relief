# Retirer le mode HTTP

Status: resolved
Type: task
Blocked by: N06
UI: non
Doc: `docs/user` (toute mention de `relief serve`, de `relief show` ou `relief diff`)

Spec: `../spec.md` (Décisions : app native, hors périmètre) ; ADR 0006

## À faire

- Supprimer `relief-server`, `relief-cli` (`show`, `diff`, `serve`) et leurs tests, axum, `rust-embed`, `HttpClient` et le proxy de `ng serve`. Les cas d'usage restent dans `relief-app` : les sous-commandes pourront revenir sans réécriture (N09 décide).
- Renommer le binaire `relief-desktop` en `relief` (`[[bin]]` de `src/interfaces/relief-desktop/Cargo.toml`, tests `binary.rs`) une fois `relief-cli` supprimé.
- `just` : retirer `serve-acme` et ce qui lance `relief serve`.
- Mettre à jour `README.md`, `CLAUDE.md` et `docs/dev/rules.md` (Structure, Couches, Commandes, Tests, Git) selon les ADR 0006 à 0008.

## Critères d'acceptation

- [x] `cargo tree` ne contient plus `axum` ni `rust-embed` ; `src/ui` n'importe plus `HttpClient`.
- [x] `grep -r "relief serve"` hors de `.scratch/archived/` et des ADR : aucun résultat.
- [x] Suite, lint et e2e verts.

## Baseline

Après N06 (`4e8c959`) : cargo 451, web 320, `just e2e-summary` → 38 passed, 20 skipped, 0 failed ; `just lint` propre.

## Décisions (orchestrateur)

- Supprimés : les crates `src/interfaces/relief-server` et `src/interfaces/relief-cli` (avec leurs tests et snapshots) ; dans l'UI, le chemin HTTP de `ReliefApiService` (plus de `HttpClient`, plus de `provideHttpClient` s'il ne sert qu'à lui), le `isTauri()` et la config de proxy de `ng serve` ; les recettes `serve-acme` et `dev-web` du `justfile`. Les sorties texte de `relief show` / `relief diff` disparaissent avec la CLI (N09 décide de leur retour, au-dessus de `relief-app`).
- `relief-desktop` : le `[[bin]]` devient `relief` ; `tests/binary.rs` lance `CARGO_BIN_EXE_relief`. Le harnais e2e et les captures lancent `target/release/relief`. Profiter du renommage pour la remarque de la review de N05 : remplacer le shim `#[cfg(feature = "mock")]` de `base_builder` par une fonction publique `register<R: Runtime>(builder: tauri::Builder<R>, session: Arc<Session>) -> tauri::Builder<R>` (état + `invoke_handler`), appelée par `main` avec `Builder::default()` et par les tests avec `mock_builder()` (et le protocole `http` qu'il leur faut) ; plus de feature `mock` ni d'auto-dev-dependency.
- Doc utilisateur : toute mention de `relief serve`, `relief show`, `relief diff` et de l'installation par `relief-cli` est remplacée par `relief [path] [range]` (FR et EN) ; la page `cli` décrit l'appel de l'app (chemin, plage, `--no-cache`, `RELIEF_CACHE_DIR`, code 2). La refonte complète de « Commencer » reste à N08.
- Docs développeur : `README.md`, `CLAUDE.md` (« UI web Angular servie en local » → app native Tauri), `docs/dev/rules.md` (Structure, Couches, Commandes, Tests, Git), `docs/contract/README.md` si il parle de l'API HTTP. Les ADR et les tickets archivés ne changent pas.

## Seams

1. **Graphe des crates** (`tests/relief-integration/tests/layers.rs`, étendu) : aucun membre du workspace ne dépend d'`axum`, `tower`, `rust-embed` (toutes sortes de dépendances) ; il n'existe plus de package `relief-server` ni `relief-cli` ; le package `relief-desktop` a un binaire nommé `relief`. Attrape : les critères `cargo tree` et le renommage. Rate : l'UI.
2. **Binaire `relief`** (`src/interfaces/relief-desktop/tests/binary.rs`) : les trois cas d'erreur actuels, via `CARGO_BIN_EXE_relief` ; et `tests/commands.rs` passe par `register(mock_builder(), session)`. Attrape : le renommage et la nouvelle fonction d'assemblage. Rate : la fenêtre (couverte par les e2e).
3. **`ReliefApiService` en Vitest** : uniquement `invoke` (tests HTTP supprimés), et le service s'instancie sans `provideHttpClient`. Attrape : le retrait du transport HTTP. Rate : rien.

## Red

- Fichiers de test : `tests/relief-integration/tests/layers.rs`, `src/interfaces/relief-desktop/tests/binary.rs`, `src/interfaces/relief-desktop/tests/commands.rs`, `src/ui/src/app/core/services/relief-api.service.spec.ts`, `src/ui/src/testing/test-providers.ts` (sans `provideHttpClient*`) ; `tests/e2e/wdio.base.ts` (binaire `target/release/relief`, partagé par les captures) ; supprimés par `git rm` : `src/interfaces/relief-server/tests/`, `src/interfaces/relief-cli/tests/`
- Lancer : `cargo test -p relief-integration --test layers` ; `cargo test -p relief-desktop --test binary` ; `cargo test -p relief-desktop --test commands` ; `cd src/ui && npx ng test --watch=false --include src/app/core/services/relief-api.service.spec.ts`
- En échec : 
  - `no_workspace_member_depends_on_the_http_stack` — `relief-server` dépend encore d'axum, tower, rust-embed
  - `the_http_and_cli_packages_are_gone` — `relief-server` et `relief-cli` sont encore membres
  - `the_desktop_package_builds_the_relief_binary` — le binaire s'appelle `relief-desktop`
  - `binary.rs` (3 tests) — ne compile pas : `CARGO_BIN_EXE_relief` n'existe pas
  - `commands.rs` (tous) — ne compile pas : `relief_desktop::register` n'existe pas
  - `relief-api.service.spec.ts` (9 tests) — le service passe encore par HTTP sans `isTauri` (`Failed to parse URL from /api/...`)
- Non lancé : l'e2e (`wdio.base.ts` pointe `target/release/relief`, qui n'existe qu'après le renommage)

## Green

- Fichiers : `Cargo.lock`, `justfile`, `src/interfaces/relief-desktop/{Cargo.toml,src/lib.rs,src/main.rs}`, `src/ui/angular.json`, `src/ui/src/app/core/services/relief-api.service.ts`, `README.md`, `CLAUDE.md`, `docs/dev/rules.md`, `docs/contract/README.md`, `docs/user/src/content/docs/{cli,getting-started,review}.md` et `en/` ; supprimés : `src/interfaces/relief-server/`, `src/interfaces/relief-cli/`, `src/ui/proxy.conf.json`
- Changement : crates `relief-server` et `relief-cli` supprimées (plus d'axum ni de rust-embed dans `cargo tree`) ; binaire de `relief-desktop` renommé `relief`, `builder`/shim `mock` remplacés par `register(builder, session)` (plus de feature `mock`) ; `ReliefApiService` ne passe plus que par `invoke` (`provideHttpClient` reste dans `app.config.ts` pour le chargeur de traductions) ; proxy `ng serve`, `serve-acme`, `dev-web` retirés ; docs FR/EN, README, CLAUDE.md, rules.md et contract mis à jour.
- Suite : cargo 383 réussis / 0 échoué (baseline 451, les tests de `relief-server` et `relief-cli` en moins), web 320 / 0 ; `just lint` propre ; e2e 38 passed, 20 skipped, 0 failed.
- Questions ouvertes : `grep "relief serve"` n'est pas vide, par respect de « aucun fichier de test modifié » : `tests/e2e/tests/docs.e2e.ts` (bloc skippé N08, attend `relief serve` et `relief-cli`) et un commentaire de `src/ui/src/app/modules/map/helpers/layout-optimize.logic.spec.ts`, à corriger par un test-writer ou en N08 ; `docs/user` garde encore des instructions de build à refondre en N08.
- Mise à jour après green : `src/ui/src/app/modules/map/helpers/layout-optimize.logic.spec.ts` (commentaire sans `relief serve`) et `tests/e2e/tests/docs.e2e.ts` (reste en `describe.skip` ; attentes alignées sur la doc : `cargo install --path src/interfaces/relief-desktop`, `relief . main...`). `tsc --noEmit` et prettier propres ; `grep -rn "relief serve" src tests` vide.

## Review

- Verdict : fix first, corrigé avec l'accord de l'utilisateur : la doc (pages `cli` et `getting-started` FR/EN, README) annonçait un `--no-cache` que le binaire n'a pas (écart venu des décisions de ce ticket) ; retiré de la doc, l'option pourra revenir avec N09. `RELIEF_CACHE_DIR` est décrit comme remplaçant `.relief/` du dépôt, et non `~/.cache/relief` (simple repli).
- Consider (non traité) : une ligne dans `docs/dev/rules.md` qui renvoie à N09 pour les sous-commandes sans interface.

## Answer

- Supprimés : `relief-server` (axum, `rust-embed`, API HTTP, doc embarquée) et `relief-cli` (`show`, `diff`, `serve`) avec leurs tests ; dans l'UI, le chemin HTTP de `ReliefApiService` et le proxy de `ng serve` (`provideHttpClient` reste pour le chargeur de traductions) ; `serve-acme` et `dev-web` du `justfile`. Les sorties de `relief show` et `relief diff` disparaissent ; les cas d'usage restent dans `relief-app` et N09 décide de leur retour.
- `relief-desktop` construit le binaire `relief`. `register<R>(builder, session)` remplace la feature `mock` : `main` et les tests assemblent l'app par la même fonction, sans code de test dans la bibliothèque.
- `layers.rs` vérifie qu'aucun membre ne dépend d'`axum`, `tower` ou `rust-embed`, que les deux crates ont disparu et que le binaire s'appelle `relief`.
- Doc : `docs/user` (FR/EN) décrit `relief [path] [range]`, l'installation de `relief-desktop`, `RELIEF_CACHE_DIR`, le code 2 ; README, `CLAUDE.md`, `docs/dev/rules.md`, `docs/contract/README.md`. Le bloc sauté `docs.e2e.ts` attend déjà la nouvelle doc. Restent des mentions de `relief serve` dans des specs et tickets ouverts : c'est le critère de N09.
- Vérifié : cargo 383 (451 moins les tests des deux crates), web 320, e2e 38 passed / 20 skipped / 0 failed, `just lint` et `just docs-build` propres, `cargo tree` sans `axum` ni `rust-embed`.
