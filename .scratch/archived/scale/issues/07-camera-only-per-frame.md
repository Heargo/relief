# S07 Ne recalculer à chaque frame que ce qui suit la caméra

Status: resolved
Type: task
Blocked by: S05
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Dans `MapBusiness` et `MapCanvasComponent`, beaucoup de calculs indépendants de la caméra sont refaits à chaque frame parce qu'ils sont dans le même `computed` qu'elle.

## À faire

- `computeModes` : un seul `computed` partagé par `visibleNodes` et `boxIds`, qui ne dépend que de l'échelle (pas de `tx`, `ty`).
- Un seul `computed` des boîtes visibles (`visibleNodes().filter(mode === 'box')` est refait par `edgeLines`, `coChangeLines` et `containerToLoad`).
- État de chaque arête (statut de diff, violations, comptes, libellé, classe, infobulle) calculé une fois par `edges`, `diff`, `violations`, langue ; `edgeLines` n'ajoute que la forme.
- Infobulles des arêtes (`<title>`) créées au premier survol, pas à chaque synchronisation.
- Emphase de la sélection (`nodeEmphasis`, `edgeEmphasis`) recalculée quand la sélection, les arêtes ou les modes changent, pas au pan.
- Placement des étiquettes d'arêtes : une grille des boîtes visibles au lieu de tester chaque étiquette contre toutes les boîtes.
- Clé de synchronisation d'un nœud (`dataset.key`) : ne la reconstruire que si l'une de ses entrées a changé.

## Ajouts après S06 (mesure du 2026-11-20, `docs/bench.md`)

- Au repos ou au franchissement d'un seuil, `syncEdges` réécrit toutes les arêtes (~70 ms p95) et `edgeLines` les recalcule toutes (~45 ms p95) : ne réécrire dans le DOM que les arêtes dont la forme ou l'état a changé (clé par arête).
- La sélection coûte ~100 ms hors marques : marquer `selectedNodeEdges` et `selectedEdge` (et le panneau) pour la détailler, puis la ramener sous le budget.

## Critères d'acceptation

- [ ] Budget de S05 tenu au zoom et à la sélection sur `dense` (`just bench-ui`). **Non tenu, transféré** : zoom 174 / 341 ms (budget 33) → S08 (au franchissement d'un seuil, chaque arête change de forme et est réécrite) ; sélection 166 / 140 ms (budget 100) → S13 (~100 ms hors marques : panneau et recalcul de style).
- [x] Tests Vitest des fonctions pures déplacées (grille d'étiquettes, état d'arête) ; tous les tests existants passent sans changement de rendu.

## Baseline

`just test-summary` (2026-11-20, après S06, d075d03) : cargo 630 passed, 0 failed ; web 710 passed, 0 failed. e2e 140 passés, 1 ignoré, 0 échec. `just bench-ui` dense p95 (vue d'ensemble / zoomée) : pan 127 / 12 ms, zoom 227 / 371 ms, sélection 160 / 142 ms.

## Seams

- **Modules de logique TS** (`*.logic.ts`, Vitest) : attrape la grille des boîtes pour placer les étiquettes (même résultat que le test contre toutes les boîtes), l'état d'une arête (statut, violations, comptes, libellé, classe) calculé sans caméra, et la clé de synchronisation d'une arête ou d'un nœud ; rate le DOM.
- **Business de la carte** (`MapBusiness`, `TestBed`, `ReliefApiService` mocké, compteurs par les marques `relief:*`) : attrape que `computeModes` ne se relance pas au pan, que l'état des arêtes ne se relance pas au changement d'échelle, que l'emphase ne se relance pas au pan, et qu'une seule liste de boîtes visibles est calculée ; rate le rendu.
- **Entrées/sorties du canvas, suite e2e existante et `just bench-ui`** : attrape qu'au repos seules les arêtes changées sont réécrites (compteur exposé par le canvas ou marque), l'absence de régression de rendu, et les budgets de zoom (< 33 ms) et de sélection (< 100 ms) sur `dense`.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/box-grid.logic.spec.ts`, `src/ui/src/app/modules/map/helpers/edge-state.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-camera-only.business.spec.ts`, `src/ui/src/app/modules/map/components/map-page/map-page-edge-writes.component.spec.ts`
- Lancer : `cd src/ui && npx ng test --watch=false --include 'src/app/modules/map/**/{box-grid,edge-state}.logic.spec.ts' --include 'src/app/modules/map/**/map-camera-only.business.spec.ts' --include 'src/app/modules/map/**/map-page-edge-writes.component.spec.ts'`
- Contrat attendu (symboles à créer) : `helpers/box-grid.logic.ts` exporte `createBoxGrid(rects, cell?)` avec `.hits(x, y, halfW, halfH)` (recouvrement strict) et `edgeShape` accepte cette grille à la place de `Rect[]` ; `helpers/edge-state.logic.ts` exporte `edgeState(edge, { diff, violations, words, label, unit })` → `{ status, violations, added, removed, moved, review, cls, label, tooltip }` et `edgeSyncKey(shape, state, selected, scale)` ; `MapBusiness.emphasis()` → `{ nodes, edges }` (Map) ; marques `measured` : `modes`, `visibleBoxes`, `edgeStates`, `emphasis`, et `edgeWrite` (une par arête réécrite dans `syncEdges`).
- En échec : 4 fichiers, tous en échec de compilation faute des symboles (le build Vitest entier échoue : `box-grid.logic`, `edge-state.logic`, `MapBusiness.emphasis` manquants)
  - box-grid.logic.spec (6 tests) — `./box-grid.logic` n'existe pas
  - edge-state.logic.spec (10 tests) — `./edge-state.logic` n'existe pas
  - map-camera-only.business.spec (7 tests) — `emphasis` absent de `MapBusiness`, marques `modes`, `visibleBoxes`, `edgeStates`, `emphasis` non émises
  - map-page-edge-writes.component.spec — lancé seul : « writes every edge the first time » (0 au lieu de 3) et « writes only the edge that gets selected » (0 au lieu de 1) échouent, marque `edgeWrite` absente ; « writes no edge when nothing changed » passe à vide (0 marque) tant que la marque n'existe pas, il ne prend son sens qu'avec la marque.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/box-grid.logic.ts` (nouveau), `helpers/edge-state.logic.ts` (nouveau), `helpers/edges.logic.ts`, `business/map.business.ts`, `components/map-canvas/map-canvas.component.ts`, `components/map-page/map-page.component.ts`, `docs/bench.md`
- Changement : `modes`, `visibleBoxes`, `edgeStates`, `edgeShapes`, `emphasis` sont des `computed` marqués et séparés de la caméra ; `edgeShape` accepte une grille de boîtes ; `edgeLines` assemble forme + état. Le canvas ne réécrit une arête que si sa clé (`edgeSyncKey` + impact) change (marque `edgeWrite`), crée les `<title>` au premier survol, et applique l'emphase par des effets séparés. `MapBusiness.setTranslator` reçoit le traducteur du canvas (le business n'injecte pas `LanguageBusiness`). `MapPageComponent` garde une tâche en attente jusqu'à `diffSettled`, pour que `whenStable` attende la carte dessinée (sinon le test d'écriture des arêtes, diff en échec, voit 0 arête).
- Suite : web 735 réussis / 0 échec (baseline 710 + 25 rouges), cargo 630 / 0, e2e 140 passés / 1 ignoré / 0 échec ; lint propre.
- Bench dense (`work` p95, vue d'ensemble / zoomée), S06 -> S07 : pan 127 / 12 -> 126 / 12 ; zoom 227 / 371 -> 174 / 341 ; sélection 160 / 142 -> 166 / 140.
- Questions ouvertes : budgets de zoom (< 33 ms) et de sélection (< 100 ms) non tenus. Zoom : un franchissement de seuil change la forme de chaque arête (courbure, flèche, place de l'étiquette en pixels écran), donc toutes sont réécrites (`edgeWrite` 56 ms p95) : S08 (arêtes hors de la vue, niveau de détail). Sélection : ~15 ms marqués, ~100 ms restants hors marques (détection de changement du panneau et des arêtes du nœud, recalcul de style navigateur sur `data-emph` et les classes d'arêtes) : pas couvert par S08 tel que décrit, à ouvrir. Clé de synchronisation d'un nœud (`dataset.key`) non reconstruite moins souvent (aucun test rouge, gain marqué nul : `syncNodes` 6 ms).

## Answer

- `modes`, `visibleBoxes`, `edgeStates`, `edgeShapes` et `emphasis` sont des `computed` séparés de la caméra (marqués `relief:*`, sauf `edgeShapes`). `edgeState` / `edgeSyncKey` (`edge-state.logic.ts`) et la grille des boîtes (`box-grid.logic.ts`, `createBoxGrid`) sont des fonctions pures testées ; `edgeShape` accepte la grille.
- Le canvas ne réécrit une arête que si sa clé change (marque `edgeWrite`) ; les `<title>` sont créés au premier survol ; l'emphase passe par des effets séparés.
- Le business reçoit le traducteur par `setTranslator` ; `MapPageComponent` garde une `PendingTasks` jusqu'à la fin du diff (sans elle, `whenStable` rendait la main avant le dessin quand le diff échoue).
- Bench `dense` p95 (vue d'ensemble / zoomée), S06 → S07 : pan 127 / 12 → 126 / 12 ; zoom 227 / 371 → 174 / 341 ; sélection 160 / 142 → 166 / 140. Les calculs marqués sont sous 3 ms. Budgets de zoom et de sélection non tenus : transférés à S08 et à S13 (créé).
- Non fait : la clé `dataset.key` d'un nœud n'est pas reconstruite moins souvent (`syncNodes` ~6 ms, aucun test ne la demande).
- Vérifié : cargo 630 / 0, web 735 / 0 (baseline 630 / 710), `just lint` propre, `just e2e-summary` 140 passés, 1 ignoré, 0 échec.
- Review : fix first sur le seul critère de budget, traité par le transfert ci-dessus. `Consider` non appliqués : injecter `LanguageBusiness` plutôt que `setTranslator` ; déplacer la `PendingTasks` dans un business ; cast + filtre inutile dans `containerToLoad` ; double régime `Rect[]` / `BoxGrid` dans `edgeShape` ; marque manquante sur `edgeShapes`.
