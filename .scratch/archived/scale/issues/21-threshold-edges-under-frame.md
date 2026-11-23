# S21 Arêtes au franchissement de seuil sous une frame

Status: resolved
Type: task
Blocked by: S20
UI: oui (rien de visible)
Doc: `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md` (budget 60 fps)

## Constat

Spike S14, sans le compteur de croisements : une frame de franchissement de seuil coûte encore 25 à 35 ms sur `dense` et excalidraw, en calcul : `allEdges` (agrégation des arêtes pour les boîtes visibles, 4 à 10 ms), `edgeStates` (5 à 18 ms), `edgeLines` (4 à 18 ms). Le dessin Canvas coûte 2 à 7 ms.

## À faire

- Mesurer chaque marque au seuil, puis réduire : agrégation incrémentale (seules les boîtes dont le mode change), états d'arête mis en cache par arête agrégée et non recalculés quand seul l'ensemble change, formes calculées pour la vue seulement (déjà le cas, vérifier).
- Ne rien changer à ce qui est dessiné.

## Critères d'acceptation

- [ ] `just bench-ui` : zoom p95 < 16 ms sur `dense` et excalidraw, ajusté et zoomé (hors frame de chargement d'un sous-graphe, qui relève de S09). **Partiel** : tenu sur `dense` zoomé, à 1 à 3 ms près sur excalidraw selon la charge, pas sur `dense` ajusté (~20 ms) ; reste reporté en S22.
- [x] Tous les tests existants passent sans changement.

## Baseline

`bbf6560` (après S09) : cargo 630 ; web 843 ; e2e 154 passés / 1 ignoré. `just bench-ui`, zoom `work` p50/p95 (max) : `dense` 2/19 (36) ajusté, 2/29 (54) zoomé ; excalidraw 2/22 (50), 3/23 (26). Pires frames : `allEdges` 5 à 12 ms, `edgeStates` 2 à 14 ms, `edgeLines` 2 à 18 ms.

## Seams

- **Logique pure (`*.logic.ts`, Vitest)** : chaque calcul rendu incrémental ou mis en cache (agrégation des arêtes, états, formes) donne exactement le même résultat que le calcul complet actuel, sur une suite de changements de modes (ouverture et fermeture de boîtes, franchissements de seuil dans les deux sens). Attrape la divergence du cache ; rate le temps.
- **Suite existante inchangée (Vitest + e2e)** : aucun test existant modifié ; ce qui est dessiné ne change pas (scène identique). Attrape les régressions visibles ; rate le temps.
- **Banc (`just bench-ui`, orchestrateur)** : zoom p95 < 16 ms sur `dense` et excalidraw, ajusté et zoomé. Attrape le temps ; rate la justesse.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edge-aggregator.logic.spec.ts`, `src/ui/src/app/modules/map/helpers/edge-state-cache.logic.spec.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/helpers/edge-aggregator.logic.spec.ts` (idem avec `edge-state-cache.logic.spec.ts`)
- En échec : 10 tests (5 + 5), tous parce que les modules `./edge-aggregator.logic` et `./edge-state-cache.logic` n'existent pas (la compilation échoue).
  - edge-aggregator : équivalence avec `aggregateEdges` sur 11 étapes de modes ; même résultat quel que soit le chemin ; sans prédicat `changed` ; même objet `AggregatedEdge` pour une paire non touchée ; pas de mutation du tableau précédent.
  - edge-state-cache : égal à `edgeState` ; même objet au second appel ; même objet pour une arête égale (mêmes liens) ; recalcul quand la paire agrège d'autres liens ; conservation sur une suite d'ensembles.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edge-aggregator.logic.ts` (nouveau), `src/ui/src/app/modules/map/helpers/edge-state-cache.logic.ts` (nouveau), `src/ui/src/app/modules/map/helpers/edges.logic.ts`, `src/ui/src/app/modules/map/helpers/box-grid.logic.ts`, `src/ui/src/app/modules/map/business/map.business.ts`
- Changement : agrégateur incrémental (seules les arêtes sous une boîte dont la visibilité change sont rattachées de nouveau, les paires non touchées gardent leur objet) ; cache d'états par paire, valide tant que les liens sont les mêmes, et qui survit aux changements d'ensemble ; `edgeGeometry` séparé de `edgeShape` (courbe, flèche et longueur gardées tant que les rects et l'échelle sont les mêmes, seul le placement du label dépend de la grille) ; clés numériques dans `BoxGrid` ; boucle de placement du label sans allocation. Le dessin est inchangé.
- Suite : cargo 630/0 (comme la baseline) ; web 853 passés / 0 échoué (843 + 10 tests rouges). `just lint` : seul avertissement prettier sur `edge-state-cache.logic.spec.ts` (fichier rouge indexé, non modifiable).
- Bench (`just bench-ui`, zoom `work` p50/p95 (max), avant -> après, bruit d'un run à l'autre de 1 à 3 ms) : `dense` ajusté 2/19 (36) -> 2/19 (27), zoomé 2/29 (54) -> 2/15 (45) ; excalidraw ajusté 2/22 (50) -> 2/11 (42), zoomé 3/23 (26) -> 3/16 (24). Pires frames : `allEdges` 5-12 -> 2-8 ms, `edgeStates` 2-14 -> 1-3, `edgeLines` 2-18 -> 2-17.
- Questions ouvertes : critère < 16 ms p95 non tenu sur `dense` ajusté (19 ms) ; les pires frames y viennent surtout de `edgeLines` (objets de ligne et placements de labels pour ~4000 arêtes à la fois) et de frames sans marque (GC ou dessin). Pistes : ne rendre que les arêtes de la vue avant de créer les objets, ou étaler le calcul. Le prettier du fichier rouge `edge-state-cache.logic.spec.ts` est à corriger côté red.

### Green, bilan

- Critère < 16 ms p95 non tenu sur `dense` : 19 ms ajusté (zoomé 15 à 21 selon les runs) ; excalidraw tenu (11 et 15 à 16). Un `lineCache` d'`EdgeLine` a été essayé puis retiré (aucun gain).
- Temps restant sur `dense` ajusté, pires frames : `edgeLines` 8 à 12 ms (placement des labels contre la grille, objets de ligne pour ~4000 arêtes), `allEdges` 3 à 5, `edgeStates` 1 à 3, `syncCanvas` 1, `visibleNodes` jusqu'à 13 sur une frame ; 20 à 27 ms de frames sans marque (GC ou dessin).
- Pistes : ne placer un label que pour les arêtes assez longues à l'écran pour l'afficher (> 60 px), ou étaler le calcul sur plusieurs frames.

## Review

- Verdict 1 : fix first. Ordre des paires de l'agrégateur différent du calcul complet après une ouverture/fermeture (ordre de peinture et égalités de hit-test) ; le spec le masquait par un tri. Corrigé : spec en ordre exact (red), `Pair.first` et tri seulement quand une paire est touchée (green). Variable `line` inutile retirée ; commentaire sur le couplage `_infos` / `_edges` / `_parents`.
- Invalidations relues : agrégateur, cache d'états et `edgeGeometry` corrects.

## Answer

- Agrégation des arêtes incrémentale (`edge-aggregator.logic.ts`) : seules les arêtes sous une boîte dont la visibilité change sont rattachées de nouveau, les paires intactes gardent leur objet, ordre identique au calcul complet. Cache d'états par paire (`edge-state-cache.logic.ts`), qui survit aux changements d'ensemble. `edgeGeometry` séparé de `edgeShape` ; clés numériques dans `BoxGrid` ; placement des labels sans allocation. Dessin inchangé.
- Essayé et retiré : réutilisation des `EdgeLine` entre frames (aucun gain : au seuil les formes sont nouvelles).
- Banc A/B dans les mêmes conditions (machine chargée), zoom `work` p95 ajusté / zoomé : `dense` 21 / 24 → 20 / 15 ms ; excalidraw 21 / 23 → 16 / 19 ms. Pires frames : `allEdges` 5-12 → 2-8 ms, `edgeStates` 2-14 → 1-3 ms. Sélection : aucune régression (passages alternés avec et sans S21 identiques ; des p95 proches de 100 ms apparaissent selon la charge dans les deux cas).
- Reste (S22) : `edgeLines` 8 à 12 ms sur `dense` ajusté (placement des labels de ~4000 arêtes en vue) et frames sans marque (GC). Pistes : placer un label seulement pour les arêtes assez longues à l'écran pour l'afficher, ou étaler le calcul.
- Vérifié : `just lint` propre ; cargo 630, web 853 ; e2e 47/47 deux fois.
