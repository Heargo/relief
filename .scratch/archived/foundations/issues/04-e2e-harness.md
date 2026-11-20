# Harnais e2e Playwright

Status: resolved
Type: task
Blocked by: C03
UI: oui
Doc: aucune

Spec: `../spec.md`, `docs/adr/0003-tests-e2e-playwright-et-fixtures.md`

## À faire

- `e2e/` : projet Playwright TypeScript (`@playwright/test`, version épinglée), Chromium en local, Firefox et WebKit derrière une variable `E2E_ALL_BROWSERS=1`.
- `webServer` : construit la fixture acme-shop dans un dossier temporaire (`relief-fixtures build`), puis lance `target/release/relief serve <dossier> --port 7879 --no-open` ; `reuseExistingServer` en local.
- Helper `openRelief(page, { range })` qui ouvre l'UI sur une plage donnée.
- Un premier test : la page s'ouvre, le titre contient le nom du dépôt, aucune erreur dans la console.
- Recettes `just e2e` (build release + UI, puis Playwright) et `just e2e-summary` (une ligne `e2e: N passed, M failed`).

## Critères d'acceptation

- [x] `just e2e-summary` affiche `e2e: 1 passed, 0 failed` sur une machine propre.
- [x] Un test qui échoue laisse une trace Playwright dans `e2e/test-results/` (ignoré par git).

## Baseline

`just test-summary` sur `develop` (27af5a0) : `cargo: 320 passed, 0 failed`, `web: 3 passed, 0 failed`. Pas encore de suite e2e (`just e2e-summary` affiche « not available yet »). Navigateurs Playwright déjà présents dans `~/.cache/ms-playwright` (chromium-1248).

## Seams

1. **Test e2e Playwright** `e2e/tests/smoke.spec.ts` contre `relief serve` sur acme-shop construit dans un dossier temporaire, via `openRelief(page, { range })` : attrape le harnais complet (fixture, binaire release, UI embarquée, titre avec le nom du dépôt, console sans erreur) ; rate ce qui n'est pas encore à l'écran (pas d'écran avant U01).
2. **Recette `just e2e-summary`** (sortie `e2e: N passed, M failed`, code de sortie) : attrape l'intégration build + Playwright + résumé et l'absence de processus laissé derrière ; rate le détail d'un échec (couvert par la trace dans `e2e/test-results/`, vérifiée à la main par un test volontairement cassé puis retiré).

## Red

- Fichiers de test : `e2e/tests/smoke.spec.ts` (importe `openRelief` depuis `e2e/helpers/open-relief.ts`, à créer par green)
- Lancer : `/tmp/claude-1000/-home-hugo--claude-spares-spare-XjDkAV/60e653f8-7f70-4c57-956f-28b4fc18138b/scratchpad/just/bin/just e2e-summary` (attendu après green : `e2e: 1 passed, 0 failed`) ; un fichier : `npm --prefix e2e exec playwright test tests/smoke.spec.ts`
- En échec : 1 test
  - `opens the UI on acme-shop with the repo name in the title and a clean console` — le projet `e2e/` n'existe pas (pas de package.json, de config Playwright, de `@playwright/test`, ni du helper `helpers/open-relief.ts`) ; la recette `just e2e-summary` affiche encore « not available yet ». Une fois le harnais en place, le test échouera encore tant que le titre reste `relief` (`web/src/index.html`) : il doit contenir `acme-shop` (nom du dépôt, à tirer de `/api/meta` champ `repo`).

### Notes pour green

- `openRelief(page, { range })` : ouvre l'UI sur la plage (`main...feat/promo-codes` dans le test) ; `relief serve` sert aujourd'hui l'UI embarquée (placeholder « UI not built » si non buildée, d'où le build UI avant release).
- Le test attend un titre contenant `acme-shop` et zéro `console.error` / `pageerror`.
- Lancer `relief serve` avec `--no-open` et `--no-cache` (ou `RELIEF_CACHE_DIR` temporaire), port 7879 ; fixture acme-shop construite dans un dossier temporaire ; aucun processus laissé derrière (serveur et dossier nettoyés).
- `@playwright/test` en devDependency à version épinglée, `package-lock.json` commité ; Chromium seul en local (pas de `--with-deps`, pas d'install globale) ; `e2e/test-results/` ignoré par git.
- Prettier (config de `web/`) vérifie le TS ; `just setup` installe déjà `e2e/` s'il a un package.json.
- `e2e/` doit porter sa config Prettier (comme `web/package.json` : `singleQuote`, `printWidth` 100) puis reformater `tests/smoke.spec.ts`, écrit ici en guillemets doubles faute de config.

## Green

- Fichiers : `e2e/{package.json,package-lock.json,tsconfig.json,playwright.config.ts,helpers/open-relief.ts,scripts/serve-acme.mjs}`, `e2e/tests/smoke.spec.ts` (prettier seul), `justfile`, `web/src/app/app.config.ts`, `web/src/app/core/services/document-title.service.ts`
- Changement : projet Playwright épinglé à `@playwright/test` 1.64.1 (chromium-1248), Chromium par défaut, Firefox/WebKit via `E2E_ALL_BROWSERS=1`, trace `retain-on-failure`. `webServer` lance `scripts/serve-acme.mjs` (acme-shop dans `<tmp>/acme-shop`, `relief serve` sur 7879, nettoyage du serveur et du dossier à l'arrêt). Recettes `e2e` et `e2e-summary` (build release + UI d'abord), `setup` n'installe que Chromium. Titre de page `<repo> · relief` via `DocumentTitleService` (initialiseur d'app, tiré de `/api/meta`).
- Suite : cargo 320/0, web 3/0 (= baseline) ; e2e 1 passed, 0 failed ; test cassé temporaire : trace.zip dans `e2e/test-results/`, retiré.
- Questions ouvertes : `openRelief` passe la plage en `/?range=...` (aucun routage n'existe avant U01, à réajuster alors).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `e2e/playwright.config.ts` : `baseURL` et `url` du webServer en `localhost` alors que le serveur écoute sur 127.0.0.1 ; préférer `127.0.0.1` (risque si `localhost` résout d'abord en `::1`).
  - `e2e/helpers/open-relief.ts` : `waitForLoadState('networkidle')` est fragile ; attendre un élément visible dès U01, avec l'URL `/?range=` à réajuster quand le routage existera.
  - Plage `main...feat/promo-codes` dupliquée entre la config et le test ; une constante partagée dans `helpers/`.
  - `DocumentTitleService` sans test unitaire (couvert par le smoke e2e).
  - `just e2e-summary` compte les lignes `✓` du reporter `list` ; fragile si le format change (garde-fou `passed > 0`).

## Vérification dans le navigateur

`just e2e-summary` : `e2e: 1 passed, 0 failed`. Pas de passage manuel (`preview_start`) : aucun écran à parcourir avant U01, seul le titre de page change, couvert par le test e2e (titre + console sans erreur).

## Documentation

Pas de page à mettre à jour (`Doc: aucune`, F05 n'existe pas encore). À documenter quand le site existera : le titre d'onglet `<repo> · relief`, et côté contributeurs `just e2e` / `just e2e-summary` (Chromium seul par défaut, `E2E_ALL_BROWSERS=1` pour Firefox et WebKit, traces dans `e2e/test-results/`).

## Answer

- Construit : projet `e2e/` (`@playwright/test` 1.64.1 épinglé, lockfile, tsconfig, Prettier aligné sur `web/`), `playwright.config.ts` (Chromium ; Firefox/WebKit si `E2E_ALL_BROWSERS=1` ; trace `retain-on-failure` dans `e2e/test-results/`, ignoré par git), `scripts/serve-acme.mjs` (construit acme-shop dans `<tmp>/acme-shop`, lance `target/release/relief --repo … --no-cache serve main...feat/promo-codes --port 7879 --no-open`, tue le serveur et supprime le dossier à l'arrêt), helper `openRelief(page, { range })`, smoke test. Côté web, `DocumentTitleService` (initialiseur d'application) met le titre à `<repo> · relief` depuis `/api/meta`. Recettes `just e2e`, `just e2e-summary` ; `just setup` n'installe que Chromium.
- Décisions : version 1.64.1 choisie pour correspondre au Chromium déjà en cache (chromium-1248) ; le nom du dépôt vient du nom du dossier de la fixture. Seule modification du test par green : reformatage Prettier (guillemets).
- Vérifié : cargo 320/0 et web 3/0 (= baseline), `e2e: 1 passed, 0 failed`, `just lint` propre, aucun processus `relief serve` ni dossier temporaire restant ; un test volontairement cassé (retiré) donne `e2e: 1 passed, 1 failed` et laisse `trace.zip` dans `e2e/test-results/`.
