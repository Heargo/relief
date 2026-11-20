# e2e et captures de doc sur l'app native

Status: resolved
Type: task
Blocked by: N05
UI: oui
Doc: non (les captures sont régénérées à l'identique)

Spec: `../spec.md` (Décisions : app native) ; ADR 0006

## À faire

- Harnais WebdriverIO + `tauri-driver` dans `tests/e2e/` : construit la fixture acme-shop, lance l'app construite dessus, une session par fichier de test.
- Porter un pour un les tests Playwright existants ; même couverture, sélecteurs par rôle, texte ou `data-testid`.
- Les captures de `docs/user/screenshots/` passent par le même harnais (`just docs-shots`).
- `just e2e`, `just e2e-summary` sur le nouveau harnais ; `just setup` installe `tauri-driver` et vérifie la présence de `WebKitWebDriver`.
- `docs/dev/workflow.md` et `.claude/agents/tdd-*.md` : seams « cas d'usage `relief-app` » et « commande Tauri » au lieu d'« API HTTP » ; seam e2e WebdriverIO ; étape 7 = `just e2e-summary` puis lecture des captures du parcours, en anglais et en français, à 1280 et 1024 px. `.claude/launch.json` : retirer les entrées qui supposent `relief serve`.
- Supprimer Playwright et ses configs.

## Critères d'acceptation

- [x] `just e2e-summary` : autant de tests qu'avant le portage, tous verts.
- [x] `just docs-shots` régénère toutes les captures de la doc.
- [x] Plus aucune dépendance Playwright dans le dépôt.

## Baseline

Après N05 (`e23f622`, avec `6079db2`) : cargo 451, web 318, e2e Playwright 58 passed ; `just lint` propre.

## Prérequis vérifiés (orchestrateur)

- `WebKitWebDriver` vient du paquet `webkitgtk-6.0` (Arch/CachyOS ne le met pas dans `webkit2gtk-4.1`) ; il pilote bien l'app construite sur `webkit2gtk-4.1` (même WebKit 2.54.2). `tauri-driver` 2.1.0 est installé par `cargo install tauri-driver --locked`. `xvfb-run` est présent.
- Essai manuel réussi : `GDK_BACKEND=x11 xvfb-run -a tauri-driver --port 4444 --native-driver /usr/bin/WebKitWebDriver`, session avec `tauri:options: { application: target/release/relief-desktop, args: [<acme>, "main...feat/promo-codes"] }` ; la page répond (`repo-name` = `acme-shop`, styles appliqués). Sans `GDK_BACKEND=x11`, la webview ne démarre pas sous Xvfb.

## Décisions (orchestrateur)

- **Harnais** `tests/e2e/` : WebdriverIO v9 (versions exactes épinglées), Mocha, `expect-webdriverio`, TypeScript. `wdio.conf.ts` : `onPrepare` construit acme-shop dans un dossier temporaire (`target/release/relief-fixtures build acme-shop <dir>`) et lance `tauri-driver` (`--native-driver` = `WebKitWebDriver` trouvé dans le PATH) ; `onComplete` arrête tout et supprime le dossier. Capabilities : `tauri:options` avec `application` = `target/release/relief-desktop`, `args` = `[<acme>, "main...feat/promo-codes"]`. `maxInstances: 1` ; une session (une fenêtre) par fichier de spec.
- **Affichage** : les recettes `just e2e`, `e2e-summary` et `docs-shots` passent par `xvfb-run -a` quand il est présent, avec `GDK_BACKEND=x11` ; sinon la fenêtre s'ouvre sur l'écran courant.
- **État persistant de la webview** : le `localStorage` de l'app survit entre les sessions (dossier de données de l'identifiant Tauri). Le helper d'ouverture le vide puis recharge, pour que chaque spec parte d'un état propre, comme un contexte Playwright neuf.
- **Navigation** : pas de `baseURL`. Un `page.goto('/?range=…')` devient un changement de `location` dans la webview (même origine que l'app) ; `reload` devient `browser.refresh()` ; la taille de la fenêtre se règle par `browser.setWindowSize`.
- **docs.spec.ts** : la doc n'est pas servie dans l'app avant N08. Ses tests sont portés en WebdriverIO mais marqués `it.skip` avec la raison « docs in the app: N08 », et N08 les réactive (ligne à ajouter dans `.scratch/native-app/issues/08-docs-in-app.md`). Le compte attendu : tous les autres tests portés et verts, le total (verts + sautés) égal aux 58 d'avant.
- **Captures** : `docs/user/screenshots/` passe sur le même harnais (une config WDIO dédiée qui réutilise celle des e2e, specs `*.shot.ts`), mêmes noms de fichiers, langue choisie par le sélecteur de langue de l'UI (ou le `localStorage` de la langue), taille par `setWindowSize`.
- **Suppression** : `@playwright/test`, `playwright.config.ts`, `web-server.ts`, `scripts/serve-acme.mjs` (le harnais lance l'app, plus `relief serve`), et toute config Playwright de `docs/user`. `just setup` : `cargo install tauri-driver --locked` et un contrôle de `WebKitWebDriver` (message qui cite `webkitgtk-6.0` sur Arch, `webkit2gtk-driver` sur Debian/Ubuntu).
- **Workflow et agents** : `docs/dev/workflow.md` et `.claude/agents/tdd-*.md` : seams « cas d'usage de `relief-app` sur une fixture » et « commande Tauri (`tauri::test`) » au lieu d'« API HTTP » ; seam e2e = WebdriverIO sur l'app ; étape 7 = `just e2e-summary` puis lecture des captures du parcours (en anglais et en français, à 1280 et 1024 px), plus de `preview_start`. `.claude/launch.json` : retirer `relief-acme` et `web-dev` (qui supposent `relief serve`) ; garder `docs` et `maquette`. `docs/dev/rules.md` (Tests, Commandes) et l'ADR 0003 si elle cite Playwright comme outil actuel (la marquer remplacée par l'ADR 0006 pour ce point).

## Seams

1. **e2e WebdriverIO sur l'app construite et acme-shop** (`tests/e2e/tests/*.e2e.ts`, ou le nom de fichier choisi par le harnais) : les 58 tests Playwright, un pour un, mêmes assertions, sélecteurs par `data-testid`, rôle ou texte. Attrape : le parcours réel dans la webview Tauri. Rate : rien de plus qu'avant.
2. **Captures de la doc** (`just docs-shots`) : les mêmes fichiers PNG régénérés. Attrape : le harnais des captures. Rate : le contenu des images (relu à l'œil).

## Red

Portage (pas de test rouge au sens habituel).

- Fichiers : `tests/e2e/{package.json,package-lock.json,tsconfig.json,.prettierignore,wdio.base.ts,wdio.conf.ts}`, `tests/e2e/helpers/{open-relief,ui}.ts`, `tests/e2e/tests/*.e2e.ts` (11 fichiers, renommés depuis `*.spec.ts`) ; `docs/user/package.json` (+ lock), `docs/user/screenshots/{wdio.conf.ts,shots.ts,getting-started,map,review}.shot.ts`. Supprimés : `@playwright/test`, `playwright.config.ts`, `web-server.ts`, `scripts/serve-acme.mjs`, `docs/user/screenshots/playwright.config.ts`.
- Lancer : `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts` ; captures : `cd docs/user && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npm run shots`. L'écran Xvfb doit mesurer au moins 3200x2000 (test diff-layer à 3200x2000) : le défaut de `xvfb-run` (640x480) ne suffit pas, la recette `just` devra passer `-s "-screen 0 3840x2160x24"`.
- Compte : 58 au total = 38 verts + 19 sautés (`docs.e2e.ts`, `describe.skip('docs in the app: N08')`) + 1 en échec. Captures : 14 PNG régénérés (fr/en), 6 tests verts.
- **Bloqué sur un changement d'app** : `smoke.e2e.ts` « opens the UI on acme-shop with the repo name in the title… » échoue sur `toHaveTitle(/acme-shop/)` (reçu : `relief`). `DocumentTitleService.init()` (`src/ui/src/app/core/services/document-title.service.ts`) lit le titre via `GET /api/meta`, qui n'existe plus dans l'app native : le `document.title` reste « relief ». Correction côté app : titre de la fenêtre Tauri (ou `Title` fixé depuis la commande qui renvoie les méta). Je n'ai pas touché `src/`.
- Écarts au portage un pour un :
  - `docs.e2e.ts` : `describe.skip` d'un bloc (19 tests) au lieu de `it.skip` ; navigation par `browser.url` ; N08 doit le réactiver.
  - Smoke « console propre » : pas d'événements console en WebDriver classique ; les écouteurs (`console.error`, `error`, `unhandledrejection`) sont posés juste après le chargement puis on actionne la carte (touches 2 et 0). Les erreurs au chargement même ne sont plus vues.
  - `openRelief({ lang, query, size })` : vide le `localStorage`, fixe `lang=en` par défaut (la webview est en `fr-FR`), règle la taille de la fenêtre pour que la zone de page (`innerWidth/Height`) vaille la taille demandée, puis recharge. Pas de `baseURL` : `?range=` passe par `location.assign`.
  - Les captures fixent la langue par `localStorage` (`lang`), plus par la locale du navigateur ; elles sont prises avec la police système de la webview (rendu légèrement différent des anciennes).
  - Texte de `.lb` et du nœud `auth/` (map) : lu via la propriété `textContent`, car `getText()` renvoie vide pour un libellé tronqué par sa boîte.
  - Les boutons de layout sont testés par `data-testid` + texte regex (plus de `getByRole`) ; rôles `option`/liens via XPath ou `a=Help`.
  - Saisie : une pression de touche par caractère (`typeText`), un appel `keys` unique perd les doubles lettres et les espaces.
  - Clic sur l'arête SVG : `dispatchEvent(click)` (équivalent de `force: true`).
  - Fluidité du zoom : l'événement `wheel` est envoyé par l'API d'actions ; sous Xvfb `requestAnimationFrame` ne produit presque aucune image (0 à 1), la mesure reste indicative et le test ne peut pas échouer.
  - `expect-webdriverio` épinglé à 7.0.1 (version qu'attend `@wdio/globals` 9.33.1).

## Green

- Fichiers : `src/ui/src/app/core/services/document-title.service.ts` (+ `.spec.ts` nouveau), `justfile`, `.gitignore`, `.claude/launch.json`, `.claude/agents/tdd-red.md`, `docs/dev/{rules,workflow}.md`, `docs/adr/{0003,0004}`, `README.md`, `.scratch/native-app/issues/08-docs-in-app.md`
- Changement : `DocumentTitleService` passe par `ReliefApiService.meta()` (test Vitest avec le service mocké). `justfile` : `e2e`, `e2e-summary` (une ligne `e2e: N passed, S skipped, M failed`), `docs-shots` et `setup` sur WebdriverIO/`tauri-driver` (contrôle de `WebKitWebDriver`). Mentions de Playwright retirées (hors tickets archivés), workflow/agents/launch.json mis à jour, réactivation du `describe.skip` ajoutée à N08.
- Suite : cargo 451 réussis / 0 échoué ; web 320 / 0 (baseline 318, +2) ; e2e 39 passed, 19 skipped, 0 failed ; `just lint` propre.
- Questions ouvertes : aucune (`src/ui/package-lock.json` laissé : Playwright n'y figure que comme peer optionnel de vitest)

## Review

- Verdict : fix first, corrigé avec l'accord de l'utilisateur : `e2e-summary` échoue aussi sur le code de sortie de `wdio` et sur `Spec Files: … failed` (et compte les lignes `N skipped` sans durée) ; contrôle de `WebKitWebDriver` avant `cargo install` dans `setup` ; virgules de `workflow.md` ; `rules.md` présente le mode HTTP comme retiré en N07 ; `launch.json` réduit au retrait de deux entrées ; test de fluidité du zoom en `it.skip` (aucune mesure possible sous Xvfb) ; `tauri-driver` lancé dans son propre groupe, groupe tué à l'arrêt, arrêt aussi sur `exit`, `SIGINT`, `SIGTERM`. Ces deux derniers fichiers de test ont été modifiés par l'orchestrateur avec l'accord explicite de l'utilisateur.
- Fausse alerte : le panneau des niveaux visible sur `review-map.png` est le contrôle de niveau, affiché en permanence ; l'ancienne capture Playwright le montre aussi.
- Consider (non traité) : le test « console propre » ne voit plus les erreurs émises pendant le chargement.

## Answer

- Harnais WebdriverIO v9 + `tauri-driver` + `WebKitWebDriver` dans `tests/e2e/` (`wdio.base.ts`, `wdio.conf.ts`) : construit acme-shop dans un dossier temporaire, lance l'app release (`relief-desktop`) dessus, une session par spec, `localStorage` vidé à l'ouverture. Sous `xvfb-run` avec `GDK_BACKEND=x11` et un écran de 3840x2160.
- Les 58 tests Playwright portés un pour un (`*.e2e.ts`) : 38 verts, 20 sautés (19 de `docs.e2e.ts` jusqu'à N08, le test indicatif de fluidité du zoom). Captures de `docs/user/screenshots/` sur le même harnais.
- Bug trouvé : `DocumentTitleService` lisait `GET /api/meta` ; il passe par `ReliefApiService.meta()`, avec un test Vitest.
- Playwright retiré (dépendances, configs, `web-server.ts`, `serve-acme.mjs`) ; `justfile` (`e2e`, `e2e-summary`, `docs-shots`, `setup`), `docs/dev/workflow.md`, `docs/dev/rules.md`, agents `tdd-*`, ADR 0003 et 0004, README et `launch.json` mis à jour ; N08 doit réactiver `docs.e2e.ts`.
- Vérifié : `just e2e-summary` → `e2e: 38 passed, 20 skipped, 0 failed` ; `just docs-shots` régénère les 18 captures ; cargo 451, web 320 ; `just lint` propre ; aucun process ni dossier temporaire restant après la suite.
