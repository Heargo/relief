# K08 Snapshot d'un espace : niveau dépôt et plage par dépôt

Status: ready-for-agent
Type: task
Blocked by: K07
UI: oui
Doc: docs/user `map` (niveau Dépôts)

Spec: `../spec.md` (Modèle et ids)

## Comportement

- Le snapshot d'un espace réunit les snapshots de ses dépôts, chacun sous un nœud `repo` (ids préfixés, K02), chacun à sa propre plage (source → destination du dépôt).
- La carte gagne un niveau **Dépôts** au-dessus de Systèmes ; boîtes de dépôt avec nom, branche et étiquettes.
- Diff, ordre de lecture et impact fonctionnent par dépôt et sur l'union.

## Critères d'acceptation

- [ ] Cas d'usage sur une fixture à deux dépôts : nœuds `repo`, ids préfixés, plages distinctes.
- [ ] e2e : niveau Dépôts, zoom dans un dépôt, diff des deux dépôts.
- [ ] Doc FR/EN.
