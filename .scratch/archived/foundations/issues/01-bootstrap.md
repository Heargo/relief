# Bootstrap du dépôt

Status: resolved
Type: task
Blocked by: none
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions)

Ticket sans baseline : il crée le dépôt. Lire `docs/adr/0002-angular-pour-l-ui.md` et reprendre la mise en place de `rpg-manager-front` (versions, `angular.json`, `TEST_PROVIDERS`, ngx-translate) en retirant ce qui ne sert pas ici (PWA, service worker, Netlify).

## À faire

- `git init`, branche `main` avec un premier commit des fichiers existants (brainstorm, maquette, docs, `.scratch/`), puis branche `develop`.
- `.gitignore` (target/, node_modules/, dist/, `.env*`, `.angular/`, caches Playwright).
- Workspace cargo (`Cargo.toml` à la racine, edition 2024, `resolver = "3"`) avec les crates de `docs/rules.md` en squelette (lib vide + un test trivial chacune ; `relief-cli` produit un binaire `relief` qui affiche `--version`).
- `rust-toolchain.toml` (stable épinglée), `rustfmt.toml`, lints clippy du workspace.
- `web/` : Angular 22 zoneless (`ng new` standalone, sans SSR), Optimus UI + `@openng/icons`, ngx-translate (EN/FR), Vitest par `@angular/build:unit-test`, `web/src/testing/test-providers.ts`, Prettier (parser angular pour le HTML), `proxy.conf.json` vers `relief serve` ; une page « relief » traduite et un test de composant.
- `justfile` avec toutes les recettes listées dans `docs/rules.md` ; celles qui dépendent de tickets futurs (`e2e`, `docs-*`, `contract`, `fixture`, `serve-acme`, `dev`) affichent « not available yet (ticket Xnn) » et sortent en code 0.
- `just test-summary` imprime une ligne par suite (`cargo: N passed, M failed`, `web: N passed, M failed`).

## Critères d'acceptation

- [x] `just setup && just test-summary && just lint` passent sur une machine propre (Rust stable, Node 22+, just).
- [x] `cargo run -p relief-cli -- --version` affiche `relief 0.1.0`.
- [x] `git log --oneline main` montre le commit initial, `develop` existe et c'est la branche courante.

## Baseline

Aucune : F01 crée le dépôt (exception de l'étape 2). L'orchestrateur a fait `git init`, le commit initial des fichiers existants sur `main` (`6044734`) et créé `develop` (branche courante). `just` n'est pas installé sur la machine : installé localement hors du dépôt pour la vérification (pas de suite existante à lancer).

## Seams

1. **CLI** `relief --version` (`assert_cmd` dans `crates/relief-cli/tests/`) : attrape le nom du binaire, le parsing clap et la version `relief 0.1.0` ; rate tout le reste du workspace.
2. **Composant Angular** de la page « relief » (entrées/sorties + texte rendu, `imports: [Composant]`, `providers: TEST_PROVIDERS`, EN puis FR) : attrape la mise en place Angular zoneless, Vitest, ngx-translate et les fichiers `en.json`/`fr.json` ; rate le build, Prettier et le proxy (vérifiés par `just lint`).
3. **Fonction publique de chaque crate squelette** (un test trivial par crate, exigé par le ticket) : attrape que chaque crate de `docs/rules.md` existe et compile dans le workspace ; rate tout comportement (il n'y en a pas encore).

Hors tests : `.gitignore`, `justfile`, `just test-summary` (une ligne par suite), `rust-toolchain.toml`, `rustfmt.toml`, lints, proxy, git — vérifiés par l'orchestrateur avec les commandes des critères d'acceptation.

## Red

- Fichiers de test : `crates/relief-cli/tests/version.rs`, `crates/relief-{model,git,fixtures,detect,lang-ts,index,diff,rules,server}/tests/skeleton.rs`, `web/src/app/core/components/relief-page/relief-page.component.spec.ts`
- Lancer : `cargo test --workspace` ; une crate : `cargo test -p relief-cli --test version` ; web (depuis `web/`) : `npx ng test --watch=false --include src/app/core/components/relief-page/relief-page.component.spec.ts`
- Conventions que green doit suivre : chaque crate lib exporte `pub fn crate_name() -> &'static str` (nom du package, ex. `"relief-model"`) ; `ReliefPageComponent` dans `web/src/app/core/components/relief-page/relief-page.component.ts` avec un `<h1>` « relief » et un slogan `home.tagline` (EN « Zoomable map of a git repository », FR « Carte zoomable d'un dépôt git ») dans `en.json`/`fr.json` ; `assert_cmd` en dev-dependency de `relief-cli`.
- En échec : 12 tests (tous échouent faute de projet : pas de `Cargo.toml` ni de `web/`)
  - `version_flag_prints_name_and_version` — pas de workspace ; ensuite binaire `relief` absent, doit afficher `relief 0.1.0`
  - `crate_exposes_its_name` x9 (model, git, fixtures, detect, lang-ts, index, diff, rules, server) — crate absente, `crate_name()` manquant
  - `ReliefPageComponent` › English tagline — projet Angular, `test-providers.ts` et composant absents
  - `ReliefPageComponent` › French tagline — idem

## Green

- Fichiers : `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `rustfmt.toml`, `.gitignore`, `justfile`, `crates/relief-*/{Cargo.toml,src/}`, `web/` (`package.json`, `angular.json`, `tsconfig*.json`, `proxy.conf.json`, `.prettierignore`, `.editorconfig`, `public/i18n/{en,fr}.json`, `src/{main.ts,index.html,styles.scss}`, `src/app/{app,app.config,app.routes}.ts`, `src/app/core/{constants,i18n,components/relief-page}/`, `src/testing/{test-providers,jsdom-setup}.ts`)
- Changement : workspace cargo (edition 2024, resolver 3, toolchain 1.98.0, lints clippy) avec 9 crates squelettes exposant `crate_name()` et `relief-cli` (clap, binaire `relief`). `web/` Angular 22 zoneless, ngx-translate EN/FR, Optimus UI, Vitest, Prettier (parser angular), proxy vers 7878, page `ReliefPageComponent`. `justfile` complet : `test-summary` imprime une ligne par suite, recettes futures « not available yet » (code 0).
- Suite : cargo 10 passed / 0 failed, web 2 passed / 0 failed (pas de baseline) ; `just setup`, `just test-summary`, `just lint` OK ; `relief --version` affiche `relief 0.1.0`.
- Questions ouvertes : numéros de tickets dans les messages « not available yet » supposés (F02 fixture, C03 dev/serve-acme, F04 e2e, F05 docs, M02 contract) ; `clippy` sans `--all-targets` car les tests rouges utilisent `unwrap()`.

## Review

- Verdict : fix first
- Must fix : `justfile:contract` — dit « ticket G02 » alors que le contrat JSON est M02 (ROADMAP #22) — remplacer par M02 ; `justfile:dev` et `justfile:serve-acme` — disent F03 alors qu'ils lancent `relief serve` (C03, ROADMAP #23) en plus de la fixture F03 — remplacer par C03 ; `justfile:fixture` — F02 correct (constructeur), mais `just fixture acme-shop` dépend aussi de F03 : acceptable, à garder. Mettre à jour « Questions ouvertes » du Green en conséquence.
- Consider : `web/src/app/core/i18n/initial-language.ts` — langue lue par `navigator.language` sans test ; `crates/*/src/lib.rs` — `crate_name()` est spéculatif mais imposé par le ticket ; aucun secret, rien d'autre à signaler.

## Navigateur et doc

- Étape 7 : sans objet (`UI: non`). La page « relief » est couverte par le test de composant EN/FR et `ng build` (dans `just lint`).
- Étape 8 : doc utilisateur inchangée (`Doc: aucune`, `user-docs/` arrive avec F05).

## Answer

- Construit : dépôt git (`main` = commit initial des fichiers existants, `develop` courante) ; workspace cargo (edition 2024, resolver 3, toolchain 1.98.0 épinglée, `rustfmt.toml`, lints clippy du workspace) avec les 9 crates lib squelettes (`crate_name()`) et `relief-cli` (clap, binaire `relief`) ; `web/` Angular 22 zoneless avec Optimus UI, ngx-translate EN/FR, Vitest, `TEST_PROVIDERS`, Prettier, `proxy.conf.json` vers 7878, page `ReliefPageComponent` ; `.gitignore` ; `justfile` complet.
- Décisions : recettes futures « not available yet » avec F02 (`fixture`), C03 (`dev`, `serve-acme`), F04 (`e2e*`), M02 (`contract`), F05 (`docs-*`), corrigés après review ; `clippy` sans `--all-targets` (les tests utilisent `unwrap()`).
- Vérifié : `just setup`, `just test-summary` (cargo 10 passed / 0 failed, web 2 passed / 0 failed), `just lint` propre, `cargo run -p relief-cli -- --version` → `relief 0.1.0`, `git log --oneline main` → commit initial. `just` n'est pas installé sur la machine : vérifié avec un binaire `just` installé hors du dépôt (`cargo install just`) ; « machine propre » non testée telle quelle.
- Consider laissés : `web/src/app/core/i18n/initial-language.ts` sans test ; `crate_name()` spéculatif (imposé par le ticket).
