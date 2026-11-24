# U29 Étiquettes d'arête à la demande

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Sur une grosse PR, le texte `new` / `-1` / le compteur est peint sur chaque arête : des centaines d'étiquettes, alors que la couleur et le tiret disent déjà ajoutée / supprimée.

## Comportement

- Au repos, aucune étiquette d'arête individuelle. Une étiquette s'affiche pour l'arête survolée, pour les arêtes du nœud sélectionné et pour l'arête sélectionnée.
- Exception : l'étiquette d'une arête avec violation de règle (`⚠ N`) reste visible au repos (rare et importante). `edgeLabelShown` reçoit `violation: boolean` sur l'arête.
- Ce que disait l'étiquette (statut, nombre de liens, sortes) reste dans l'infobulle et l'inspecteur.
- Les arêtes fusionnées (S08) gardent leur pastille de compte, une par paire de boîtes.
- Interrupteur « Étiquettes d'arête : toujours » dans la section Affichage (désactivé par défaut), mémorisé comme les autres réglages d'affichage.

## Critères d'acceptation

- [x] Logique : `edgeLabelShown(edge, { hovered, selectedNode, selectedEdge, always })`.
- [x] e2e acme-shop : au repos la scène n'a aucune étiquette d'arête visible ; au survol d'une arête, la sienne apparaît ; à la sélection de `apps/web`, celles de ses arêtes ; avec l'interrupteur, toutes.
- [x] Doc `map` FR/EN.

## Baseline

`d245a2e` (develop) : cargo 660 ; web 862 ; e2e 154 passés / 1 ignoré.

## Seams

- **Logique (`*.logic.ts`, Vitest)** : `edgeLabelShown(edge, { hovered, selectedNode, selectedEdge, always })` — attrape la règle ; rate le dessin.
- **Scène (`map-scene.logic.ts`, Vitest)** : `label.visible` dans la scène suit la règle (au repos aucune, survol, sélection, « toujours ») ; les pastilles des arêtes fusionnées restent. Attrape ce que voit le peintre et l'e2e ; rate les pixels.
- **e2e (`tests/e2e`, acme-shop)** : au repos aucune étiquette visible dans `__reliefScene()`, au survol et à la sélection oui, avec l'interrupteur toutes. Attrape le parcours ; rate le détail du rendu.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edge-label-shown.logic.spec.ts` (nouveau), `src/ui/src/app/modules/map/helpers/map-scene.logic.spec.ts` (bloc `buildMapScene, edge labels on demand` ajouté en fin), `tests/e2e/tests/edge-labels-on-demand.e2e.ts` (nouveau)
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/edge-label-shown.logic.spec.ts` (idem avec `map-scene.logic.spec.ts`) ; e2e : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/edge-labels-on-demand.e2e.ts` (non lancé)
- En échec : 13 tests (Vitest ne compile pas, symboles manquants), plus 4 e2e non lancés
  - edge-label-shown.logic.spec.ts (5 tests) — `edgeLabelShown` n'est pas exporté par `edges.logic.ts`
  - map-scene.logic.spec.ts (7 nouveaux tests ; le fichier entier ne compile plus) — `MapSceneInput.edgeLabels` n'existe pas
  - edge-labels-on-demand.e2e.ts (4 tests) — étiquettes visibles au repos, interrupteur `toggle-edge-labels-always` absent
- À créer pour green : `edgeLabelShown(edge: {from,to}, { hovered: {from,to}|null, selectedNode: string|null, selectedEdge: {from,to}|null, always: boolean }): boolean` dans `edges.logic.ts` ; `MapSceneInput.edgeLabels?` (même contexte ; absent = repos) ; `label.visible = edgeLabelVisible(...) && (merged || edgeLabelShown(...))` ; préférence `edgeLabelsAlways` (défaut faux, `localStorage` en try/catch) ; testid `toggle-edge-labels-always` (`aria-checked`) dans `display-section`.
- Specs existantes à mettre à jour au green (attendent des étiquettes visibles au repos) : e2e `edge-labels.e2e.ts` (l.22 `violation.label.visible` true) et `map-canvas.e2e.ts` (l.62 `label` `visible: true`) ; Vitest `map-scene.logic.spec.ts` (« carries status, label and the selected flag » l.364, « gives no label rect… long edge » l.389, « places the label rect » l.394), et probablement les specs du peintre d'arêtes.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edges.logic.ts`, `map-scene.logic.ts`, `external.logic.ts`, `business/map.business.ts`, `components/map-canvas/map-canvas.component.ts`, `components/map-page/map-page.component.html`, `src/ui/src/app/modules/review/components/layers-section/layers-section.component.ts`, `src/ui/public/i18n/en.json`, `fr.json`, `docs/user/src/content/docs/map.md` et `en/map.md`
- Changement : `edgeLabelShown` (+ `EdgeLabelContext`) dans `edges.logic.ts` ; `MapSceneInput.edgeLabels` filtre `label.visible` (pastilles fusionnées toujours visibles, violation visible au repos) ; `MapBusiness` porte `hoveredEdge` (alimenté par le survol du canvas) et la préférence `edgeLabelsAlways` (localStorage en try/catch) ; interrupteur `toggle-edge-labels-always` dans la section Affichage ; i18n EN/FR ; doc `map` FR/EN.
- Suite : cargo 660/0 (baseline 660) ; web 876/0 (baseline 862) ; lint propre ; `just build` et `just docs-build` OK ; e2e `edge-labels.e2e.ts` et `map-canvas.e2e.ts` passent, `edge-labels-on-demand.e2e.ts` 1/4 (voir ci-dessous).
- Questions ouvertes : l'e2e `edge-labels-on-demand.e2e.ts` suppose qu'au repos seule `web>db` (`⚠ 2`) a une étiquette visible, mais sur acme-shop `api>db` porte aussi une violation existante (`⚠ 14`, `violOld`), que le Vitest (`keeps the label of a rule violation visible at rest`, `violOld` visible) exige visible : les deux specs sont incompatibles, d'où 3 e2e en échec (repos, sélection de `apps/web`, interrupteur). À trancher : soit l'e2e attend `api>db` aussi, soit seules les violations introduites restent visibles (et le Vitest change).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - map-canvas.component.ts `hover` / `scene()` — le survol ne reconstruit pas la scène à chaque pixel (`setHoveredEdge` dédoublonne, hit-test limité par rAF), mais chaque entrée/sortie d'arête reconstruit toute la scène (`sceneMemo`) ; sur une grosse PR, envisager de ne recalculer que `label.visible` des arêtes.
  - map-canvas.component.ts `onHover` — pendant un pan, `hoveredEdge` reste figé ; le remettre à null au début du pan.
  - map-canvas.component.ts effet du peintre — `this.map.selection()` est probablement redondant avec `emphasis()`.
  - layers-section.component.ts `hasEdgeLabels` — entrée booléenne dupliquant `hasHideExternal` ; acceptable, à factoriser si un troisième réglage arrive.
  - edges.logic.ts `LabelEdge.violation?` — optionnel alors que le ticket dit `violation: boolean`.

## Answer

- Au repos, plus d'étiquette d'arête individuelle ; elles s'affichent au survol, pour les arêtes du nœud sélectionné et pour l'arête sélectionnée (`edgeLabelShown`, `MapSceneInput.edgeLabels`). Décisions de l'orchestrateur : toutes les violations de règle (introduites et existantes) restent étiquetées au repos ; les pastilles des arêtes fusionnées restent. Interrupteur « Étiquettes d'arête : toujours » (section Affichage, `relief.edgeLabelsAlways`, défaut faux). Survol remis à zéro au début d'un pan.
- Vérifié : Vitest 876 ; e2e 158 passés / 1 ignoré (dont `edge-labels-on-demand` 4/4) ; `just lint` ; `just docs-build`. Doc `map` FR/EN.
- Consider laissés : un changement de survol reconstruit toute la scène mémoïsée (ne recalculer que `label.visible` si ça pèse sur une grosse PR).
