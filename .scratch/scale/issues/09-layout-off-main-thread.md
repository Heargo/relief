# S09 Disposition et croisements hors du thread principal

Status: needs-triage
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

- [ ] Aucune longue tâche > 50 ms au chargement et au rechargement de `dense` et d'excalidraw (`just bench-ui`).
- [ ] Tests existants de `layout.logic` et `layout-optimize.logic` inchangés (le worker appelle les mêmes fonctions pures).
