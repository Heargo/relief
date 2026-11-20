# Carte imbriquée et zoom sémantique

Status: resolved
Type: task
Blocked by: U01
UI: oui
Doc: user-docs `map`

Spec: `../spec.md` (Décisions : zoom sémantique, rendu)

## À faire

- `layout.logic.ts` : grille imbriquée (tailles, positions absolues) depuis le snapshot.
- `visibility.logic.ts` : mode de chaque nœud (`open`, `box`, `ghost`, `hidden`) selon l'échelle et les seuils.
- Pan (glisser), zoom molette centré sur le curseur, bornes de zoom, cadrage « tout voir », animation de cadrage (zoom log + centre interpolé).
- Niveaux 0–3 (boutons + touches), double-clic pour plonger, niveau courant affiché.
- Contenu des boîtes : nom, type (icône de symbole), compteurs ; nœuds hors écran non rendus.

## Critères d'acceptation

- [ ] Vitest : pour un snapshot littéral et trois échelles, les modes attendus (fermé, ouvert, fantôme).
- [ ] e2e : sur acme-shop, au niveau 0 on voit 4 systèmes et 2 externes ; touche `2` → `session.ts` est visible ; double-clic sur `apps/api` cadre ce système.
- [ ] Le zoom reste fluide sur acme-shop (aucune frame > 50 ms mesurée par `performance` dans un test e2e indicatif, non bloquant).

## Baseline

`just test-summary` sur `develop` (dad46be) : cargo 326 passed, 0 failed ; web 35 passed, 0 failed. e2e : `shell.spec.ts` vert (U01).

## Seams

1. **Modules de logique purs de la carte** (`web/src/app/map/*.logic.ts`, Vitest) : `layout.logic.ts` (grille imbriquée : tailles et positions absolues depuis un snapshot littéral), `visibility.logic.ts` (mode `open`/`box`/`ghost`/`hidden` de chaque nœud selon l'échelle, les seuils 470/300/175 px et le viewport), et la logique de caméra/niveau (zoom centré sur un point, bornes, cadrage « tout voir » et d'un nœud, interpolation d'animation log-zoom + centre, échelle cible d'un niveau 0–3, niveau courant). Attrape : les règles du zoom sémantique et la géométrie. Rate : le branchement au DOM et aux événements.
2. **`MapBusiness`** (`*.business.ts`, `TestBed.inject`, `ReliefApiService` mocké qui renvoie un snapshot littéral) : charge le snapshot, expose en signals la caméra, le niveau courant et les nœuds visibles ; actions `setLevel(n)`, `zoomAt`, `pan`, `fitAll`, `dive(nodeId)`. Attrape : l'état et l'enchaînement chargement → layout → visibilité. Rate : le rendu réel et les entrées clavier/souris.
3. **e2e Playwright** `e2e/tests/map.spec.ts` sur acme-shop via `relief serve` : niveau 0 → 4 systèmes et 2 externes ; touche `2` → `session.ts` visible ; double-clic sur `apps/api` cadre ce système ; niveau courant affiché ; plus un test indicatif non bloquant de fluidité (`performance`, aucune frame > 50 ms). Attrape : le parcours utilisateur réel, clavier, double-clic, rendu DOM. Rate : le détail des seuils (couvert par 1).

Hors périmètre (ne rien en attendre) : arêtes agrégées (U03), disposition « moins de croisements » (U04), panneau de nœud (U06).

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/layout.logic.spec.ts`, `web/src/app/modules/map/helpers/visibility.logic.spec.ts`, `web/src/app/modules/map/helpers/camera.logic.spec.ts`, `web/src/app/modules/map/business/map.business.spec.ts`, `e2e/tests/map.spec.ts`
- Lancer : `cd web && npx ng test --watch=false --include 'src/app/modules/map/**/*.spec.ts'` ; `cd e2e && npm exec playwright test map.spec.ts`
- En échec : tous les specs Vitest nouveaux (4 fichiers, ne compilent pas : modules `layout.logic`, `visibility.logic`, `camera.logic`, `map.business` absents) ; e2e 5 tests :
  - level 0 shows the four systems... — pas de `map-canvas` / `map-node` (carte non rendue)
  - key 2 opens the files level and shows session.ts — idem, ni niveau courant ni nœud
  - the level buttons change the level too — pas de `level-N` / `current-level`
  - double-clicking apps/api frames that system — pas de `[data-node-id="pkg:@acme/api"]`
  - zooming stays fluid (indicatif, ne bloque jamais sur les frames lentes) — pas de `map-canvas`
- Contrats posés par les tests (à respecter au green) : `layoutGraph(graph) -> {nodes: Map, roots, bounds}` (le nœud `repo` n'est pas posé, ses enfants sont les racines ; tailles/paddings de la maquette) ; `computeModes(layout, camera) -> Map<id, mode>`, `OPEN_THRESHOLDS`, `isInViewport(rect, camera, viewport)` ; `camera.logic` : `zoomAt, panBy, fitRect, cameraCenter, interpolateCamera, easeInOutCubic, levelScales, currentLevel` ; `MapBusiness` (`setViewport, load, camera, level, status, visibleNodes {id,kind,mode,x,y,w,h en px écran}, setLevel, zoomAt, pan, fitAll, dive`, animation par rAF <= 1 s) ; DOM : `map-canvas`, `map-node` (+ `data-node-id`, `data-kind`, `data-mode`), `current-level` (+ `data-level`), `level-0..3`.
- Écart avec le ticket : « 2 externes » au niveau 0 n'est pas testé tel quel. Le snapshot réel d'acme-shop contient 8 externes sous un groupe `pkg:external` (module) ; le test vérifie les 4 systèmes (service/package) et le groupe `pkg:external`. À trancher si l'on veut vraiment 2 externes.
- Risque : « touche `2` → session.ts visible » suppose que le niveau 2 cadre une zone contenant `apps/api/auth/session.ts` (centre conservé) ; le green devra choisir le centre en conséquence.

## Green

- Fichiers : `web/src/app/modules/map/helpers/{layout,visibility,camera,node-info,node-content}.logic.ts`, `web/src/app/modules/map/business/map.business.ts`, `web/src/app/modules/map/components/map-canvas/*` (nouveau), `map-page.component.{ts,html,scss}`, `web/src/styles.scss`, `web/angular.json` (CSS des icônes `@openng/icons`), `web/public/i18n/{en,fr}.json`
- Changement : logique pure (grille imbriquée avec rangées de racines, modes `open/box/ghost/hidden`, caméra, niveaux) ; `MapBusiness` en signals (caméra, niveau, nœuds visibles hors écran exclus, animation rAF 480 ms) ; `MapCanvasComponent` écrit les positions dans le DOM par frame, gère pan, molette, double-clic, touches 0-3, boutons de niveau. `setLevel` pose un niveau forcé et un plafond de profondeur (levé dès qu'on zoome) ; le saut de niveau reste sur la boîte racine la plus proche et montre son début (c'est ce qui rend `session.ts` visible à la touche `2`). `show(graph)` alimente la carte depuis `RepoBusiness` (pas de double appel API).
- Suite : cargo 326 passed / 0 failed ; web 78 passed / 0 failed (baseline 35 + 43 nouveaux) ; e2e 25 passed (map.spec.ts 5/5, shell.spec.ts vert) ; `just lint` propre ; aucun fichier de test modifié.
- Questions ouvertes : « 2 externes » reste testé comme le groupe `pkg:external` ; acme-shop n'a aucun nœud `module` hors externes, donc le niveau 2 vient d'une échelle intermédiaire (moyenne géométrique niveaux 1 et 3) ; l'avertissement de budget du bundle (691 kB > 500 kB) est à regarder en review.

## Review

(Écrit par l'orchestrateur à partir du rapport de tdd-review, lecture seule.)

- Verdict initial : fix first
- Verdict final : **ship** (après la mise à jour de la doc à l'étape 8 et la correction d'une ligne ci-dessous, revérifiées par tdd-review ; correctif après navigateur `fromWholeMap` et plafond de profondeur pendant l'animation jugés justes et minimaux).
- Must fix :
  - Pages `user-docs` `map` (FR et EN) non mises à jour : zoom, pan, niveaux 0–3 (boutons et touches), double-clic, « tout voir » à documenter. Traité à l'étape 8 par l'orchestrateur (c'est de la doc, pas du code), puis revérifié par tdd-review.
- Consider :
  - Budget du bundle initial (691 kB > avertissement 500 kB) : dû au JS (Optimus UI, ngx-translate), pas au CSS d'icônes, qui reste nécessaire. Simple avertissement (erreur à 1,5 MB) ; relever `maximumWarning` ou charger Optimus en lazy, dans un commit à part.
  - ADR 0002 respecté (positions écrites dans le DOM depuis un `effect`, contenu reconstruit sur clé `mode|size|lang`, pas de CD par nœud) ; aucun `detectChanges()` au `pointermove` de la carte : le Consider U01 est sans objet ici.
  - Écart « 2 externes » : amender le critère du ticket plutôt que garder un écart implicite (fait ci-dessous).
  - `MapBusiness.load()` sans appelant visible (`show()` alimenté par `RepoBusiness`) : code peut-être mort.
  - Garde clavier `onKey` (INPUT/SELECT/éditable) présente mais non couverte par un test composant.
  - `visibility.logic.ts` : `openKey` et `OPEN_LEVEL` sont deux tables parallèles, fusionnables.
  - Import circulaire (types seulement) entre `camera.logic` et `visibility.logic` : déplacer les types.

- Must fix de la re-review (appliqué par l'orchestrateur, doc seulement) : la doc disait le niveau courant « au-dessus des boutons » ; il est en haut à gauche de la carte (`map-canvas.component.scss`). Corrigé en FR et EN, `just docs-build` repassé.
- Consider (orchestrateur, vus dans le navigateur ou en vérifiant) :
  - À 1024 px la carte ne fait que 294 px (panneaux par défaut 300/430 de U01) : le double-clic cadre un système sans pouvoir l'ouvrir (seuil 470 px).
  - Fichiers racine dessinés en pastilles sans nom au niveau 0 ; le panneau des niveaux recouvre des nœuds ; des fantômes empiètent sur les titres des boîtes.
  - `just e2e` lance Playwright depuis la racine et ramasse les specs Vitest (« Cannot find module vitest ») ; `just e2e-summary` (qui fait `cd e2e`) n'est pas touché. Défaut antérieur au ticket.

Amendement du critère « 2 externes » : la fixture acme-shop réelle contient 8 dépendances externes réunies sous le groupe `pkg:external` (la maquette en montrait 2). Le test e2e vérifie 4 systèmes et la présence de ce groupe externe au niveau 0.
- Correction après navigateur : `e2e/tests/map.spec.ts` fait tourner « key 2 … session.ts » à 1280x720, 1280x800 et 1024x768 ; `map.business.spec.ts` gagne « a level jump from the whole-map view anchors on the first root… » (rouge : `session.ts` de la première racine absent après `setLevel(2)`). Les 3 variantes e2e passent ici (binaire/UI embarquée peut-être antérieurs au défaut) : à relancer après `just build`.
- Correctif navigateur : depuis la vue « tout voir » (niveau forcé 0), un saut de niveau s'ancre sur la première boîte racine (`levelCamera(..., fromWholeMap)`), indépendamment de la taille du canvas. En plus, pendant l'animation d'un saut de niveau, le plafond de profondeur reste `min(ancien, nouveau)` et le nouveau n'est posé qu'à l'arrivée (ou à l'interruption) : sans cela, `useSession.ts` (web) s'ouvrait en vol et rendait le test e2e « key 2 » instable (violation strict mode). web 79 passed, lint propre, e2e 27 passed (5 exécutions de suite). Note : `just e2e` lance `playwright test` depuis la racine (`npm --prefix e2e exec`) et ramasse les specs Vitest du web ; la suite e2e a été lancée depuis `e2e/` après le build de `just e2e`.

## Answer

- Construit : `layout.logic.ts` (grille imbriquée, rangées de racines), `visibility.logic.ts` (modes `open`/`box`/`ghost`/`hidden`, seuils 470/300/175 px, culling hors écran), `camera.logic.ts` (zoom centré, bornes, « tout voir », cadrage d'un nœud, interpolation log-zoom + centre, échelles des niveaux 0–3), `node-info`/`node-content.logic.ts` (nom, icône de type, compteurs) ; `MapBusiness` en signals (caméra, niveau, nœuds visibles, animation rAF) ; `MapCanvasComponent` qui écrit les positions dans le DOM à chaque frame (ADR 0002), pan, molette, double-clic, touches et boutons 0–3, libellés EN/FR.
- Décisions : « 2 externes » vérifié comme le groupe `pkg:external` (acme-shop a 8 externes) ; le niveau 2 vient d'une échelle intermédiaire (acme-shop n'a pas de nœud `module`) ; un saut de niveau depuis « tout voir » s'ancre sur la première racine (défaut trouvé dans le navigateur à 1280x800 et 1024x768, couvert par un test business et des variantes e2e avant correction) ; pendant l'animation, le plafond de profondeur reste au minimum des deux niveaux.
- Vérifié : cargo 326 (baseline 326), web 79 (baseline 35), e2e 27 (`map.spec.ts` dont le test de fluidité indicatif), `just lint` propre ; parcours dans le navigateur intégré en FR et EN, à 1280x800 et 1024x768 (niveau 0, touche 2 → `session.ts`, touche 0, double-clic sur @acme/api, molette jusqu'aux symboles), sans erreur de console. Doc `map` FR/EN mise à jour, captures régénérées, `just docs-build` vert.
