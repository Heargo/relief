# S09 Disposition et croisements hors du thread principal

Status: resolved
Type: task
Blocked by: S05
UI: oui
Doc: aucune

Spec: `../spec.md` (Décisions, phase 10)

## Constat

`layoutGraph`, `optimizeOrder` (« moins de croisements »), `layoutCrossings` et `crossingsOfEdges` tournent sur le thread de l'UI, au chargement, à chaque rechargement du working tree et quand les boîtes visibles changent. À faire seulement si S05 montre une longue tâche (> 50 ms) à l'un de ces moments.

## À faire

- Calculer la disposition (et les deux variantes optimisée / brute) dans un Web Worker ; la carte garde l'ancienne disposition et l'anime vers la nouvelle quand elle arrive.
- `visibleCrossings` calculé au repos, ou retiré s'il n'est plus affiché.

## Critères d'acceptation

- [x] Aucune longue tâche > 50 ms au chargement et au rechargement de `dense` et d'excalidraw (`just bench-ui`).
- [x] Tests existants de `layout.logic` et `layout-optimize.logic` inchangés (le worker appelle les mêmes fonctions pures).

## Triage

S05 puis S20 le justifient (`docs/bench.md`, « After S20 ») : sur `dense`, un sous-graphe chargé pendant le zoom fait une frame de ~730 ms, dont `buildLayouts` ~675 ms. `visibleCrossings` et les totaux de croisements sont déjà retirés (S14) : il reste `layoutGraph`, `optimizeOrder` et ce que `buildLayouts` calcule. Critère ajouté : aucune frame > 50 ms due à la disposition pendant le zoom de `dense` (chargement de sous-graphe compris).

## Baseline

`f49cffd` : cargo 630 ; web 837 ; e2e 154 passés / 1 ignoré (47/47 specs). Working tree : seul `quicknotes.md` (notes de l'utilisateur, hors ticket) est modifié.

## Seams

- **Logique pure (`*.logic.ts`, Vitest)** : une fonction exportée qui calcule les dispositions (optimisée et brute) d'un `GraphSnapshot` en données sérialisables (structured clone), appelée telle quelle par le worker ; même résultat que le `buildLayouts` actuel sur une fixture. Attrape la parité et la sérialisation ; rate le thread.
- **Business (`MapBusiness`, `TestBed`)** : la disposition est demandée à un exécuteur asynchrone (worker en production, exécution sur le thread en test, fourni par un token Angular comme les autres frontières) ; tant que la nouvelle disposition n'est pas arrivée la carte garde l'ancienne, puis passe à la nouvelle (animée) ; une réponse périmée (snapshot remplacé entre-temps) est ignorée. Attrape l'ordre et les courses ; rate le vrai worker.
- **App construite (`just e2e-summary` + `just bench-ui`)** : toute la suite e2e passe avec le worker réel ; le banc ne montre plus de frame > 50 ms due à `buildLayouts` au chargement ni pendant le zoom de `dense` et d'excalidraw. Attrape le vrai thread et le bundling du worker ; rate le détail.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/layout-compute.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-layout-worker.business.spec.ts`. Pas de nouveau e2e : la suite existante couvre le rendu, `just bench-ui` vérifie le critère.
- Symboles à créer : `computeLayouts(graph): { optimized, raw }` dans `helpers/layout-compute.logic.ts` ; `LAYOUT_EXECUTOR` (token) et `LayoutExecutor = (graph: GraphSnapshot) => Promise<Layouts>` dans `business/layout-executor.ts` (`Layouts` = `{ optimized: MapLayout; raw: MapLayout }`, à exporter). `MapBusiness` doit demander les dispositions à l'exécuteur ; le défaut sans provider doit rester utilisable par les specs existantes (exécution sur le thread).
- Lancer (depuis `src/ui/`) : `npx ng test --watch=false --include src/app/modules/map/helpers/layout-compute.logic.spec.ts` et `npx ng test --watch=false --include src/app/modules/map/business/map-layout-worker.business.spec.ts`
- En échec : 6 tests (ne compilent pas, symboles manquants)
  - computeLayouts › raw layout — `layout-compute.logic` n'existe pas
  - computeLayouts › optimized layout — idem
  - computeLayouts › structured clone — idem
  - MapBusiness layout executor › asks the executor… — `layout-executor` / `LAYOUT_EXECUTOR` n'existent pas
  - › keeps the old layout while the new one is computed — idem
  - › ignores an answer for a graph that was replaced — idem

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/layout-compute.logic.ts`, `src/ui/src/app/modules/map/business/{layout-executor,layout.worker,worker-layout-executor,map.business}.ts`, `src/ui/src/app/app.config.ts`
- Changement : `computeLayouts` (ex-`buildLayouts`) en logique pure ; token `LAYOUT_EXECUTOR` (défaut sur le thread, appliqué en synchrone) ; `MapBusiness.show` demande les dispositions à l'exécuteur, garde l'ancienne en attendant, ignore les réponses périmées ; pendant la première disposition les actions utilisateur (niveau, zoom, pan, sélection, dive, frame, historique) sont mises en attente et rejouées à l'arrivée ; Web Worker réel (`error`/`messageerror` rejettent les requêtes en attente, statut `error`). CSP `default-src 'self'` couvre le worker.
- Suite : Vitest 843/843 ; e2e des 6 specs en échec : 6/6 passent ; `just build` produit `worker-*.js` ; `just lint` propre. Suite e2e complète et `bench-ui` non relancés.
- Questions ouvertes : aucune (le spec worker passe finalement ; mon doute précédent sur `hideExternal` est caduc).

## Review 2

- Verdict : ship
- Must fix : aucun
- Consider :
  - `map.business.ts` (`deferred`, 10 gardes) : correct pour la première disposition, mais dix gardes identiques dispersées = chirurgie au fusil. Alternative moins intrusive : rien en attente, et les specs e2e/l'UI attendent `status === 'ready'` (déjà posé seulement dans `applyShow`) ; sinon un seul point d'entrée (`whenLaidOut(fn)`) plutôt que des gardes recopiées. Les actions non gardées (`setLayoutMode`, `focusNode` direct) restent sur une carte vide pendant la première disposition.
  - Rechargement (`keepView = true`) : `layingOut` n'est pas posé, les actions s'exécutent sur l'ancienne disposition, puis `settle()` réconcilie à l'arrivée. Cohérent avec « la carte garde l'ancienne disposition ». Pas de perte d'action.
  - Erreur : `layingOut` reste `true` après un rejet de la première disposition, et `afterShow` n'est pas vidée ; le statut est `error` donc sans conséquence visible, mais remettre `layingOut = false` dans le `catch`.
  - Course rare : si la première disposition est périmée par un `show(…, true)` (bascule `hideExternal`) qui arrive d'abord, la carte n'est jamais cadrée (`fitCamera` sauté). À couvrir par un test si le cas est atteignable.

## Answer

- `computeLayouts` (ex-`buildLayouts`, logique pure) calcule les deux dispositions ; en production il tourne dans un Web Worker (`layout.worker.ts`, fourni par `LAYOUT_EXECUTOR` dans `app.config.ts`), sur le thread dans les tests. La carte garde l'ancienne disposition jusqu'à la nouvelle ; une réponse périmée est ignorée ; une erreur du worker rejette les requêtes et passe le statut à `error`.
- Pendant la première disposition, les actions de l'utilisateur (niveau, zoom, pan, sélection, dive, cadrage, historique, Escape, mode de disposition) sont mises en attente par `deferUntilLaidOut` puis rejouées : sans ça, 6 specs e2e perdaient le niveau demandé juste après l'ouverture.
- Pas d'animation vers la nouvelle disposition : appliquée directement, comme avant (aucun critère ne l'exige).
- `diff-layer.e2e.ts` : attend que le fichier supprimé quitte la scène (la disposition arrive après les statuts), au lieu de le lire une fois.
- Vérifié : `just lint` propre ; cargo 630, web 843 ; e2e 154 passés / 1 ignoré puis 47/47 ; `just bench-ui` (« After S09 » de `docs/bench.md`) : plus de frame de disposition, budgets de S20 tenus. Doc utilisateur inchangée.
- Consider laissés : pas de `terminate()` du worker (durée de vie de l'app) ; course rare où la première disposition, périmée par une bascule `hideExternal`, n'est jamais cadrée.
