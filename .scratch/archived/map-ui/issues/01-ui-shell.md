# Coquille de l'UI

Status: resolved
Type: task
Blocked by: C03, F04
UI: oui
Doc: user-docs `map` (l'écran)

Spec: `../spec.md`

## À faire

- `web/` : `ReliefApiService` typé (types de `contract.ts`) et `RepoBusiness` (état du dépôt et de la plage, en signals), chargement de `/api/meta` puis du snapshot ; états chargement, erreur (message de l'API), dépôt vide.
- Disposition 3 colonnes avec poignées de redimensionnement (préférences en `localStorage`, `try/catch`), bouton « élargir » du panneau de droite.
- Barre du haut : nom du dépôt, ref affichée, champ de recherche (inactif jusqu'à U05), bouton « ? », lien « Aide » vers `/docs`.
- i18n (ngx-translate, `en.json`, `fr.json`, sélecteur de langue Optimus UI), thème clair/sombre par variables CSS.

## Critères d'acceptation

- [ ] e2e : l'UI s'ouvre sur acme-shop, affiche « acme-shop », change de langue sans recharger ; une largeur de panneau modifiée est conservée après rechargement.
- [ ] Vitest : la logique de bornage des largeurs (`panels.logic.ts`) avec des tailles de fenêtre littérales.
- [ ] Une API qui répond 500 affiche le message d'erreur, pas une page blanche (test de composant avec `ReliefApiService` mocké).

## Baseline

`just test-summary` (develop, 44a12e0) : cargo 326 passed, 0 failed ; web 3 passed, 0 failed.

## Seams

1. **`web/src/app/.../panels.logic.ts` (Vitest)** : bornage des largeurs de panneaux (min/max, largeur de fenêtre littérale, 1280 et 1024), largeur par défaut (double-clic), lecture/écriture des préférences tolérante (valeur absente, corrompue, `localStorage` qui lève). Attrape les erreurs de calcul et de sérialisation ; rate le glisser réel et le rendu.
2. **Composant racine de l'UI (`imports: [Composant]`, `TEST_PROVIDERS`, `ReliefApiService` mocké)** : à travers `RepoBusiness`, états chargement, erreur (message de l'API pour un 500, pas de page blanche), dépôt vide, nom du dépôt et ref affichés dans la barre du haut, recherche inactive, lien « Help »/« Aide » vers `/docs/`, bouton « ? », sélecteur de langue EN/FR, bascule de thème. Attrape le câblage API → état → affichage ; rate le vrai serveur et le vrai `localStorage` entre deux chargements.
3. **e2e Playwright (`relief serve` sur acme-shop)** : l'UI s'ouvre, affiche « acme-shop », change de langue sans recharger ; une largeur de panneau modifiée (poignée glissée) est conservée après rechargement ; bouton « élargir » du panneau de droite. Attrape le parcours réel de bout en bout ; rate les cas d'erreur API (couverts par 2).

Validation : chaque comportement du ticket est atteint (client/état/états → 2, disposition et préférences → 1 et 3, barre du haut → 2, i18n et thème → 2 et 3) ; interfaces publiques uniquement ; seul `ReliefApiService` est mocké ; 3 seams.

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/panels.logic.spec.ts`, `web/src/app/modules/map/components/map-page/map-page.component.spec.ts`, `e2e/tests/shell.spec.ts` ; helper `e2e/helpers/open-relief.ts` (plus de `range`, attend `repo-name` visible, plus de `networkidle`), appels adaptés dans `e2e/tests/smoke.spec.ts` et `docs.spec.ts`.
- Lancer : `cd web && npx ng test --watch=false --include 'src/app/modules/**/*.spec.ts'` ; `cd e2e && npm exec playwright test shell.spec.ts`
- Interfaces attendues (à créer en green) :
  - `web/src/app/modules/map/helpers/panels.logic.ts` : `DEFAULT_PANEL_WIDTHS` ({left:300,right:430}), `clampPanelWidths(widths, windowWidth)`, `widthFromDrag('left'|'right', pointerX, windowWidth)`, `isRightPanelWide(right, windowWidth)`, `toggleRightPanelWide(widths, windowWidth)`, `readPanelWidths(storage)`, `writePanelWidths(storage, widths)` (clés `relief.lw` / `relief.rw`, bornes de la maquette : gauche 180 à 40 % de la fenêtre, droite 260 à fenêtre-gauche-280, glisser droit jusqu'à 70 %, large = 55 %).
  - `web/src/app/core/services/relief-api.service.ts` : `ReliefApiService` avec `meta(): Promise<MetaResponse>` et `snapshot(ref: string): Promise<SnapshotResponse>` ; rejette avec une `Error` dont le message est celui de l'`ApiError`.
  - `web/src/app/modules/map/components/map-page/map-page.component.ts` : `MapPageComponent`, avec `data-testid` : `repo-name`, `ref`, `error`, `empty`, `search` (désactivé), `language-select` (Optimus Select, options `role=option` « English » / « Français »), `theme-toggle` (classe `dark` sur `<html>`), `resize-left`, `resize-right`, `right-panel`, `expand-right` ; lien « Help »/« Aide » vers `/docs/`, bouton « ? » ; texte `/loading/i` pendant le chargement, `/empty/i` dans `empty`.
- En échec : 31 tests (Vitest : suite non compilée, import manquant), 4 e2e
  - `panels.logic.spec.ts` (20 tests) — `./panels.logic` n'existe pas.
  - `map-page.component.spec.ts` (11 tests) — `relief-api.service` et `./map-page.component` n'existent pas.
  - e2e `opens on acme-shop and shows the repo name and the ref` — `repo-name` absent.
  - e2e `changes language without reloading the page` — `repo-name` absent.
  - e2e `keeps a resized right panel after a reload and resets it on double-click` — `repo-name` absent.
  - e2e `the expand button widens the right panel, then restores it` — `repo-name` absent.

## Green

- Fichiers : `web/src/app/modules/map/helpers/{panels,repo}.logic.ts`, `web/src/app/modules/map/business/{repo,panels}.business.ts`, `web/src/app/modules/map/components/map-page/map-page.component.{ts,html,scss}`, `web/src/app/core/services/relief-api.service.ts`, `web/src/app/core/business/{language,theme}.business.ts`, `web/src/app/app.routes.ts`, `web/src/styles.scss`, `web/public/i18n/{en,fr}.json`
- Changement : `MapPageComponent` (barre du haut, 3 colonnes, poignées pointer, bouton élargir) sur `RepoBusiness` (signals : chargement, erreur, vide) et `PanelsBusiness`, logique de bornage et de préférences dans `panels.logic.ts`. `ReliefApiService` rejette avec le message de l'`ApiError`. Langue (Optimus Select) et thème (classe `dark`) via deux business, variables CSS clair/sombre. Les largeurs sont rendues par `detectChanges()` immédiat, car Playwright mesure avant le rendu zoneless planifié.
- Suite : cargo 326 passed, 0 failed (baseline 326/0) ; web 35 passed, 0 failed (baseline 3) ; e2e 20 passed (3 passages) ; lint propre.
- Questions ouvertes : `ReliefPageComponent` (et ses clés `home.*`) n'est plus routé mais conservé pour ne pas retirer de test baseline ; à supprimer en review.

## Review

- Verdict : fix first, puis ship après l'étape 8 (le seul Must fix est la doc utilisateur).
- Must fix :
  - `user-docs/src/content/docs/map.md` et `en/map.md` : décrire la barre du haut, les 3 colonnes redimensionnables (double-clic, élargir), langue et thème, en FR et EN. Traité à l'étape 8 du workflow (voir `## Doc`).
- Consider (non appliqués, laissés au choix de l'utilisateur) :
  - `web/src/app/core/components/relief-page/` et clés `home.*` : `ReliefPageComponent` n'est plus routé (code mort) ; à supprimer avec son spec et ses clés.
  - `panels.business.ts:36-45` : `drag`, `reset`, `toggleRightWide` lisent `window.innerWidth` au lieu du signal `windowWidth` ; `windowResized()` non testé.
  - `theme.business.ts:3` : clé `'theme'` non préfixée (`relief.theme` suggéré) ; pas de test de persistance langue/thème.
  - `map-page.component.ts:49-58` : `detectChanges()` à chaque `pointermove`, à commenter (risque avec la carte de U02).
  - Bouton « ? » sans handler, conforme au ticket (raccourcis plus tard).
- Aucun autre problème : 3 seams respectés, seul `ReliefApiService` mocké, `localStorage` sous `try/catch`, clés i18n EN/FR présentes, pas de souci de sécurité.

## Navigateur

`just e2e-summary` : 20 passed, 0 failed. Parcours `relief-acme` (`.claude/launch.json` pointé temporairement sur le chemin absolu de `just`, absent du PATH, puis restauré) : EN et FR changent sans recharger, barre du haut (acme-shop, feat/promo-codes, recherche désactivée, « ? », Aide/Help → `/docs/`), élargir 430→700 px puis retour à 1280, colonnes 300/294/430 sans défilement horizontal à 1024, thème sombre OK, aucune erreur console. Défaut trouvé : au chargement en français, `<html lang>` reste `en` (correct après un changement via le sélecteur). Corrigé par tdd-green (un `effect` de `LanguageBusiness` recopie la langue dans `<html lang>`), revérifié : `lang=fr` au chargement en français, pas d'erreur console.

## Doc

`user-docs` map (FR `map.md`, EN `en/map.md`) : section « L'écran » / « The screen » (barre du haut, trois colonnes, redimensionner, double-clic, élargir, langue et thème, erreur API). Nouvelle capture `screens/{fr,en}/map.png` (`user-docs/screenshots/map.shot.ts`). `getting-started.shot.ts` ne trouvait plus le titre de l'ancien écran d'accueil : il attend désormais `repo-name`, sans `range` ni `networkidle` ; `home.png` régénérée. `just docs-build` passe. Cela règle le Must fix de la review.

## Answer

Construit : `ReliefApiService` typé sur `contract.ts` (rejette avec le message de l'`ApiError`), `RepoBusiness` en signals (chargement, erreur, dépôt vide, meta puis snapshot), `PanelsBusiness` et `panels.logic.ts` (bornes reprises de la maquette, préférences `relief.lw`/`relief.rw` sous `try/catch`, double-clic = défaut, élargir = 55 %), `MapPageComponent` (barre du haut, 3 colonnes, poignées pointer, emplacement vide pour la carte de U02, recherche désactivée jusqu'à U05), `LanguageBusiness` (ngx-translate, sélecteur Optimus UI, `<html lang>` suivi par un `effect`) et `ThemeBusiness` (classe `dark`, variables CSS). Helper e2e `openRelief` sans `range` ni `networkidle`.

Décisions : rendu immédiat (`detectChanges()`) pendant le glisser, car le rendu zoneless planifié arrivait après la mesure ; `ReliefPageComponent` conservé mais plus routé (Consider).

Vérifié : cargo 326/0 (baseline 326/0), web 35/0 (baseline 3/0), e2e 20/0, `just lint` propre, parcours navigateur EN/FR à 1280 et 1024 px sans erreur console (voir `## Navigateur`).
