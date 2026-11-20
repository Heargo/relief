# Relecture d'un gros dépôt : l'UI lit le sous-graphe de relecture

Status: needs-triage
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

- [ ] e2e sur `wide` avec des changements dans le working tree : les fichiers modifiés sont visibles en relecture sans zoom, et l'écran a au plus 2 000 nœuds.
