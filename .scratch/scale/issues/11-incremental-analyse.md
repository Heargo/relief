# S11 Analyse incrémentale d'une plage

Status: needs-triage
Type: task
Blocked by: S04
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

S02 : le diff d'une PR d'environ 50 fichiers prend 3,1 s (excalidraw) et 65 s (n8n), budget 1 s. `analyse` indexe base et head en entier alors qu'ils ne diffèrent que de quelques fichiers.

## À faire

- Construire head à partir de base : seuls les fichiers changés (`diff_trees`) sont réextraits ; seuls ces fichiers et ceux dont la résolution d'import peut changer (importeurs d'un fichier ajouté, supprimé ou déplacé ; changement de `tsconfig.json` ou `package.json` = réindexation complète) sont reliés à nouveau.
- Même chose pour le rechargement du working tree (W01) : HEAD connu, seuls les fichiers modifiés sont relus.

## Critères d'acceptation

- [ ] `just bench` : `analyse` sous 1 s sur excalidraw, et l'écart restant sur n8n expliqué.
- [ ] Un test de propriété sur acme-shop et les fixtures : graphe incrémental = graphe complet, pour chaque commit de la fixture et pour le working tree.
