# R17 Les tests comme calque repliable

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (calques)

Spec: `../spec.md` (Phase 14)

## Constat

Dans beaucoup de PR, le gros des arêtes vient des tests. On relit d'abord le code ; les lignes test → code noient la carte.

## Comportement

- Un fichier est un **test** s'il est sous un dossier `test`, `tests`, `__tests__`, `e2e`, `spec`, ou s'il se nomme `*.test.*`, `*.spec.*`, `*.e2e.*` (règle dans le cœur, exposée par nœud : `isTest`, et pour un module ou package qui ne contient que des tests).
- Calque « Tests » dans la section Affichage, replié par défaut : les arêtes dont la source est un test ne sont pas tracées ; leur cible porte un badge « testé par N » (« dont M nouveaux » en relecture). Les boîtes de test restent sur la carte, atténuées.
- Cliquer le badge, ou sélectionner un nœud de test, déplie ses arêtes. Déplier le calque trace tout comme avant.

## Critères d'acceptation

- [ ] Cœur : `isTest` sur les nœuds fichier (fixture avec les variantes de nom), dans le contrat JSON.
- [ ] Logique : arêtes repliées et badges calculés à partir des arêtes et d'`isTest`.
- [ ] e2e : une fixture avec un dossier `tests/` ; calque replié par défaut, badge sur la cible, déplié au clic.
- [ ] Doc `review` FR/EN.
