# S16 Migrer les e2e et les captures sur l'API de scène

Status: resolved
Type: task
Blocked by: S15
UI: oui (rien de visible)
Doc: aucune (captures inchangées)

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Pourquoi

Après S15, il reste ~29 specs e2e et 2 scripts de capture (`docs/user/screenshots/map.shot.ts`, `getting-started.shot.ts`) qui lisent le DOM de la carte. Ils doivent passer par l'API de scène pour survivre au Canvas.

## Comportement

- Plus aucune spec ni capture ne lit `[data-testid="map-node"]`, `[data-testid="map-edge"]`, `map-edges-merged`, `data-node-id`, `data-from` / `data-to`, ni les classes ou attributs des nœuds et arêtes de la carte (`.map-node`, `data-mode`, `data-emph`, `data-faded`, `.st-*`…). Elles lisent `sceneNode` / `sceneEdge` et cliquent par `clickNode` / `clickEdge`.
- Les autres `data-testid` (panneaux, inspecteur, fil d'Ariane, niveaux, légende) ne changent pas.
- Les infobulles natives (`title`) des arêtes et des libellés tronqués : la spec lit `tooltip` dans la scène au lieu de l'attribut.
- `grep -rE "map-node|map-edge|map-edges" tests/e2e/tests docs/user/screenshots` ne trouve plus que `map-scene.e2e.ts` (qui compare la scène au DOM tant qu'il existe). `data-node-id` / `data-from` restent permis sur les lignes des panneaux (`selected-node`, `overview-row`, `inspector-from`…), qui ne sont pas la carte (décision de l'orchestrateur, 2026-11-22).

## Critères d'acceptation

- [x] `just e2e` vert, sur le DOM, avec le même nombre de tests qu'avant.
- [x] Le `grep` ci-dessus ne trouve que `map-scene.e2e.ts`.

## Baseline

`a6b02d8` : cargo 630 passed ; web 783 passed ; `just e2e` 148 passed, 1 skipped, 0 failed.

## Seams

- **Specs e2e et captures (`tests/e2e/tests/*.e2e.ts`, `docs/user/screenshots/*.shot.ts`) sur les helpers `tests/e2e/helpers/map-scene.ts`** : attrape tout parcours de la carte lu par la scène au lieu du DOM ; rate ce que la scène n'expose pas encore (alors rouge).
- **`buildMapScene` (Vitest)** : pour tout champ que la migration demande et que la scène n'a pas encore (rouge en unitaire d'abord).

## Red

### Lot 1

- Fichiers de test : `tests/e2e/tests/{navigation,node-panel,navigation-history,hide-external,inspector-badge,focus-layers,risk,subgraph-budget,review-subgraph,readable-zoom}.e2e.ts` (migrés) ; `tests/e2e/helpers/map-scene.ts` (helpers ajoutés : `settledNode`, `sceneNodesMatching`, `waitForNodeMatching`, `settledNodeCount`, et les champs `headerHeight`, `labelClipped` du type `SceneNode`) ; `src/ui/src/app/modules/map/helpers/map-scene.logic.spec.ts` (2 tests). Pas de lecture de la carte dans `diff-panel`, `structural-overview`, `reading-order`, `impact` : inchangés.
- Lancer : `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/<fichier>.e2e.ts` ; Vitest : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/map-scene.logic.spec.ts`
- En échec : 3 tests.
  - `readable-zoom` « headers never overlap their children and no visible label overflows, at three zooms » — la scène n'expose pas `headerHeight` ni `labelClipped` (lus avant le calcul).
  - `map-scene.logic.spec` « gives the height in pixels of the header of an open container, 0 for the others (S16) » — `headerHeight` absent (attendu 38 px à l'échelle 1 pour un système, 25 à 0,5, 0 pour une boîte fermée ; = `headerLayout(kind, scale).height`).
  - `map-scene.logic.spec` « flags a shown label that is wider than its box (S16) » — `labelClipped` absent (faux pour un libellé qui tient, vrai pour un libellé affiché mais plus large que sa boîte).
- Manques de la scène : `headerHeight` (px de l'en-tête, 0 sans en-tête) et `labelClipped` (le libellé affiché déborde de son en-tête / sa boîte ; demande une mesure de texte, à décider côté production).
- Passent déjà sur la scène (10 specs migrées sauf `readable-zoom`) : navigation, node-panel, navigation-history, hide-external, inspector-badge, focus-layers, risk, subgraph-budget, review-subgraph.
- Limite du `grep` du ticket : il trouve encore `data-node-id` / `data-from` / `data-to` dans les specs du lot, mais seulement sur des éléments de panneaux (`selected-node`, `overview-row`, `reading-row`, `hotspot-row`, `inspector-from/to`, `node-edge-row`), pas sur la carte. À trancher : restreindre le `grep` aux sélecteurs `map-*`, ou renommer ces attributs côté panneaux.

### Lot 2

- Fichiers de test : `tests/e2e/tests/{edges-merged,header-tab,co-change,commit-replay,layout,edge-labels,edge-emphasis,edge-usages,added-file,rules,explore,flow-trace,hidden-internal-edges}.e2e.ts` (migrés) ; `edges.e2e.ts` déjà sur la scène, `diff-layer.e2e.ts` : seuls les commentaires lisaient encore `map-node`/`map-edge`, réécrits ; `docs/user/screenshots/{map,getting-started}.shot.ts` (migrées, non lancées) ; `tests/e2e/helpers/map-scene.ts` (helper `clickSceneEdge`, champ `tabRect` du type `SceneNode`) ; `map-scene.logic.spec.ts` (1 test).
- Lancer : `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/<fichier>.e2e.ts` ; Vitest : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/map-scene.logic.spec.ts`
- En échec : 3 tests (+ les 2 du lot 1 en Vitest).
  - `header-tab` « containers open on width alone and a tab names each one… » — `tabRect` absent de la scène (`missingTab` liste tous les conteneurs en `header: 'tab'`).
  - `edge-labels` « shows the whole label of every system at 1280 px… » — `labelClipped` absent (manque du lot 1).
  - `map-scene.logic.spec` « places the title tab of an open container on its top border, none otherwise (S16) » — `tabRect` absent (rect en unités monde, à cheval sur le bord haut de `rect`, dans sa largeur ; null sans onglet).
- Passent déjà sur la scène : edges-merged, co-change, commit-replay, layout, edge-emphasis, edge-usages, added-file, rules, explore, flow-trace, hidden-internal-edges, edges, diff-layer. Second test de `header-tab` (modules larges ouverts) passe.
- Manque de la scène : `tabRect` (onglet du titre, null sauf `header: 'tab'`).
- Assertions abandonnées (non exprimables sur la scène, non remplacées) : `edge-labels` ne vérifie plus la police 15 px / hauteur 38 px / `flex` de l'en-tête d'un système fermé (`headerHeight` vaut 0 pour une boîte fermée), ni l'absence de `circle` dans les arêtes ; `edge-emphasis` ne lit plus l'opacité ni l'épaisseur du trait (l'`emphasis` de la scène porte le sens `out/in/dim/picked`) ; `header-tab` ne lit plus le `title` de l'onglet (libellé non vide à la place).
- `grep -rE "map-node|map-edge|map-edges" tests/e2e/tests docs/user/screenshots` : ne trouve plus que `map-scene.e2e.ts`.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/map-scene.logic.ts`, `src/ui/src/app/modules/map/helpers/map-scene.logic.spec.ts` (cast `future()` retiré), `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts`
- Changement : la scène expose `headerHeight` (px, = `headerLayout(...).height`, 0 sans en-tête), `labelClipped` et `tabRect` (monde, à cheval sur le bord haut, 8 px du bord gauche, largeur plafonnée à la boîte moins 30 px). `buildMapScene` reste pure : `measureLabel(text, font) => px` est une entrée optionnelle de `MapSceneInput` (repli : 0,6 em par caractère, utilisé par les tests unitaires), fournie par le composant via Canvas 2D `measureText` ; `__reliefScene` convertit `tabRect` en coordonnées client. `labelClipped` : libellé affiché plus large que l'en-tête (moins 16 px de padding) ou, pour une boîte fermée, que la boîte (le DOM tronquait par ellipse).
- Suite : web 786 passed (baseline 783, +3) ; `readable-zoom`, `header-tab`, `edge-labels`, `map-scene` e2e verts ; cargo et `just e2e` complet non relancés.
- Questions ouvertes : `labelClipped` d'une boîte fermée ignore le padding (sinon les fichiers `extraN.ts` de `deep` seraient signalés alors que le DOM passait) ; le mesureur de l'étape Canvas devra reprendre la même police.

## Review

- Verdict : ship
- Must fix : aucun (`just e2e` complet et cargo non relancés par le dev : à faire avant de clore, critère d'acceptation 1)
- Consider :
  - `tests/e2e/tests/readable-zoom.e2e.ts` (clipped) : l'ancien test détectait aussi `scrollHeight > clientHeight` et les en-têtes en onglet ; la scène ne mesure que la largeur. Assertion affaiblie, à noter avec les abandons du ticket.
  - `tests/e2e/tests/header-tab.e2e.ts` (`closedWide`) : « a des enfants » passe de `querySelector(map-node)` à une inclusion géométrique ; plus faible (un voisin tangent peut compter).
  - `tests/e2e/tests/edge-emphasis.e2e.ts` : le commentaire promet `normal` sans sélection mais l'assertion vérifie seulement `not dim` (idem avant) ; `edge-labels.e2e.ts:8` backtick double « (``labelShown` ».
  - `map-scene.logic.ts` (TAB_*, LABEL_PAD, MONO) : constantes recopiées du CSS, risque de dérive ; les centraliser à l'étape Canvas. Les tests unitaires de `labelClipped` reposent sur le repli 0,6 em, pas sur une mesure.
  - Assertions abandonnées (police 15 px, 38 px, opacité, épaisseur, `title` de l'onglet, `circle`) : annoncées dans le ticket, acceptées.

## Answer

- Toutes les specs e2e et les deux captures lisent la carte par l'API de scène ; seule `map-scene.e2e.ts` lit encore le DOM de la carte (pour comparer la scène au DOM tant qu'il existe). `data-node-id` / `data-from` restent sur les lignes des panneaux.
- Scène complétée : `headerHeight`, `labelClipped` (mesureur `measureLabel` injecté, Canvas 2D `measureText` dans le composant, repli 0,6 em dans les tests), `tabRect`.
- Assertions abandonnées (la scène ne les exprime pas) : police 15 px et hauteur 38 px de l'en-tête d'un système fermé, absence de `circle`, opacité et épaisseur des traits (remplacées par `emphasis`), `title` de l'onglet, débordement vertical d'un libellé (`scrollHeight`). À reprendre au besoin par les tests du peintre (S17, S18).
- Vérifié : cargo 630, web 786 (783 + 3), `just e2e` : un premier passage à 45/46 specs (une spec instable, non identifiée), puis 46/46 ; lint propre. Captures non lancées (alpha, pas de `just docs-shots`), compilées avec les e2e. Review : ship.
- Remarques de review reportées : constantes `TAB_*`, `LABEL_PAD`, `MONO` recopiées du CSS dans `map-scene.logic.ts` (à centraliser avec le peintre, S17) ; `header-tab` « a des enfants » par inclusion géométrique.
