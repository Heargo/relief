# S20 Canvas seul rendu de la carte

Status: resolved
Type: task
Blocked by: S19
UI: oui
Doc: `docs/user` `map` (captures) ; `docs/dev/rules.md` ; `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Comportement

- Canvas devient le seul rendu : la préférence `relief.renderer` et `?renderer=` disparaissent, le DOM de la carte est retiré (`sync*`, `mark`, `fill`, styles des nœuds et arêtes dans `map-canvas.component.scss`, `MERGED_TESTID`…). Le reste du composant (fil d'Ariane, niveaux, légende) reste en Angular.
- `RELIEF_RENDERER` / `RELIEF_E2E_RENDERER` disparaissent du banc et du harnais.
- `docs/dev/rules.md` : la carte est un canvas (ADR 0009), e2e par l'API de scène.
- Coins arrondis des boîtes (6 px) et de l'onglet (4 px) dans le peintre, comme le DOM (S17 les a laissés carrés) ; tests du peintre adaptés.
- Identifier la spec e2e instable vue en S16 et S17 (une spec sur 47 échoue parfois dans `just e2e-summary`, jamais en relance).
- Reprises de S18 : halo des étiquettes d'arête (`--relief-map`), survol en accent ; élagage des arêtes hors écran dans le peintre si le banc le demande ; tableaux de tirets réutilisés.
- Reprises de S19 : supprimer `hitNode` (mort) ; annuler le `requestAnimationFrame` du survol à la sortie du pointeur et effacer l'infobulle pendant un pan ou un zoom ; une `Map` par id dans la scène mémoïsée ; grille de S07 pour le hit-test du survol si le banc le demande ; identifier le test Vitest instable (un échec sur un passage de `just test-summary` en S19).
- `docs/bench.md` : section « After S20 » avec `just bench-ui` sur `dense` et excalidraw.

## Critères d'acceptation

- [x] `just e2e` vert, `just lint` propre, `just test` vert.
- [x] `just bench-ui` : sélection p95 < 100 ms, pan p95 < 16 ms, zoom p95 < 33 ms sur `dense` et excalidraw.
- [x] Plus aucune référence au rendu DOM des nœuds et arêtes dans `src/ui/`.

## Baseline

`f48a06f` : cargo 630 ; web 852 ; e2e DOM 155 passés / 1 ignoré ; e2e canvas 47/47 specs.

## Seams

- **e2e (`tests/e2e/tests/map-canvas.e2e.ts`, toute la suite)** : sans paramètre ni préférence, la carte est un `<canvas>` et aucun élément `map-node` / `map-edge` n'existe ; toute la suite passe ainsi. Rate le dessin fin.
- **Peintre (`map-painter.spec.ts`, `edge-painter` via le même contexte factice)** : coins arrondis des boîtes (6 px) et de l'onglet (4 px), halo des étiquettes d'arête (`--relief-map`). Rate les pixels.
- **Composants (`map-page-*.component.spec.ts`, Vitest)** : les specs qui lisent le DOM de la carte passent par la scène (`window.__reliefScene()` ou les sorties du composant) ; celles qui mesuraient les écritures DOM (`map-page-edge-writes`) disparaissent avec lui.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-canvas/map-painter.spec.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas-interactions.component.spec.ts` (sans `?renderer=canvas`), `src/ui/src/app/modules/map/components/map-page/map-page-{edge-labels,edge-usages,inspector,merged-edges}.component.spec.ts` (par la scène et des clics aux coordonnées de la scène), `tests/e2e/tests/map-canvas.e2e.ts`, `tests/e2e/tests/map-scene.e2e.ts` (test de comparaison au DOM retiré), `tests/e2e/helpers/open-relief.ts` et `tests/e2e/bench/render.ts` (`RELIEF_E2E_RENDERER` / `RELIEF_RENDERER` retirés). Supprimés : `map-page-edge-writes.component.spec.ts`, `renderer.logic.spec.ts`. `map-page-flow-trace` ne lit pas le DOM de la carte : inchangé.
- Lancer : `cd src/ui && npx ng test --watch=false 2>&1 | grep -E "Tests |Test Files|FAIL" | head`, puis `just build` et `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/map-canvas.e2e.ts`
- En échec : 43 tests Vitest (844 au total, 801 passent) et la spec e2e `map-canvas` :
  - `map-painter.spec.ts` (13) — `readPalette` sans clé `map` / `--relief-map` ; boîtes (fond, bordure, ouvert, onglet, ajouté/modifié, impact, alphas, hors écran, caméra) : aucun `roundRect` (le peintre appelle encore `fillRect` / `strokeRect`), rayon 6 px et 4 px (onglet) ; halo : aucun `strokeText` couleur `map` sous le `fillText` de l'étiquette ; ordre boîtes / arêtes / étiquettes : pas de `roundRect`.
  - `map-canvas-interactions.component.spec.ts` (12) — sans `?renderer=canvas` la carte est encore en DOM : pas de `map-surface` canvas.
  - `map-page-edge-labels` (1) — `[data-testid="map-edges"]` / `map-edge` existent encore dans le DOM.
  - `map-page-edge-usages` (11) et `map-page-inspector` (6) — un clic aux coordonnées de la scène sur le canvas ne sélectionne pas l'arête (le rendu DOM n'écoute pas le canvas).
  - `map-page-merged-edges` (1) — `[data-testid="map-edges-merged"]` existe encore dans le DOM.
  - e2e `map-canvas.e2e.ts` — la carte n'a pas de `<canvas>` par défaut (0 reçu, 1 attendu), `map-edge` présents (5), `?renderer=dom` et préférence `relief.renderer=dom` : le DOM est encore rendu.
- Ne passent pas encore de rouge, par construction : `map-page-merged-edges` « selects the edge under a click » (le rendu DOM écoute déjà les pointeurs sur le même scène) et les tests restants de `map-page-edge-labels` (la scène est déjà exposée en mode DOM) : ils verrouillent le comportement à conserver.

## Green

- Fichiers : `src/ui/src/app/modules/map/components/map-canvas/{map-canvas.component.ts,.html,.scss,map-painter.ts,edge-painter.ts}`, `src/ui/src/styles.scss`, `src/ui/src/app/modules/map/helpers/renderer.logic.ts` (supprimé), `docs/dev/rules.md`
- Changement : canvas seul rendu (branches DOM, `.map-layer`, SVG `.map-edges`, styles nœuds/arêtes, `relief.renderer` et `?renderer=` retirés ; `proto` renommé). Peintre : coins arrondis 6 px / 4 px, halo `--relief-map` (`map` dans `Palette`), tirets réutilisés. Reprises S19 : rAF du survol annulé à la sortie, infobulle effacée pendant pan/zoom, `Map` par id (et par arête) dans la scène mémoïsée. `rules.md` mis à jour.
- Suite : Vitest 844/844 ; e2e 47/47 specs ; `just build` ok ; `just lint` échoue seulement sur `prettier --check` de `tests/e2e/helpers/open-relief.ts` (fichier de test rouge, non touché).
- Questions ouvertes : `edgeSyncKey`, `headerStyle`, `mergedEdgesPath` n'ont plus d'appelant de production mais restent testés (specs hors périmètre) : gardés. `docs/bench.md` « After S20 » (bench-ui) et la spec e2e instable non traités.

## Review

- Verdict : fix first
- Must fix :
  - `src/ui/src/app/modules/map/helpers/edge-state.logic.ts` (`edgeSyncKey`), `header.logic.ts:83` (`headerStyle`), `edge-culling.logic.ts:64` (`mergedEdgesPath`) : sans appelant de production, restes du DOM ; les supprimer avec leurs specs (`edge-state.logic.spec.ts`, `header-style.logic.spec.ts`, `edge-culling.logic.spec.ts`) et les types associés.
  - `tests/e2e/bench/render.ts:88,246-247` : branches de repli sur `.map-node` / `map-node` / `map-edge` (DOM retiré) ; ne garder que la scène.
  - `docs/bench.md` : section « After S20 » absente (`just bench-ui` sur `dense` et excalidraw) ; ligne 197 décrit encore `RELIEF_RENDERER` / `?renderer=canvas`. Critère bench non vérifié.
  - Spec e2e instable et test Vitest instable : non identifiés (demandé par le ticket).
- Consider :
  - `map-canvas.component.ts` `draw` (`painter.paint(this.scene(), ...)`) : reconstruit toute la scène à chaque frame, pan compris ; `sceneMemo()` existe et ne dépend pas de la caméra. Utiliser `this.sceneMemo()` (idem `exposeScene`).
  - `map-canvas.component.ts` `startPan` : les écouteurs `window` `pointermove`/`pointerup` ne sont pas retirés à la destruction du composant en plein pan.
  - `map-canvas.e2e.ts` : deux tests quasi identiques (`?renderer=dom`, préférence) ; un seul suffirait.
  - `docs/bench.md` lignes 90, 118-193 : historique, à garder tel quel avec une note « DOM, retiré en S20 ».
  - Coins arrondis : test e2e inutile, couvert par le peintre.

### Review 2

- Verdict : fix first
- Must fix :
  - Spec e2e instable : cause toujours non identifiée (rien dans le ticket, le justfile ni le code) ; le ticket l'exige (ligne 17). Soit la nommer (relancer `just e2e-summary` en boucle et noter la spec), soit consigner explicitement dans le ticket qu'elle reste inconnue et ouvrir un ticket de suivi.
- Corrigés : suppression de `edgeSyncKey`, `headerStyle`, `mergedEdgesPath` (plus aucune occurrence dans `src/ui/src`) ; `render.ts` sans repli DOM (aucun `map-node`/`map-edge` hors assertions négatives) ; `docs/bench.md` « After S20 » présent (dense, excalidraw ; ligne 197 réécrite en historique), chiffres cohérents avec `target/bench-ui/{dense,excalidraw}.json` (écrits après S20) ; test Vitest instable : cause identifiée (caméra encore en vol, jsdom 0 x 0) et `settle-scene.ts` tient (stabilité de `__reliefScene()` sur deux frames, borné à 120 frames avec erreur explicite), utilisé par les 5 specs concernées.
- Consider : inchangé (`sceneMemo()` dans `draw`, écouteurs `window` du pan, doublon `?renderer=dom` / préférence dans `map-canvas.e2e.ts`).

### Instabilités e2e (orchestrateur)

- 7 passages complets de la suite avant correctif : 3 échecs, sur deux specs.
- `map.e2e.ts` « double-clicking apps/api frames that system » (2 fois) : course dans le test. `openRelief` n'attend que la barre du haut ; le test lisait le cadre de `map-canvas` avant que la carte existe (`map-canvas is not visible`). Corrigé : attendre le nœud, puis lire le cadre.
- `inspector-badge.e2e.ts` « a node, then one of its edges, then Escape » (1 fois) : après le clic sur une ligne de « dépend de », `Escape` laisse le badge à `edge`. La logique (`escapeStep`, `clearEdgeSelection`) est correcte ; cause probable : la touche part vers le bouton cliqué, retiré du DOM quand l'inspecteur passe à l'arête, et n'atteint pas `window`. Non reproduit en isolé (10/10) ni sur 3 passages complets après le correctif : laissé en l'état, à rouvrir s'il revient.
- `just e2e-summary` affiche désormais les lignes d'erreur en tête quand la suite échoue.

## Answer

- Canvas 2D est le seul rendu de la carte (ADR 0009) : DOM et SVG des nœuds et arêtes retirés, ainsi que `relief.renderer`, `?renderer=`, `RELIEF_RENDERER` et `RELIEF_E2E_RENDERER`. Peintre : coins arrondis 6 px / 4 px, halo `--relief-map` des étiquettes, tirets réutilisés. Reprises S19 : rAF du survol annulé à la sortie, infobulle effacée pendant pan et zoom, `Map` par id dans la scène mémoïsée, `hitNode` supprimé.
- Restes du DOM supprimés après review : `edgeSyncKey`, `headerStyle`, `mergedEdgesPath` et leurs specs ; repli DOM du banc.
- Test Vitest instable : la caméra encore en vol quand le test lisait la scène ; `src/ui/src/testing/settle-scene.ts` attend une scène stable sur deux frames.
- Vérifié : `just lint` propre ; cargo 630, web 837 (852 avant, specs du DOM supprimées) ; e2e 154 passés / 1 ignoré, puis 3 passages complets verts ; `just bench-ui` (section « After S20 » de `docs/bench.md`) : budgets tenus sur `dense` et excalidraw.
- Doc utilisateur : inchangée (même rendu à l'écran) ; captures non relancées (alpha).
- Consider laissés : `sceneMemo()` dans `draw`, écouteurs `window` du pan à la destruction, doublon `?renderer=dom` / préférence dans `map-canvas.e2e.ts`.
