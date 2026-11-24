# U32 Tracés d'arête dans les couloirs

Status: resolved
Type: task
Blocked by: U31
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Les arêtes sont des courbes directes qui traversent les boîtes qu'elles ne relient pas.

## Comportement

- Les arêtes (et troncs de U31) suivent les couloirs entre les boîtes : routage orthogonal à coins arrondis sur une grille de couloirs dérivée de la disposition, calculé dans le worker de disposition (S09) au repos, pas à chaque frame.
- Une arête ne traverse plus une boîte qu'elle ne relie pas, sauf si aucun couloir n'existe (repli sur la courbe directe).
- Pendant le zoom, les tracés du repos sont mis à l'échelle ; recalcul au repos.

## Critères d'acceptation

- [x] Logique : un tracé entre deux boîtes séparées par une troisième ne la traverse pas ; repli documenté.
- [x] `just bench-ui` sans régression (calcul dans le worker).
- [x] e2e : la scène expose les points des tracés ; aucune arête de acme-shop ne traverse une boîte étrangère au niveau Fichiers.
- [x] Doc `map` FR/EN.

## Baseline

`0e36fb8` (develop) : cargo 682 ; web 1008 ; e2e 175 passés / 1 ignoré. `just bench-ui` (après U31) : zoom p95 11 à 14 ms, sélection ≤ 52 ms.

## Seams

- **Logique pure (`*.logic.ts`, Vitest)** : routage orthogonal à coins arrondis sur une grille de couloirs tirée d'une disposition : un tracé entre deux boîtes séparées par une troisième ne la traverse pas ; repli sur la courbe directe sans couloir ; déterministe ; sérialisable (calculé dans le worker de S09). Attrape la géométrie.
- **Worker / business** : les tracés arrivent avec la disposition (au repos), pas à chaque frame ; mis à l'échelle pendant le zoom. Attrape le câblage.
- **e2e (acme-shop, niveau Fichiers)** : la scène expose les points des tracés ; aucune arête ne traverse une boîte qui n'est ni sa source, ni sa cible, ni un de leurs ancêtres. Banc `just bench-ui` (orchestrateur) sans régression.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edge-routing.logic.spec.ts`, `src/ui/src/app/modules/map/helpers/layout-compute-routes.logic.spec.ts`, `src/ui/src/app/modules/map/helpers/map-scene-routes.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-routes.business.spec.ts`, `tests/e2e/tests/edge-routing.e2e.ts` (+ champ `route` ajouté à `SceneEdge` dans `tests/e2e/helpers/map-scene.ts`)
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include 'src/app/modules/map/**/*{routing,routes,layout-compute-routes}*.spec.ts'` ; e2e (non lancé) : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/edge-routing.e2e.ts`
- En échec : 4 specs Vitest (la compilation échoue, donc rouge par symboles manquants) + 1 e2e non lancé
  - edge-routing.logic.spec — `./edge-routing.logic` n'existe pas (`buildCorridors`, `routeEdge`, `roundedPath`)
  - layout-compute-routes.logic.spec — `Layouts.corridors` absent
  - map-scene-routes.logic.spec — `EdgeShape.route` et `SceneEdge.route` absents
  - map-routes.business.spec — `EdgeShape.route` absent (ligne d'arête sans tracé)
  - edge-routing.e2e — `route` absent de la scène (non lancé)
- Pour green : `edge-routing.logic.ts` exporte `RoutePoint = {x,y}`, `Corridors` (données pures, structured-clone ; contient les rects et parents de la disposition + grille de couloirs), `buildCorridors(layout: MapLayout): Corridors`, `routeEdge(corridors, fromId, toId): RoutePoint[] | null` (monde ; orthogonal ; bord à bord ; n'évite pas les ancêtres des extrémités ; `null` = repli courbe directe), `roundedPath(points, radius): string` (`M0,0L90,0Q100,0 100,10L100,100`, rayon plafonné à la moitié du plus court segment). `Layouts` gagne `corridors: { optimized: Corridors; raw: Corridors }` calculé dans `computeLayouts` (donc dans le worker, au repos). `EdgeShape.route?: RoutePoint[] | null` rempli par la `edgeShapes` du business avec `routeEdge` sur les corridors de la disposition active (le grid est le calcul coûteux, fait dans le worker ; le chemin par arête reste un calcul léger au repos, mis en cache, en unités monde donc inchangé au zoom). `SceneEdge.route: RoutePoint[] | null` (monde, copie) dans `map-scene.logic.ts`, converti en client par `map-canvas.component.ts` comme `mid`. Faisceaux (U31) : laissés tels quels (le plus simple) ; les arêtes d'un faisceau ont `route: null`, seules les arêtes isolées sont routées.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edge-routing.logic.ts` (nouveau), `layout-compute.logic.ts`, `edges.logic.ts`, `edge-culling.logic.ts`, `map-scene.logic.ts`, `business/map.business.ts`, `components/map-canvas/map-canvas.component.ts`, `docs/user/src/content/docs/map.md` et `en/map.md`
- Changement : `buildCorridors` fait une grille de cellules (bords de toutes les boîtes) avec la boîte la plus profonde de chaque cellule (tableaux simples, clonables) ; `routeEdge` est un A* pondéré (virages pénalisés, attaches vers le milieu des côtés, budget 3000 états) sur les centres de cellules libres (ancêtres des extrémités autorisés), `null` sans couloir ; `roundedPath` arrondit les coins. `computeLayouts` ajoute `corridors` (worker). Le business route au repos avec les corridors de la disposition active (cache par paire de boîtes, en unités monde, donc inchangé au zoom ; seulement quand la disposition ne vole pas), `routedEdgeShape` donne `d` arrondi, flèche et étiquette sur la route ; au-delà de 50 arêtes à l'écran, seules les arêtes en rendu complet sont routées. `SceneEdge.route` (nul pour un faisceau) converti en client par le canvas ; `nearestEdge` comprend les `L`/`Q`.
- Suite : cargo 682/0 (= baseline) ; web 1029 réussis / 1 échoué (baseline 1008 + 21 nouveaux). Échec restant : `edge-routing.logic.spec > on the acme-shop layout > crosses no foreign box on any file import edge it routes`, car `acme-shop.snapshot.json` n'a aucune arête `imports` fichier→fichier (80 imports, tous vers des symboles) : `imports.length > 5` ne peut pas passer sans changer la fixture ou le test. e2e (5 specs demandées) : 4 passent ; `edge-routing.e2e` échoue au 3e test sur `expect(valeur, message)` ("Expect takes at most one argument", l'`expect` de wdio) ; la même spec sans le message passe 3/3 (aucune arête ne traverse de boîte étrangère). `just lint` propre, `just build` et `just docs-build` ok. Banc (`just bench-ui`, sans routes / avec) : dense zoom frame p95 21/20 à 25, work p95 13-14 / 9-15, sélection frame p95 26 / 24-28 ; excalidraw files zoom 20 / 21, sélection 38-50 / 40-48 ; excalidraw overview zoom frame p95 19 / 49 (work p95 12 / 14 : deux pics de 36 à 45 ms au premier passage d'un niveau, routes à froid, mesure `routes`), sélection 44 / 48. `buildCorridors` dans le worker : ~9 ms pour 9 200 boîtes ; `routeEdge` ~0,5 ms par arête à froid (jsdom).
- Questions ouvertes : (1) la fixture acme-shop sans import fichier→fichier fait échouer un test rouge ; (2) le test e2e utilise `expect(x, message)` incompatible avec wdio ; (3) excalidraw overview garde deux pics à froid de ~40 ms au zoom (frame p95 49 contre 19), `ROUTE_LIMIT` (50) et `SEARCH_BUDGET` (3000) sont les réglages si on veut moins.

### Green, suite (routage hors frame)

- Changement : le business ne route plus dans une frame au-delà de 6 arêtes manquantes par dessin (`ROUTE_SYNC`) ; les autres gardent la courbe directe (ou la route en cache) et sont routées par lots de 4 par `requestAnimationFrame` (`ROUTE_BATCH`), puis redessinées (`routeTick`). La file est vidée et refaite à chaque recalcul des formes.
- Suite : web 1030/1030, lint propre, build ok. Banc (p95 ms, zoom frame / sélection frame) : dense overview 21 / 23, dense files 21 / 24, excalidraw overview 20 (max 101) / 44, excalidraw files 21 / 44 ; « sans routes » : 21/26, 20/26, 19/44, 20/38-50. Plus de régression nette ; `routes` p95 ≤ 6 ms.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - map.business.ts:620-640 — la boucle de rAF (`routeFrame`) n'est jamais annulée à la destruction du business ; elle est finie (la file diminue, vidée à chaque recalcul), donc sans fuite durable, mais un `cancelAnimationFrame` à la destruction serait plus propre.
  - map.business.ts:~690 — les arêtes d'un faisceau sont routées (budget ROUTE_SYNC et lots) puis leur route est jetée par `sceneEdge` (`route: null`) : calcul perdu ; ne pas router les arêtes en faisceau.
  - edge-routing.logic.ts:33-34 — commentaire « States popped… » orphelin au-dessus de `CENTER_PULL`, à replacer au-dessus de `SEARCH_BUDGET`.
  - edge-routing.logic.ts:63-120 — `rects.slice`/`spans.splice` dans les boucles de `buildCorridors` et `routeEdge` : allocations inutiles, accès indexés suffisent.
  - map.business.ts `edgeShapes` — `pendingRoutes.clear()` (effet de bord) dans un `computed` : fonctionne, mais fragile.

## Answer

- `edge-routing.logic.ts` : `buildCorridors` tire une grille de couloirs de la disposition (dans le worker de S09, via `computeLayouts`) ; `routeEdge` cherche un tracé orthogonal (A* pondéré, virages pénalisés, budget de 3 000 états) qui ne traverse aucune boîte étrangère, ancêtres des extrémités autorisés, `null` = repli sur la courbe directe ; `roundedPath` arrondit les coins. Routes en unités monde, en cache par paire de boîtes et par disposition, donc inchangées pendant le zoom.
- Routage hors frame : au plus 6 routes au calcul des formes, le reste par lots de 4 par `requestAnimationFrame` puis redessiné (courbe directe en attendant) ; boucle annulée à la destruction. Seules les arêtes en rendu complet (≤ 50 à l'écran) et hors faisceau (U31) sont routées. Hit-test (`nearestEdge`) sur les segments `L` et `Q`.
- Orchestrateur : première version refusée pour régression du banc (excalidraw, frame de zoom p95 19 → 49 ms, au-dessus du budget de 33 ms) ; après le routage différé, frame de zoom p95 20 à 21 ms sur `dense` et excalidraw, comme sans routes. Deux tests rouges corrigés (fixture sans import fichier → fichier, `expect` à deux arguments).
- Vérifié : cargo 682, Vitest 1030 ; e2e 178 passés / 1 ignoré (dont `edge-routing` : aucune arête routée ne traverse de boîte étrangère au niveau Fichiers) ; `just lint` ; doc `map` FR/EN.
- Limites : les faisceaux (troncs et branches) ne suivent pas les couloirs ; au-delà de 50 arêtes à l'écran, pas de routage.
