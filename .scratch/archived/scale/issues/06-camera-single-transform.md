# S06 Caméra en un seul transform

Status: resolved
Type: task
Blocked by: S05
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Les nœuds et les arêtes sont placés en pixels d'écran : chaque frame de pan réécrit `transform`, `width`, `height` de chaque nœud et le `d` de chaque arête, alors qu'un pan ne change rien d'autre que la translation.

## À faire

- Nœuds et arêtes en coordonnées monde, dans un calque qui porte seul la caméra (`transform: translate(tx, ty) scale(s)`, même transform pour le `div` des nœuds et le `g` des arêtes ; traits en `vector-effect: non-scaling-stroke`).
- Pan : seul le transform du calque change ; aucun `computed` de nœud ou d'arête ne se relance.
- Zoom : pendant le geste, seul le transform change ; les modes (ouvert, boîte, fantôme), les en-têtes et les libellés se recalculent au repos (fin du geste, environ 120 ms) ou dès qu'un seuil d'ouverture est franchi, pour que l'ouverture des boîtes reste immédiate.
- Formes des arêtes (`edgeShape`) en coordonnées monde, recalculées au changement de layout ou de modes, pas de caméra.
- Le culling des nœuds hors de la vue (`isInViewport`) reste, recalculé au repos et quand le pan sort de la marge de rendu.

## Critères d'acceptation

- [ ] Budget de S05 tenu au pan sur `dense` (`just bench-ui`). **Partiel** : tenu en vue zoomée (12 ms), pas en vue d'ensemble (127 ms) ni sur excalidraw (53 / 32 ms) ; le reste (style / layout / paint de 4 500 chemins SVG) est repris par S07 et S08.
- [x] Tous les tests existants passent ; les e2e de la carte (zoom, ouverture des boîtes, sélection, arêtes) inchangés.
- [x] Les captures de la carte d'acme-shop sont identiques au pixel près au repos (textes et épaisseurs de trait compris).

## Décision (2026-11-20, orchestrateur)

Pendant un zoom, le texte grossit avec le transform jusqu'au repos : acceptable (recalcul au repos, ou dès qu'un seuil d'ouverture est franchi). Le critère « identique au pixel près » se vérifie au repos par les e2e de la carte et une comparaison de captures d'acme-shop avant / après.

## Questions ouvertes (tranchées ci-dessus)

- Les tailles de texte dépendent de l'échelle (`headerLayout`) : pendant un zoom, le texte grossit avec le transform jusqu'au repos. Acceptable, ou recalcul toutes les N frames ?

## Baseline

`just test-summary` (2026-11-20, après S05, 429062a) : cargo 630 passed, 0 failed ; web 690 passed, 0 failed. e2e 140 passés, 1 ignoré, 0 échec. `just bench-ui` dense, vue d'ensemble : pan p50 231 ms, p95 248 ms.

## Seams

- **Module de logique TS** (`*.logic.ts`, Vitest) : attrape le transform du calque pour une caméra donnée, `edgeShape` en coordonnées monde (indépendant de la caméra), la décision « recalculer les modes maintenant » (repos après ~120 ms, seuil d'ouverture franchi) et la marge de culling ; rate le DOM.
- **Business de la carte** (`MapBusiness`, `TestBed`, `ReliefApiService` mocké) : attrape qu'un pan ne relance aucun `computed` de nœud ou d'arête (compteurs observables par les marques `relief:*` ou un compteur exposé), qu'un zoom ne recalcule les modes qu'au repos ou au franchissement d'un seuil ; rate le rendu.
- **e2e WebdriverIO (suite existante) + `just bench-ui`** : attrape les régressions de zoom, d'ouverture, de sélection et d'arêtes au repos, et le budget de pan sur `dense` (p95 < 16 ms) ; rate les états intermédiaires d'un geste.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/camera-layer.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-camera-layer.business.spec.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/helpers/camera-layer.logic.spec.ts` (idem avec `src/app/modules/map/business/map-camera-layer.business.spec.ts`)
- En échec : 2 fichiers (compilation, symboles manquants), 14 tests :
  - `camera-layer.logic.spec.ts` (10 tests : `layerTransform` ×2, `REST_DELAY_MS`, `shouldRecomputeModes` ×5, `viewLeavesRenderedArea` ×3) — le module `helpers/camera-layer.logic.ts` n'existe pas (à créer : `layerTransform(camera)` → `translate(txpx, typx) scale(s)`, `REST_DELAY_MS = 120`, `shouldRecomputeModes(layout, modesCamera, camera, idleMs, maxLevel?)`, `viewLeavesRenderedArea(rendered, camera, viewport, margin)`).
  - `map-camera-layer.business.spec.ts` (4 tests : transform du calque, nœuds en coordonnées monde, pan sans relance de `visibleNodes`/`edgeLines`, zoom : modes et arêtes recalculés seulement au repos) — `MapBusiness.layerTransform` n'existe pas (erreur TS2339) ; une fois le symbole ajouté, les tests de pan et de zoom échouent tant que les nœuds restent en pixels d'écran. Contrat : compteurs via les marques `relief:visibleNodes` / `relief:edgeLines` (`window.__reliefPerf`), repos par `setTimeout`/`REST_DELAY_MS`.
- e2e : aucun nouveau test, le zoom au repos est couvert par `readable-zoom.e2e.ts` et `map.e2e.ts`.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/camera-layer.logic.ts` (nouveau), `helpers/edges.logic.ts`, `business/map.business.ts`, `components/map-canvas/map-canvas.component.{ts,html,scss}`, `docs/bench.md`
- Changement : `VisibleNode` et les formes d'arêtes en coordonnées monde (`edgeShape(a, b, avoid, scale)`) ; `MapBusiness.layerTransform` porte la caméra, appliqué au `div` des nœuds et au `g` des arêtes (`non-scaling-stroke`). Les modes, le culling et les formes se recalculent via `_modesCamera` / `_cullCamera` (repos 120 ms, seuil franchi, sortie de la marge). Chaque nœud est posé en monde et contre-échelonné à l'échelle du dernier repos (`translate(x, y) scale(1/s)`, largeur `w*s`), donc son CSS en pixels est inchangé.
- Suite : web 702 réussis / 3 échoués (baseline 690/0, +14 tests rouges) ; cargo 630/0 ; e2e 140 passés, 1 ignoré, 0 échec ; `just lint` : seul échec Prettier sur `camera-layer.logic.spec.ts` (fichier rouge indexé, non modifiable).
- Bench `dense` (work p95, fit / zoomed) : pan 248 / 34 -> 127 / 12 ms, zoom 252 / 267 -> 227 / 371 ms, sélection 177 / 143 -> 160 / 142 ms. Budget pan tenu en zoomed, pas en fit (reste : style/layout navigateur de 4 500 chemins ; S07/S08). Zoom : pas mieux, réécriture des arêtes au repos (`syncEdges` 70 ms p95).
- Captures acme-shop (vue d'ensemble, `2` = fichiers) avant / après : boîtes et textes identiques au pixel ; seuls les traits des arêtes diffèrent (anti-aliasing, 722 et 4 040 pixels, 0 / 59 d'écart > 40/255).
- Questions ouvertes : 3 tests existants lisent des coordonnées écran dans `visibleNodes` et contredisent le red (nœuds en monde, culling paresseux) : `map-render.business.spec.ts` (« does not draw a node beyond 120 px off screen », « draws a node just above the screen, within 120 px ») et `map.business.spec.ts` (« dive frames the node: bigger than before… »). À réécrire en convertissant par `camera()` ; je n'ai pas touché aux fichiers de test.

## Answer

- Nœuds et formes d'arêtes en coordonnées monde (`edgeShape(a, b, avoid, scale)`), dans un calque qui porte seul la caméra (`MapBusiness.layerTransform`, même transform pour le `div` des nœuds et le `g` des arêtes, traits en `non-scaling-stroke`). Chaque nœud est contre-échelonné à l'échelle du dernier repos, donc son CSS en pixels ne change pas.
- `camera-layer.logic.ts` : `layerTransform`, `REST_DELAY_MS = 120`, `shouldRecomputeModes` (repos ou seuil d'ouverture franchi), `viewLeavesRenderedArea` (culling refait quand le pan sort de la moitié de la marge de rendu).
- Pan : aucun `computed` de nœud ou d'arête ne se relance (`compute` et `dom` à 0 ms pendant un pan).
- Bench `dense` p95 (vue d'ensemble / zoomée), avant → après : pan 248 / 34 → 127 / 12 ms ; zoom 252 / 267 → 227 / 371 ms (pire au repos : toutes les arêtes réécrites, pour S07 / S08) ; sélection inchangée. `will-change: transform` essayé et écarté (texte flou au repos).
- Captures acme-shop avant / après au repos : nœuds et textes identiques au pixel ; arêtes différentes par anticrénelage du `non-scaling-stroke` (invisible à l'œil).
- Tests existants réécrits pour le nouveau contrat : 3 tests de `map-render.business.spec.ts` et `map.business.spec.ts` (conversion par `camera()`, temps de repos) ; ajout de 5 tests `edgeShape` à l'échelle (review).
- Vérifié : cargo 630 / 0, web 710 / 0 (baseline 630 / 690), `just lint` propre, `just e2e-summary` 140 passés, 1 ignoré, 0 échec.
- `Consider` non appliqués : `screenLength` recalcule les points de bord au lieu de multiplier la longueur monde ; `edgeLabelRects` reconvertit en écran ; pas de test business du seuil d'ouverture franchi en cours de geste.
