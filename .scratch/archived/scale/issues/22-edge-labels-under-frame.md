# S22 Placement des étiquettes d'arête sous une frame

Status: resolved
Type: task
Blocked by: S21
UI: oui (rien de visible)
Doc: `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md` (budget 60 fps)

## Constat

Après S21, sur `dense` ajusté, le zoom reste à ~20 ms p95 : au franchissement de seuil, `edgeLines` coûte 8 à 12 ms (placement des étiquettes contre la grille de boîtes pour ~4000 arêtes en vue), plus des frames sans marque de 20 à 27 ms (GC probable). La réutilisation des `EdgeLine` entre frames n'apporte rien (S21).

## À faire

- Ne placer une étiquette que pour les arêtes assez longues à l'écran pour l'afficher (seuil du peintre), ou étaler le placement sur plusieurs frames sans changer le résultat au repos.
- Réduire les allocations par frame si les frames sans marque sont du GC (mesurer d'abord).

## Critères d'acceptation

- [ ] `just bench-ui` : zoom p95 < 16 ms sur `dense` ajusté et zoomé, mesuré en A/B dans les mêmes conditions. **Non atteint** : ~18 ms ajusté, 14 à 16 ms zoomé.
- [x] Au repos, la carte dessinée est identique à celle d'avant ; tous les tests existants passent sans changement.

## Baseline

`1b024a9` : cargo 654 ; web 853 ; e2e 154 passés / 1 ignoré. Banc A/B de S21 (machine chargée), zoom `work` p95 ajusté / zoomé : `dense` 20 / 15 ms, excalidraw 16 / 19 ms ; pires frames de `dense` ajusté : `edgeLines` 8 à 12 ms.

## Seams

- **Logique pure (`*.logic.ts`, Vitest)** : la décision « cette arête a-t-elle une étiquette placée ? » (longueur à l'écran contre le seuil du peintre) et, si le placement est étalé, le résultat au repos identique au placement complet. Attrape une étiquette perdue ou de trop ; rate le temps.
- **Peintre (`edge-painter` via le contexte factice existant)** : une arête trop courte à l'écran pour son étiquette n'en dessine pas, comme aujourd'hui ; une arête assez longue la dessine au même endroit. Attrape le dessin ; rate le temps.
- **Banc (`just bench-ui`, orchestrateur, A/B)** : zoom p95 < 16 ms sur `dense` ajusté et zoomé. Attrape le temps ; rate la justesse.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edge-label-placement.logic.spec.ts` (nouveau, rouge), `src/ui/src/app/modules/map/components/map-canvas/edge-painter.spec.ts` (nouveau, garde-fou)
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/helpers/edge-label-placement.logic.spec.ts` (idem pour le peintre avec `.../components/map-canvas/edge-painter.spec.ts`)
- Fonction à introduire pour green : `edgeLabelNeedsPlacement(screenLength: number): boolean` dans `edges.logic.ts` (vrai si `screenLength > 60`, même seuil que `edgeLabelVisible`, à partager). `edgeShape` doit l'appeler sur `geometry.length` et, si faux, ne pas interroger la grille : étiquette à t = 0.5, `covered = false`, résultat égal à `edgeShape(a, b)` sans boîtes.
- En échec : 1 fichier (4 tests : `edgeLabelNeedsPlacement` x2, `edgeShape` placement x4 selon le dénombrement du fichier = 6 tests) — le fichier ne compile pas, export `edgeLabelNeedsPlacement` absent.
- Garde-fou, déjà vert (2 tests, `edge-painter.spec.ts`) : le peintre ne dessine déjà pas d'étiquette si `label.visible` est faux et la dessine à `mid` sinon ; la décision de seuil vit dans `edgeShape`/`sceneEdge`, pas dans le peintre, donc il n'y a pas de rouge côté peintre.
- Attention green : `map-hit.logic.ts` teste `labelRect && !shape.covered` même pour une étiquette non visible ; une arête courte passera à `covered = false`.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edges.logic.ts`, `src/ui/src/app/modules/map/helpers/map-scene.logic.ts`
- Changement : `edgeLabelNeedsPlacement(screenLength)` (seuil 60 px partagé avec `edgeLabelVisible`) ; `edgeShape` ne consulte plus la grille pour une arête trop courte (t = 0.5, `covered = false`). `sceneEdge` met `labelRect` à `null` pour une étiquette non visible, donc `hitTest` (inchangé) ne touche jamais une étiquette invisible.
- Suite : cargo 654 / 0 ; web 861 / 0 (baseline 853 + 8 nouveaux tests) ; lint propre ; e2e non relancé.
- Banc A/B (`just bench-ui`, `dense`, zoom `work` p95 en ms, ajusté / zoomé, passages alternés B1 A1 B2 A2 B3 A3 B4) : avec le changement 20/15, 20/14, 20/15, 19/14 ; sans 20/16, 19/16, 18/15. `edgeLines` p95 6 à 7 ms dans les deux cas. Critère < 16 ms non atteint en ajusté : le seuil seul ne change rien dans le bruit de mesure.
- Questions ouvertes : (1) sur `dense` presque toutes les arêtes en vue sont longues à l'écran (microbanc : 3883 sur 4000 au-dessus de 60 px), donc le seuil n'épargne presque aucun placement ; le coût vient de `edgeGeometry` (chaînes `d`/`arrow`, ~5 à 10 ms pour 4000 arêtes) et, dans `syncCanvas`, de `new Path2D(d)` pour chaque nouvelle chaîne quand l'échelle de repos change (le `d` dépend de l'échelle). Pistes non faites : chaînes `d`/`arrow` paresseuses, ou Path2D construits sans passer par une chaîne. (2) Le clic sur une étiquette invisible (arête courte, non couverte) était touché avant (rect non nul, non couvert) ; il ne l est plus.

### Essai Path2D directs (abandonné)

`d`/`arrow` paresseux, `EdgeCurve` en nombres, `Path2D` en moveTo/quadraticCurveTo/lineTo mis en cache par géométrie dans le peintre. Vitest passait (861). A/B alterné 3 passages, `dense` zoom `work` p95 ajusté / zoomé : seuil seul 18/14, 18/16, 18/16 ; avec Path2D directs 17/13, 17/13, 18/15. Gain ~1 ms en ajusté (< 2 ms) : revenu au seuil seul.

## Review

- Verdict : fix first, corrigé : test de `sceneEdge` (étiquette non vide d'une arête courte : `labelRect` nul ; vérifié rouge sur l'ancien code), section S22 de `docs/bench.md`, retour anticipé dans `edgeShape`. Changement gardé : correct, petit, sans régression.

## Answer

- `edgeLabelNeedsPlacement` (seuil de 60 px partagé avec le peintre) : `edgeShape` ne place plus contre la grille l'étiquette d'une arête trop courte pour l'afficher ; `sceneEdge` ne donne plus de `labelRect` à une étiquette invisible, donc un clic ne la touche plus. Dessin au repos inchangé.
- Fermé avec le critère de temps **non atteint**, décision de l'orchestrateur : sur `dense`, 3 883 arêtes sur 4 000 dépassent le seuil, le gain est dans le bruit (A/B : 18-20 / 14-16 ms avant et après). Essai `Path2D` construits sans chaînes : ~1 ms, abandonné (seuil de 2 ms). Le budget de 33 ms de l'ADR 0009 est tenu ; 60 fps sur une vue de 4 000 arêtes ne l'est pas. Ce qui reste (chaînes de courbes et `Path2D` refaits à chaque seuil, frames sans marque) est décrit dans `docs/bench.md` ; pas de ticket de suite tant que le besoin n'est pas exprimé.
- Vérifié : Vitest 862 ; e2e 154 / 1 ignoré ; `just lint` propre.
