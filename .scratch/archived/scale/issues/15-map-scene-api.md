# S15 API de scène de la carte, indépendante du moteur

Status: resolved
Type: task
Blocked by: S14
UI: oui (rien de visible)
Doc: aucune

Spec: `../spec.md` (Décisions, phase 10) ; ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Pourquoi

Les e2e lisent le DOM de la carte (`map-node`, `map-edge`, `data-node-id`, classes). Le Canvas n'en aura plus. ADR 0009 : les e2e passent par une **API de scène** exposée par l'app, valable pour le DOM actuel comme pour le Canvas à venir, avant que le Canvas n'arrive.

## Comportement

- Une fonction pure `buildMapScene(...)` (`src/ui/src/app/modules/map/helpers/map-scene.logic.ts`) décrit ce qui est dessiné, à partir de ce que `MapBusiness` et le composant ont déjà : `visibleNodes`, `edgeLines`, `mergedEdgeLines`, `coChangeLines`, `emphasis`, la caméra, l'impact, la lecture, le focus, l'archi, le risque, le chargement, et le contenu des nœuds (`nodeContent`, `headerLayout`, `closedLabelVisible`).
  - Nœud : `id`, `kind`, `mode` (`open` / `closed` / `ghost`…), `label` (affiché ou non : `labelShown`), `header` (`header` / `tab` / aucun), `status`, `intensity`, `oldLocation`, `badges`, `counts` (chips), `sub`, `impact` (`hit` / `box` / `dim` / aucun) et son compte, `reading`, `flagged` (archi), `loading`, `risk`, `faded`, `emphasis` (`sharp` / `dim` / aucun), et `rect` en coordonnées monde.
  - Arête : `from`, `to`, `status`, `count`, `changed`, `selected`, `merged`, `coChange`, `impactPath`, `violation` (`new` / `old` / aucun), `emphasis`, `label` (texte, classe, visible ou non), `tooltip`, `labelRect` et `mid` en monde.
- Le composant expose `window.__reliefScene()` : la scène avec les rectangles convertis en coordonnées client (`left`, `top`, `width`, `height`) et le point milieu des arêtes. Une fermeture, rien n'est calculé hors appel.
- `tests/e2e/helpers/map-scene.ts` : `sceneNodes()`, `sceneNode(id)`, `sceneNodeByLabel(text)`, `sceneEdges()`, `sceneEdge(from, to)`, `clickNode(id)`, `doubleClickNode(id)`, `clickEdge(from, to)`, `hoverEdge(from, to)`, par de vraies actions pointeur WebdriverIO aux coordonnées (`browser.action('pointer')`), et des attentes (`waitForNode`, `waitForScene(pred)`).
- Le prototype `window.__reliefScene` du spike (`proto-renderer.ts`, `map-canvas.component.ts`) est remplacé par celui-ci, et le banc (`tests/e2e/bench/render.ts`) le lit.
- Preuve : 3 specs migrées sur l'API (`map.e2e.ts`, `edges.e2e.ts`, `diff-layer.e2e.ts`), qui passent sur le DOM actuel.

## Critères d'acceptation

- [x] `buildMapScene` testé par Vitest sur la fixture acme-shop (états des nœuds et des arêtes, emphase après sélection, impact).
- [x] `window.__reliefScene()` renvoie les nœuds et arêtes dessinés avec des rectangles client qui recouvrent les éléments DOM actuels (vérifié en e2e).
- [x] Les 3 specs migrées passent ; `just e2e` reste vert.

## Baseline

`just test-summary` (2026-11-21, `e0be43f`) : cargo 630 passed, 0 failed ; web 758 passed, 0 failed.

## Seams

- **`buildMapScene` (`src/ui/src/app/modules/map/helpers/map-scene.logic.ts`, Vitest)** : attrape les états des nœuds et arêtes de la scène (contenu, diff, impact, emphase, étiquettes) sans moteur ; rate la conversion en coordonnées client et l'exposition sur `window`.
- **e2e WebdriverIO (`tests/e2e/tests/map-scene.e2e.ts` + `tests/e2e/helpers/map-scene.ts`)** : attrape `window.__reliefScene()` sur l'app construite (rectangles client qui recouvrent les éléments DOM, clics par coordonnées qui sélectionnent) et les 3 specs migrées (`map`, `edges`, `diff-layer`) ; rate les détails d'état qui ne passent que par la logique.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/map-scene.logic.spec.ts` (Vitest, 22 tests), `tests/e2e/helpers/map-scene.ts` (helpers), `tests/e2e/tests/map-scene.e2e.ts` (7 tests), specs migrées `tests/e2e/tests/map.e2e.ts`, `edges.e2e.ts`, `diff-layer.e2e.ts`.
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/map-scene.logic.spec.ts` ; `just build` puis `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/<fichier>.e2e.ts`
- En échec :
  - `map-scene.logic.spec.ts` (tous) — le module `./map-scene.logic` (`buildMapScene`, `MapSceneInput`) n'existe pas : erreur de compilation.
  - `map-scene.e2e.ts` (7 tests) — `window.__reliefScene` n'est pas exposé en rendu DOM ("the map scene never satisfied the condition").
  - `map.e2e.ts` (6 tests sur 7 ; « the level buttons change the level too » ne lit pas la scène et passe) — idem.
  - `edges.e2e.ts` (1 test) — idem.
  - `diff-layer.e2e.ts` (7 tests sur 10 ; les 3 qui ne lisent pas la scène passent) — idem.

### Contrat que green doit respecter

- `buildMapScene(input: MapSceneInput): { nodes: SceneNode[]; edges: SceneEdge[] }`. `MapSceneInput` : `nodes`, `edgeLines`, `mergedEdgeLines`, `coChangeLines`, `emphasis` (`{ nodes, edges }` de `MapBusiness.emphasis()`), `modesScale`, `info(id)`, `t(key, params)`, `impact`, `reading`, `focus`, `archi`, `risk`, `loading` (types des inputs du composant).
- `SceneNode` : champs du ticket ; `mode` reste `open | box | ghost` (le `NodeMode` actuel, pas « closed ») ; `status`/`intensity`/`impact`/`reading`/`risk`/`emphasis` valent `null` quand absents ; `risk` vaut 0 si la couche est active sans entrée ; `impactCount` 0 par défaut ; `rect` en `{x,y,w,h}` monde. Un nœud que l'impact garde (hit/box) n'est jamais `emphasis: 'dim'`.
- `SceneEdge` : `merged` pour `mergedEdgeLines`, `coChange` pour `coChangeLines` ; `violation` `'new'` si introduced > 0, sinon `'old'` si existing > 0 ; `emphasis` = valeur de `EdgeEmphasis` ('normal' par défaut, clé `from\0to`) ; `label.visible` = `edgeLabelVisible` ; `labelRect` = `null` sans texte, sinon centré sur `mid` en monde, 28/scale x 16/scale (à `modesScale` 2, mid (100,50) : `{x:93,y:46,w:14,h:8}`).
- `window.__reliefScene()` : `{ nodes, edges }` ; les nœuds ajoutent `left/top/width/height` client (égaux au `getBoundingClientRect` du div DOM à 1 px près) ; les arêtes ajoutent `mid: {x,y}` client et `labelRect` `{left,top,width,height}` client ou null. Exposé en rendu DOM par défaut, pas seulement avec `?renderer=`.
- Banc `tests/e2e/bench/render.ts` : lit `edges` comme un nombre (`scene.edges`) ; avec la vraie API c'est un tableau, green doit remplacer par `scene.edges.length` dans `counts()` (le test `select` lit déjà `nodes[].left/top/width/height`, compatible).

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/map-scene.logic.ts` (nouveau), `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts`, `tests/e2e/bench/render.ts`
- Changement : `buildMapScene` pure (nœuds, arêtes, emphase, impact, étiquettes, rectangles monde). Le composant expose `window.__reliefScene()` dans tous les rendus (fermeture, rectangles et milieux convertis en coordonnées client), en remplacement du prototype de `mountProto` ; le banc lit `scene.edges.length`. L'emphase `sharp` n'est émise que s'il y a une sélection (un nœud dim dans la carte), sinon `null`.
- Suite : cargo 630 passés / 0 échoué (= baseline) ; web 783 passés / 0 échoué (baseline 758 + 25 nouveaux) ; e2e map-scene 7, map 7, edges 1, diff-layer 10 verts ; lint propre.
- Questions ouvertes : aucune

## Answer

- `buildMapScene` (`helpers/map-scene.logic.ts`) décrit les nœuds et arêtes dessinés (contenu, diff, impact, lecture, archi, risque, focus, emphase, étiquettes, rectangles monde) ; `window.__reliefScene()` l'expose dans tous les rendus, rectangles et milieux en coordonnées client. Le banc lit `scene.edges.length`.
- Helpers WebdriverIO `tests/e2e/helpers/map-scene.ts` (lecture de la scène, clics et survols par actions pointeur) ; `map-scene.e2e.ts` nouveau ; `map`, `edges`, `diff-layer` migrés.
- Vérifié : web 783 passés (758 + 25), cargo 630, `just e2e` 148 passés / 1 ignoré / 0 échec, lint propre. Review : ship.
- Reporté à S17 (retrait du prototype) : `renderer: PROTO_RENDERER` dans `exposeScene`, et `t` de `MapSceneInput` jamais lu. Autres remarques de review : `clickPoint` code en dur 6 px pour l'en-tête (à dériver de la scène en S16), duplication emphase / `mid` entre `sceneEdge` et `sceneCoChange`.
