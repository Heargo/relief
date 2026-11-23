# U32 Tracés d'arête dans les couloirs

Status: ready-for-agent
Type: task
Blocked by: U31
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Les arêtes sont des courbes directes qui traversent les boîtes qu'elles ne relient pas.

## Comportement

- Les arêtes (et troncs de U31) suivent les couloirs entre les boîtes : routage orthogonal à coins arrondis sur une grille de couloirs dérivée de la disposition, calculé dans le worker de disposition (S09) au repos, pas à chaque frame.
- Une arête ne traverse plus une boîte qu'elle ne relie pas, sauf si aucun couloir n'existe (repli sur la courbe directe).
- Pendant le zoom, les tracés du repos sont mis à l'échelle ; recalcul au repos.

## Critères d'acceptation

- [ ] Logique : un tracé entre deux boîtes séparées par une troisième ne la traverse pas ; repli documenté.
- [ ] `just bench-ui` sans régression (calcul dans le worker).
- [ ] e2e : la scène expose les points des tracés ; aucune arête de acme-shop ne traverse une boîte étrangère au niveau Fichiers.
- [ ] Doc `map` FR/EN.
