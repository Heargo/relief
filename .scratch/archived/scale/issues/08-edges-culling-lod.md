# S08 Arêtes : hors de la vue et niveau de détail

Status: resolved
Type: task
Blocked by: S06
UI: oui
Doc: docs/user `map` (beaucoup d'arêtes)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Toutes les arêtes agrégées du niveau courant sont dans le DOM (4 éléments SVG chacune : zone de clic, trait, flèche, étiquette), même celles dont aucune partie n'est à l'écran.

## À faire

- Ne pas créer les arêtes dont la boîte englobante ne coupe pas la vue (marge de rendu comprise).
- Au-delà d'un seuil d'arêtes à l'écran (fixé par la mesure de S05) : les arêtes inchangées sont dessinées dans un seul `path`, sans flèche, sans étiquette ni zone de clic ; les arêtes changées, en violation, sélectionnées ou sur le rayon d'impact gardent leur rendu complet.
- Une arête du `path` commun reste sélectionnable : clic sur le trait retrouvé par une recherche de proximité (fonction pure), pas par le DOM.

## Reprise de S07

Budget de zoom transféré de S07 : au franchissement d'un seuil d'ouverture, la forme de chaque arête change (courbure, flèche et étiquette en pixels écran), donc toutes sont réécrites (`edgeWrite` 56 ms p95, `syncEdges` 24 ms p95 sur `dense`). Zoom p95 après S07 : 174 / 341 ms pour 33.

## Critères d'acceptation

- [ ] Budget de S05 tenu au pan et au zoom sur excalidraw. **Pan tenu** (3 à 14 ms partout). **Zoom non tenu, transféré à S14** (refonte du rendu) : 41 à 204 ms sur `dense`, 100 à 116 ms sur excalidraw, pour 33.
- [x] e2e : sur `dense` au niveau fichiers, une arête inchangée fusionnée se sélectionne au clic et ouvre l'inspecteur d'arête.
- [x] Sous le seuil, rendu identique à aujourd'hui (e2e existants inchangés).

## Baseline

`just test-summary` (2026-11-20, après S07, eef5e9a) : cargo 630 passed, 0 failed ; web 735 passed, 0 failed. e2e 140 passés, 1 ignoré, 0 échec. `just bench-ui` dense p95 (vue d'ensemble / zoomée) : pan 126 / 12 ms, zoom 174 / 341 ms, sélection 166 / 140 ms.

## Seams

- **Modules de logique TS** (`*.logic.ts`, Vitest) : attrape le culling des arêtes (boîte englobante contre vue + marge), le partage entre arêtes fusionnées et arêtes complètes (seuil ; changées, en violation, sélectionnées, sur le rayon d'impact restent complètes), le `d` du `path` commun, et la recherche de proximité qui retrouve l'arête sous un clic ; rate le DOM.
- **Entrées/sorties du canvas / business de la carte** (`TestBed`) : attrape que les arêtes hors de la vue ne sont pas dans le DOM, qu'au-delà du seuil un seul `path` porte les arêtes inchangées, et qu'un clic sur ce `path` sélectionne la bonne arête ; rate la mesure.
- **e2e WebdriverIO sur `dense` + suite existante + `just bench-ui`** : attrape le parcours « clic sur une arête fusionnée au niveau fichiers ouvre l'inspecteur d'arête », l'absence de régression sous le seuil, et les budgets de pan et de zoom.

## Seuil

Seuil d'arêtes à l'écran : **500** (`EDGE_MERGE_THRESHOLD`, `edge-culling.logic.ts`). Justification (`docs/bench.md`, S05 et après S06) : le pan coûte surtout le style et la mise en page du navigateur sur les chemins d'arêtes, soit environ 0,03 ms p95 par arête (dense fit : 126 ms pour 4 500 arêtes ; excalidraw fit : 53 ms pour 2 742 ; excalidraw zoomée : 32 ms pour 933), alors que dense zoomée (30 arêtes) tient à 12 ms. Le budget de pan (< 16 ms) laisse donc environ 500 arêtes en rendu complet. Les arêtes fusionnées (un seul `path`) coûtent un élément au lieu de quatre.

## Red

- Fichiers de test :
  - `src/ui/src/app/modules/map/helpers/edge-culling.logic.spec.ts`
  - `src/ui/src/app/modules/map/business/map-edge-culling.business.spec.ts`
  - `src/ui/src/app/modules/map/components/map-page/map-page-merged-edges.component.spec.ts`
  - `tests/e2e/tests/edges-merged.e2e.ts`
- Contrat attendu : module `helpers/edge-culling.logic.ts` exportant `EDGE_MERGE_THRESHOLD` (500), `edgeBounds(a, b)`, `edgeInView(box, camera, viewport, margin)`, `EdgeDetail`, `partitionEdges(edges, threshold?)` → `{ full, merged }` (fusion seulement au-delà du seuil, strictement), `mergedEdgesPath(ds)` (concaténation des `d`), `nearestEdge(edges, point, tolerance)` (`d` au format `M x,y Q cx,cy x,y` d'`edgeShape`, unités monde) ; `MapBusiness.edgeLines()` ne contient que les arêtes en rendu complet dans la vue (boîte + marge de 120 px) et `MapBusiness.mergedEdgeLines()` les arêtes du `path` commun ; le canvas écrit ce `path` avec `data-testid="map-edges-merged"` et un clic dessus sélectionne l'arête sous le point.
- Lancer :
  - `cd src/ui && npx --prefix web ng test --watch=false --include 'src/app/modules/map/**/*{edge-culling,merged-edges}*'`
  - `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/edges-merged.e2e.ts` (non lancé : demande le build de l'app ; échoue faute de `map-edges-merged`)
- En échec : 4 fichiers (3 Vitest + 1 e2e), 22 tests au total.
  - `edge-culling.logic.spec.ts` (16 tests : `edgeBounds`, `edgeInView`, `partitionEdges`, `mergedEdgesPath`, `nearestEdge`) — le module `./edge-culling.logic` n'existe pas (la compilation échoue).
  - `map-edge-culling.business.spec.ts` (5 tests : arêtes de la vue, rien hors vue, complet sous le seuil, fusion au-delà, arête sélectionnée en complet) — `MapBusiness.mergedEdgeLines` n'existe pas.
  - `map-page-merged-edges.component.spec.ts` (2 tests : un seul `path` sans flèche ni zone de clic, clic sur le `path` sélectionne l'arête) — `mergedEdgeLines` et `map-edges-merged` manquants.
  - `edges-merged.e2e.ts` (1 test : clic sur une arête fusionnée de `dense` au niveau fichiers ouvre `edge-panel`) — `map-edges-merged` absent.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edge-culling.logic.ts` (nouveau), `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts` et `.scss`, `docs/bench.md`
- Changement : `edge-culling.logic.ts` (boîte, vue + marge, partage plein / fusionné au seuil de 500, `d` commun, recherche de proximité). `MapBusiness` ne garde que les arêtes de la vue (non mesurée : pas de culling) et expose `edgeLines()` (rendu complet) et `mergedEdgeLines()` ; le canvas écrit le `path` `map-edges-merged` et sélectionne par proximité au clic (le clic sur un nœud sous le trait compte aussi). `setViewport` rejoue le niveau choisi avant la première mesure (le clic e2e sur `level-2` tombait sur une caméra à échelle négative, donc NaN à l'animation).
- Suite : cargo 630 / 0 (= baseline) ; web 759 réussis / 1 échoué (baseline 735 / 0 + 25 tests rouges) ; e2e 141 passés, 1 ignoré, 0 échec. Bench pan dense 126 / 12 → 11 / 11, zoom 174 / 341 → 38 / 220 (autre passe 40 / 62), sélection 166 / 140 → 163 / 136 ; excalidraw pan 53 / 32 → 3 / 7, zoom → 120 / 114 (autre passe 401 / 110) : pan tenu, zoom non tenu (voir `docs/bench.md`).
- Questions ouvertes : (1) test rouge faux : `edge-culling.logic.spec.ts` ligne 51, `{ y: -200, h: 79 }` finit à y = -121, soit 1 px au-delà de la marge de 120 (les cas x 1119 / 1121 et y 721 imposent une marge symétrique) ; il faut `h: 80`, ou une marge de 121. (2) `just lint` échoue sur Prettier : `tests/edges-merged.e2e.ts` (fichier rouge, non modifié) n'est pas formaté. (3) Zoom : `allEdges` / `edgeStates` recalculés pour toutes les arêtes à chaque franchissement de seuil, reste à limiter à la vue.

### Suite (revue)

- Les états et formes d'arête ne sont calculés que pour les arêtes de la vue + marge, avec cache par arête ; les arêtes que la sélection distingue restent en rendu complet, le `path` commun s'estompe (`dim`) quand quelque chose est sélectionné ; commentaire sur `setCamera` puis `setLevel` dans `setViewport`.
- Suite : cargo 630 / 0, web 760 / 0, e2e 141 passés, 1 ignoré, 0 échec, lint propre.
- Bench (2 passes, voir `docs/bench.md`) : pan dense 14 / 12 et 11 / 11, excalidraw 3 / 9 et 3 / 7 (tenu) ; zoom dense 49 / 204 et 41 / 202, excalidraw 116 / 106 et 111 / 100 (non tenu : le travail marqué tient dans environ 20 ms de `compute`, le reste est du style / mise en page navigateur sur les nœuds à chaque franchissement de seuil, hors S08).

## Answer

- `edge-culling.logic.ts` : `edgeBounds`, `edgeInView` (vue + marge de 120 px), `partitionEdges` (seuil `EDGE_MERGE_THRESHOLD` = 500 arêtes à l'écran), `mergedEdgesPath`, `nearestEdge` (clic retrouvé par proximité, 6 px).
- `MapBusiness` : culling avant `edgeStates` / `edgeShapes`, calculés à la demande pour les arêtes de la vue avec un cache par arête ; `edgeLines()` (rendu complet : changées, en violation, sélectionnées, liées à la sélection, sur le rayon d'impact) et `mergedEdgeLines()` (un seul `path` sans flèche, étiquette ni zone de clic, estompé dès qu'une sélection existe).
- Course corrigée dans `setViewport` : un niveau choisi avant la première mesure du canvas est rejoué après elle.
- Test rouge corrigé par l'orchestrateur (`edge-culling.logic.spec.ts`, `h: 79` → `h: 81`, faux d'un pixel).
- Doc utilisateur `map` (FR et EN) : paragraphe sur les arêtes fusionnées ; `just docs-build` passe.
- Bench p95 (vue d'ensemble / zoomée), S07 → S08 : `dense` pan 126 / 12 → 11 / 11, zoom 174 / 341 → 41 / 202, sélection inchangée (~160 / 140) ; excalidraw pan 53 / 32 → 3 / 7, zoom 625 / 296 → 111 / 100. Ce qui reste au zoom : ~40 à 50 ms de travail marqué, et jusqu'à ~150 ms hors marques (style et mise en page du navigateur sur 1 300 à 1 500 nœuds à chaque franchissement de seuil, estimé par soustraction).
- Vérifié : cargo 630 / 0, web 760 / 0 (baseline 630 / 735), `just lint` propre, `just e2e-summary` 141 passés, 1 ignoré, 0 échec.
- `Consider` non appliqués : le `d` est relu par regex dans `nearestEdge` (contrat implicite avec `edgeShape`) ; test `MERGED_TESTID` dupliqué dans le canvas, et un clic sur un nœud à moins de 6 px d'un trait sélectionne l'arête ; `_impact` porté à la fois par le canvas et le business.
