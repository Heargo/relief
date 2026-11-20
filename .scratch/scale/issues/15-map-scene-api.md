# S15 API de scène de la carte, indépendante du moteur

Status: ready-for-agent
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

- [ ] `buildMapScene` testé par Vitest sur la fixture acme-shop (états des nœuds et des arêtes, emphase après sélection, impact).
- [ ] `window.__reliefScene()` renvoie les nœuds et arêtes dessinés avec des rectangles client qui recouvrent les éléments DOM actuels (vérifié en e2e).
- [ ] Les 3 specs migrées passent ; `just e2e` reste vert.
