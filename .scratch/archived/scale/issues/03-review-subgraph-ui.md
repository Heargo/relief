# Relecture d'un gros dépôt : l'UI lit le sous-graphe de relecture

Status: resolved
Type: task
Blocked by: S01
UI: oui
Doc: docs/user `map` (gros dépôts)

Spec: `../spec.md` (Décisions : en relecture, les nœuds changés + 1 saut, leurs ancêtres, les autres conteneurs fermés)

## Contexte

S01 a ajouté le budget côté cœur et `DiffResponse.graph` (sous-graphe de relecture), mais l'UI ne le consomme pas : en relecture d'un gros dépôt, un nœud modifié dans un conteneur fermé n'apparaît qu'après un zoom. `DiffBusiness` et `ReadingOrderBusiness` lisent encore les snapshots base/head complets, donc le budget IPC ne s'applique pas en relecture.

## À faire

- En relecture, afficher `DiffResponse.graph` (demandé avec `budget`) au lieu du snapshot complet ; les conteneurs fermés s'ouvrent au zoom comme en exploration.
- `DiffBusiness` et `ReadingOrderBusiness` ne demandent plus les snapshots complets quand le budget s'applique.
- `refreshSnapshot` passe toujours `budget` (adapter le spec de `reload` qui attend `snapshot('WORKTREE')` à un argument).
- Déplacer le classement de `Session::search` dans une fonction pure (`relief-diff`) et ne plus le dupliquer dans `search.logic.ts`.

## Critères d'acceptation

- [x] e2e sur `wide` avec des changements dans le working tree : les fichiers modifiés sont visibles en relecture sans zoom, et l'écran a au plus 2 000 nœuds.

## Baseline

`just test-summary` (2026-11-20, après U25, 010f93d) : cargo 615 passed, 0 failed ; web 684 passed, 0 failed. e2e 139 passés, 1 ignoré, 0 échec.

## Seams

- **Fonction pure de classement de la recherche dans `relief-diff`** (testée directement, sans git) : attrape l'ordre des résultats que `Session::search` renvoie aujourd'hui, une fois sorti de `Session` ; rate le doublon côté TS, dont la suppression est couverte par les specs existantes de la recherche.
- **Business de relecture** (`DiffBusiness`, `ReadingOrderBusiness`, `TestBed`, `ReliefApiService` mocké) : attrape que la relecture demande le diff avec `budget` et affiche `DiffResponse.graph`, ne demande plus les snapshots complets quand le budget s'applique, et que `refreshSnapshot` passe toujours `budget` ; rate le rendu.
- **e2e WebdriverIO sur `wide`** avec des changements dans le working tree : attrape que les fichiers modifiés sont visibles en relecture sans zoom et que l'écran a au plus 2 000 nœuds ; rate le détail du classement.

## Red

- Fichiers de test : `src/domain/relief-diff/tests/search_ranking.rs` (nouveau), `src/ui/src/app/modules/review/business/diff-review-subgraph.business.spec.ts` (nouveau), `src/ui/src/app/modules/review/business/reload.business.spec.ts` (adapté : `diff(range, 2000)` et `snapshot(range, 2000, [])`), `src/ui/src/app/modules/map/business/repo.business.spec.ts` (un test ajouté), `tests/e2e/tests/review-subgraph.e2e.ts` (nouveau)
- Lancer : `cargo test -p relief-diff --test search_ranking` ; depuis `src/ui/` : `npx ng test --watch=false --include src/app/modules/review/business/diff-review-subgraph.business.spec.ts` (idem pour `reload.business.spec.ts` et `map/business/repo.business.spec.ts`) ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/review-subgraph.e2e.ts` (app construite)
- En échec : 
  - `search_ranking.rs` (5 tests : classement exact/préfixe/contient/id, casse et trim, requête vide, limite, égalités dans l'ordre du snapshot) — `relief_diff::rank_search(&GraphSnapshot, &str, usize) -> Vec<NodeId>` n'existe pas (ne compile pas)
  - `diff-review-subgraph` (5 tests) — `DiffBusiness` n'appelle pas `api.diff` avec `budget` 2000, n'expose pas `DiffResponse.graph` comme `headGraph`, lit encore les snapshots ; idem pour la vue d'un commit de `ReadingOrderBusiness`
  - `reload.business.spec.ts` (3 tests : reload sur WORKTREE, sur INDEX, bouton) — le diff est demandé sans budget et `refreshSnapshot` n'envoie pas `(ref, 2000, [])` pour un petit graphe entier
  - `repo.business.spec.ts` « asks the budget even for a small whole graph » — `refreshSnapshot` demande le snapshot entier sans budget
  - `review-subgraph.e2e.ts` (1 test) — sur `wide` en WORKTREE, `packages/pkg-03/file-005.ts` n'est pas sur la carte en relecture

## Green

- Fichiers : `src/domain/relief-diff/src/search.rs` (nouveau), `src/domain/relief-diff/src/lib.rs`, `src/app/relief-app/src/lib.rs`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/src/app/modules/map/business/repo.business.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.ts`, `src/ui/src/app/modules/review/business/diff.business.ts`, `src/ui/src/app/modules/review/business/reading-order.business.ts`, `src/ui/src/app/modules/review/helpers/review-graph.logic.ts` (nouveau)
- Changement : `relief_diff::rank_search` reprend le classement de `Session::search`. `api.diff(range, budget, expand)` ; `DiffBusiness` et la vue d'un commit lisent `DiffResponse.graph` (budget 2000) au lieu des snapshots complets ; le snapshot base n'est lu (budgeté, ouvert jusqu'aux nœuds supprimés/déplacés/modifiés) que si le diff n'est pas purement additif. `reviewGraph` fusionne les conteneurs ouverts par l'utilisateur dans le sous-graphe. `refreshSnapshot` passe toujours `budget`. Sur un gros dépôt avec changements, la carte démarre au niveau 2 pour montrer les fichiers changés.
- Suite : cargo 620 passés, 0 échec (baseline 615) ; web 685 passés, 5 échecs (baseline 684/0) ; e2e 44 specs passées sur 44 (`wdio` direct) ; lint propre.
- Questions ouvertes : 5 specs web existantes, hors des fichiers rouges, sont périmées et exigent une adaptation (interdite ici) : `diff.business.spec.ts` (3 : `toHaveBeenCalledWith(range)` sans budget) et `range-snapshot.business.spec.ts` (2 : `snapshot('WORKTREE')` à un argument). Le doublon TS de la recherche (`search.logic.ts`) est conservé : son spec existant le teste directement et il sert de repli local.

## Review (orchestrateur)

Verdict initial : fix first. Must fix 1 (doc `map`, section gros dépôts) : traité, FR et EN. Must fix 2 (ne plus dupliquer le classement de la recherche côté TS) : **non fait, écart accepté**. `MapBusiness.search` est un repli synchrone appelé directement par quatre specs (`map-navigation`, `reload`, `range-snapshot`…), et `rank_search` ne sait pas encore les requêtes par chemin (`/checkout`) que `searchNodes` gère. Le classement du cœur est sorti dans `relief_diff::rank_search` (fait), le doublon TS reste ; à reprendre avec un `rank_search` étendu aux chemins. Consider traité : `reviewGraph` parcourt une file au lieu de redémarrer sa boucle. Consider restants : `Session::search` relit le `kind` par un `find` linéaire par hit ; `baseOf` / `loadBase` presque dupliqués ; choix du niveau Fichiers (`CHANGED_FILES_LEVEL`) dans le composant plutôt qu'un business.

## Answer

- Cœur : `relief_diff::rank_search(&GraphSnapshot, &str, usize)` reprend le classement de `Session::search`, qui l'appelle.
- UI : `api.diff(range, budget, expand)`. `DiffBusiness` et la vue d'un commit de `ReadingOrderBusiness` affichent `DiffResponse.graph` (budget 2000) au lieu des snapshots complets ; le snapshot base n'est lu (budgeté, ouvert jusqu'aux nœuds supprimés, déplacés ou modifiés) que si le diff n'est pas purement additif. `reviewGraph` (`review-graph.logic.ts`) fusionne les conteneurs ouverts par l'utilisateur. `refreshSnapshot` passe toujours `budget`. Sur un gros dépôt avec changements, la carte démarre au niveau Fichiers.
- Tests existants adaptés : 4 attentes de `diff.business.spec.ts` et `range-snapshot.business.spec.ts` (diff demandé avec budget 2000).
- Doc utilisateur `map` (FR et EN), section gros dépôts ; `just docs-build` passe.
- Vérifié : cargo 620 / 0, web 690 / 0 (baseline 615 / 684), `just lint` propre, `just e2e-summary` 140 passés, 1 ignoré, 0 échec.
