# K12 Appels HTTP entre dépôts

Status: ready-for-agent
Type: task
Blocked by: K08
UI: non
Doc: docs/user `map`

Spec: `../spec.md` (Arêtes entre dépôts)

## Comportement

- Les routes déclarées dans un dépôt et les appels HTTP d'un autre dépôt (T04) sont reliés en arêtes `http` entre dépôts, avec la même règle de correspondance qu'à l'intérieur d'un dépôt.

## Critères d'acceptation

- [ ] Fixture à deux dépôts (front qui appelle `/api/promo`, API qui la déclare) : arête `http` entre dépôts ; impact qui traverse les dépôts.
