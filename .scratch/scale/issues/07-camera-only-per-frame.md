# S07 Ne recalculer à chaque frame que ce qui suit la caméra

Status: needs-triage
Type: task
Blocked by: S05
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Dans `MapBusiness` et `MapCanvasComponent`, beaucoup de calculs indépendants de la caméra sont refaits à chaque frame parce qu'ils sont dans le même `computed` qu'elle.

## À faire

- `computeModes` : un seul `computed` partagé par `visibleNodes` et `boxIds`, qui ne dépend que de l'échelle (pas de `tx`, `ty`).
- Un seul `computed` des boîtes visibles (`visibleNodes().filter(mode === 'box')` est refait par `edgeLines`, `coChangeLines` et `containerToLoad`).
- État de chaque arête (statut de diff, violations, comptes, libellé, classe, infobulle) calculé une fois par `edges`, `diff`, `violations`, langue ; `edgeLines` n'ajoute que la forme.
- Infobulles des arêtes (`<title>`) créées au premier survol, pas à chaque synchronisation.
- Emphase de la sélection (`nodeEmphasis`, `edgeEmphasis`) recalculée quand la sélection, les arêtes ou les modes changent, pas au pan.
- Placement des étiquettes d'arêtes : une grille des boîtes visibles au lieu de tester chaque étiquette contre toutes les boîtes.
- Clé de synchronisation d'un nœud (`dataset.key`) : ne la reconstruire que si l'une de ses entrées a changé.

## Critères d'acceptation

- [ ] Budget de S05 tenu au zoom et à la sélection sur `dense` (`just bench-ui`).
- [ ] Tests Vitest des fonctions pures déplacées (grille d'étiquettes, état d'arête) ; tous les tests existants passent sans changement de rendu.
