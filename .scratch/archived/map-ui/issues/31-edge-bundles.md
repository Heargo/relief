# U31 Faisceaux d'arêtes et ports d'entrée

Status: resolved
Type: task
Blocked by: U30
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Une étoile de 30 arêtes vers un même fichier trace 30 lignes qui traversent la carte.

## Comportement

- Les arêtes qui entrent dans une même boîte par le même côté convergent vers un **port** sur ce côté ; à partir d'une distance de la boîte, elles partagent un tronc. Même chose en sortie.
- Le tronc porte la pastille du nombre d'arêtes (et `+N` nouvelles en relecture) ; la couleur du tronc est celle du statut majoritaire, avec un liseré si les statuts sont mêlés.
- Une arête survolée ou sélectionnée est tracée seule, en entier, par-dessus le faisceau ; le hit-test touche l'arête individuelle près de ses extrémités, le faisceau sur le tronc (sélection du faisceau : l'inspecteur liste ses arêtes).
- Seuil : faisceau à partir de 3 arêtes vers la même boîte et le même côté.

## Critères d'acceptation

- [x] Logique : ports et troncs déterministes, faisceaux à partir de 3 arêtes.
- [x] Peintre : tronc commun + branches.
- [x] e2e : la scène expose les faisceaux (`bundles`) ; sélection d'un faisceau ; survol d'une arête du faisceau.
- [x] `just bench-ui` sans régression.
- [x] Doc `map` FR/EN.

## Baseline

`8aa3a6f` (develop) : cargo 682 ; web 944 ; e2e 171 passés / 1 ignoré.

## Seams

- **Logique (`*.logic.ts`, Vitest)** : ports (côté d'entrée / sortie d'une boîte selon la direction de l'arête), faisceaux (≥ 3 arêtes même boîte, même côté), tronc et branches déterministes, statut majoritaire et mélange. Attrape la géométrie ; rate les pixels.
- **Peintre (`edge-painter` avec le contexte factice)** : un faisceau = un tronc + des branches ; l'arête survolée ou sélectionnée tracée seule par-dessus. Attrape l'ordre de dessin.
- **Scène et e2e (acme-shop ou `dense`)** : `__reliefScene().bundles` (id, boîte, côté, nombre, statut, `mid` cliquable) ; sélectionner un faisceau ouvre l'inspecteur avec ses arêtes ; survol d'une arête du faisceau. Attrape le parcours. Banc `just bench-ui` (orchestrateur) sans régression.

## Red

- Fichiers de test (sous `src/ui/src/app/modules/map/`) : `helpers/edge-bundles.logic.spec.ts`, `helpers/map-hit-bundles.logic.spec.ts`, `helpers/map-scene-bundles.logic.spec.ts`, `components/map-canvas/edge-painter-bundles.spec.ts`, `business/map-bundles.business.spec.ts` ; e2e : `tests/e2e/tests/edge-bundles.e2e.ts` (fixture `repeated-imports`, non lancé) et types/helpers `SceneBundle`, `sceneBundles`, `clickBundle` ajoutés à `tests/e2e/helpers/map-scene.ts`.
- Lancer : `cd src/ui && npx ng test --watch=false --include "**/<fichier>.spec.ts"` (un fichier à la fois, cinq fichiers) ; e2e : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/edge-bundles.e2e.ts`
- En échec (compilation, symboles manquants) :
  - edge-bundles.logic.spec — module `./edge-bundles.logic` absent (`entrySide`, `portPoint`, `bundleEdges`, `BUNDLE_MIN`, `BUNDLE_TRUNK_LENGTH`, `EdgeBundle`)
  - map-hit-bundles.logic.spec — type `EdgeBundle` absent, `MapScene.bundles` et `{kind:'bundle'}` du hit-test absents
  - map-scene-bundles.logic.spec — `MapScene.bundles`, `SceneEdge.bundle/hovered`, `MapSceneInput.bundles/selectedBundle` absents
  - edge-painter-bundles.spec — `lines(..., bundles)` / `labels(..., bundles)`, `SceneBundle`, `SceneEdge.bundle/hovered` absents
  - map-bundles.business.spec — `MapBusiness.bundles`, `selectBundle`, `selectedBundle`, `clearBundleSelection` absents
  - edge-bundles.e2e — `scene.bundles`, `edge.bundle/hovered`, `bundle-panel`/`bundle-edge` absents (non exécuté)

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edge-bundles.logic.ts` (nouveau), `helpers/map-scene.logic.ts`, `helpers/map-hit.logic.ts`, `business/map.business.ts`, `components/map-canvas/{edge-painter,map-painter,map-canvas.component}.ts`, `components/map-page/map-page.component.{ts,html}`, `components/inspector-header/*`, `public/i18n/{en,fr}.json`, `docs/user/src/content/docs/{map.md,en/map.md}`.
- Changement : `bundleEdges` (ports, troncs, branches, un faisceau par arête, seuil 3) ; `MapBusiness.bundles` calculé au repos depuis `edges()` + layout (pas de dépendance à la caméra), `selectBundle/selectedBundle/clearBundleSelection` ; scène `bundles`, `SceneEdge.bundle/hovered`, mid sur la branche ; hit-test tronc (`{kind:'bundle'}`) puis branches ; peintre tronc + branches + arête survolée/sélectionnée seule, pastille ; panneau `bundle-panel` / `bundle-edge`, badge inspecteur « Bundle/Faisceau ».
- Suite : Vitest 986 réussis / 0 échoué (baseline 944, +42) ; cargo inchangé ; e2e : edges, edge-usages, edges-merged passent ; edge-bundles échoue (voir questions).
- Questions ouvertes : (1) `edge-bundles.e2e` échoue au `beforeEach` : sur `repeated-imports`, l'étape « changements répétés » (`foldRepeatedEdges`) replie f2..f4 sur f1, la scène ne contient plus que f1→helpers (count 4 replié), f5/f6→other ; aucun faisceau de 3 arêtes vers helpers.ts (ce n'est pas un problème de côtés). Le test suppose 4 arêtes visibles. (2) `just lint` échoue seulement sur Prettier des specs rouges `edge-bundles.logic.spec.ts` et `map-scene-bundles.logic.spec.ts` (non formatées, indexées, intouchées). (3) `just bench-ui` non lancé. (4) Pas de flèche sur le tronc : le sens est porté par la position du port.

## Review

- Verdict : fix first
- Must fix :
  - map.business.ts:938 (`focusNode`) et :913 (`restore`) — posent `_selectedNodeId` sans vider `_selectedBundleId` : après une recherche ou un retour d'historique, le panneau faisceau reste affiché (`inspectorKind` donne 'bundle' la priorité) — vider la sélection de faisceau dans les deux.
  - edge-painter.ts `drawBundle` — trace toutes les branches, y compris celles dont l'arête a `emphasis === 'hidden'` (internes au nœud sélectionné) ; la pastille les compte aussi — sauter les branches cachées (et exclure ces arêtes des faisceaux ou les ignorer au comptage).
  - e2e `edge-bundles` : à confirmer vert par l'orchestrateur (la note du ticket le disait en échec) ; les questions ouvertes du ticket (fixture, Prettier des specs) sont à clore.
- Consider :
  - edge-painter.ts `drawBundle` / `lines` — tous les faisceaux sont tracés à chaque frame, sans découpe par la vue, et les arêtes fusionnées (S08) d'un faisceau redeviennent des traits individuels : surveiller `just bench-ui`.
  - edge-bundles.logic.ts:~135 — boucle gloutonne en O(tours × candidats × arêtes) : à mesurer sur `dense`.
  - map-scene.logic.ts:~325 — une arête de faisceau ne montre plus son étiquette `⚠ n` (violation) ni de pastille hors survol/sélection, alors que la doc dit que la violation reste : régression locale.
  - map-hit.logic.ts:~36 — le tronc gagne sur les nœuds et sur les branches à portée de 6 px ; un tronc qui frôle une boîte voisine masque cette boîte. Aucun test de priorité tronc/nœud.
  - Pas de flèche sur les branches (ticket, question 4) : le sens ne tient qu'au port.

## Answer

- `bundleEdges` : les arêtes pleines (ni fusionnées, ni co-changement, ni masquées) qui entrent dans une même boîte ou en sortent par le même côté, à partir de 3, convergent vers un port au milieu du côté et partagent un tronc de 40 unités ; une arête appartient à un seul faisceau (le plus gros). Calculés au repos depuis `edges()` et la disposition, pas au pan. Peintre : tronc (couleur du statut majoritaire, liseré si mêlé) + branches + pastille « N » ou « N +M » ; l'arête survolée ou sélectionnée est tracée seule par-dessus. Hit-test : boîte fermée > tronc > branches ; le tronc gagne sur un conteneur ouvert. Sélection d'un faisceau : panneau `bundle-panel` avec ses arêtes, badge Faisceau. Étiquettes selon U29.
- Review : fix first (sélection de faisceau gardée après recherche ou historique, branches des arêtes masquées dessinées, étiquette de violation perdue), corrigé avec tests. Conflit de hit-test réglé par l'orchestrateur : une boîte fermée l'emporte sur un tronc qui la recouvre ; la spec e2e clique sur un point libre du tronc.
- Vérifié : Vitest 994 ; e2e 174 passés / 1 ignoré ; `just lint` ; `just bench-ui` sans régression (zoom p95 11 à 14 ms, sélection ≤ 52 ms) ; doc `map` FR/EN.
- Suite : un tronc peut passer au-dessus d'une boîte fermée (U32, tracés dans les couloirs) ; pas de flèche sur les branches.
