# R16 Arêtes inchangées masquées par défaut en relecture

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (calques)

Spec: `../spec.md` (Phase 14)

## Constat

En relecture, les arêtes grises (inchangées) se mêlent aux arêtes du diff. L'interrupteur qui les masque existe mais est actif par défaut.

## Comportement

- En mode Relire la PR, « Arêtes inchangées » est désactivé par défaut ; en Exploration, actif par défaut. Le choix de l'utilisateur est mémorisé par mode.
- Les arêtes inchangées du nœud sélectionné restent visibles (comme U18), pour ne pas perdre le contexte d'un nœud qu'on lit.

## Critères d'acceptation

- [x] Business : défaut par mode, mémorisé par mode.
- [x] e2e acme-shop : en relecture, la scène n'a aucune arête inchangée hors du nœud sélectionné ; l'interrupteur les remet ; en exploration elles sont là.
- [x] Doc `review` FR/EN.

## Baseline

`67ca925` (develop) : cargo 660 ; web 893 ; e2e 160 passés / 1 ignoré.

## Seams

- **Business (TestBed)** : la valeur de « arêtes inchangées » dépend du mode (relecture : faux par défaut ; exploration : vrai), le choix est mémorisé par mode ; les arêtes inchangées du nœud sélectionné restent dans `edges()` même quand l'interrupteur est coupé. Attrape la règle et la mémoire ; rate le rendu.
- **e2e (acme-shop)** : en relecture, aucune arête inchangée dans la scène hors du nœud sélectionné ; l'interrupteur les remet ; en exploration elles sont là. Attrape le parcours.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/business/map-edges.business.spec.ts` ; `tests/e2e/tests/unchanged-edges-by-mode.e2e.ts` (nouveau) ; helper `tests/e2e/helpers/open-relief.ts` (option `unchangedEdges`).
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/business/map-edges.business.spec.ts` ; e2e : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/unchanged-edges-by-mode.e2e.ts` (non lancé).
- En échec : 7 tests Vitest (le fichier ne compile pas : `MapBusiness.setReviewMode` n'existe pas, rouge par symbole manquant) et 3 e2e.
  - shows the unchanged edges layer in exploration and can hide it — `setReviewMode` manquant
  - hides them by default in review and shows them in exploration — idem
  - keeps only the changed edges in review by default — idem
  - remembers the choice of each mode apart — idem
  - stores the choice per mode and reads it back in a new session — idem (clés `relief.unchangedEdges.review` / `relief.unchangedEdges.explore`, valeurs `'true'`/`'false'`)
  - keeps the unchanged edges of the selected node when the layer is off — idem
  - e2e review / exploration / mémoire par mode — le défaut actuel est actif en relecture
- Pour green : `MapBusiness.setReviewMode(review: boolean)` (relit le choix mémorisé du mode, sinon défaut `!review`) appelé depuis la page (effet sur `DiffBusiness.reviewMode()`) ; `setShowUnchangedEdges` écrit dans `localStorage` sous la clé du mode courant ; `edges()` garde les arêtes inchangées dont une extrémité est dans le nœud sélectionné (`within`) même interrupteur coupé. Avant tout appel à `setReviewMode`, le mode est l'exploration.
- Specs existantes mises à jour (nouveau défaut) : Vitest, pré-remplissage de `relief.unchangedEdges.review = 'true'` au début de `render()` dans `map-canvas-interactions`, `map-page-edge-labels`, `map-page-edge-usages`, `map-page-inspector`, `map-page-merged-edges` (vérifié : 898 passent avec une implémentation temporaire, retirée) ; e2e, `openRelief({ unchangedEdges: true })` dans `diff-layer` (test « hiding the unchanged edges »), `edge-emphasis`, `edge-labels-on-demand`, `hidden-internal-edges`, `edges-shown-level`, `edges-merged` (non exécutées).

## Green

- Fichiers : src/ui/src/app/modules/map/business/map.business.ts ; src/ui/src/app/modules/map/components/map-page/map-page.component.ts ; docs/user/src/content/docs/review.md ; docs/user/src/content/docs/en/review.md
- Changement : `MapBusiness.setReviewMode` relit le choix mémorisé du mode (`relief.unchangedEdges.review|explore`, localStorage en try/catch), sinon défaut `!review` ; `setShowUnchangedEdges` écrit sous la clé du mode ; `edges()` garde les arêtes inchangées du nœud sélectionné (ou de la boîte visible qui le contient, pour un symbole), et toutes les arêtes en relecture sans diff ; `selectedNodeEdges` n'est plus filtré. `map-page` appelle `setReviewMode` via un effet sur `DiffBusiness.reviewMode()`. Doc `review` FR/EN.
- Suite : Vitest 898 passés / 0 échoué (baseline 893 + 5 nouveaux) ; `just build` et `just docs-build` OK ; e2e non lancés.
- Questions ouvertes : `just lint` échoue uniquement sur `prettier --check` du spec rouge `map-edges.business.spec.ts` (fichier de test, non modifiable par moi) ; à reformater à l'étape suivante.

## Answer

- En relecture avec un diff actif, les arêtes inchangées sont masquées par défaut ; en exploration, ou en relecture sans diff, elles restent. Choix mémorisé par mode (`relief.unchangedEdges.review|explore`). Les arêtes inchangées du nœud sélectionné (et de sa boîte visible) restent sur la carte et dans la liste de l'inspecteur.
- Review : fix first (liste de l'inspecteur filtrée, relecture sans diff sans aucune arête), corrigé avec deux tests. `filterEdges` devenu mort, retiré avec ses tests (orchestrateur).
- Vérifié : Vitest 898 ; e2e 163 passés / 1 ignoré ; `just lint` ; doc `review` FR/EN.
