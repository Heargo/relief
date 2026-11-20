# S16 Migrer les e2e et les captures sur l'API de scène

Status: ready-for-agent
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
- `grep -rE "map-node|map-edge|data-node-id|data-from" tests/e2e/tests docs/user/screenshots` ne trouve plus rien.

## Critères d'acceptation

- [ ] `just e2e` vert, sur le DOM, avec le même nombre de tests qu'avant.
- [ ] Le `grep` ci-dessus est vide.
