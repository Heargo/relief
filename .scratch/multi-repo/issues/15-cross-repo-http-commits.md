# K15 Commit des arêtes HTTP entre dépôts

Status: needs-triage
Type: task
Blocked by: K12
UI: non
Doc: aucune

Spec: `../spec.md` (Arêtes entre dépôts)

## Contexte

Relevé à la review de K12 (2026-11-24) : dans le diff d'un espace, les arêtes `http` entre dépôts ajoutées ou retirées n'ont pas de `commit` (`attribute_edge_commits` travaille dépôt par dépôt). La lecture par commit les ignore.

## Comportement attendu

- Une arête HTTP entre dépôts est rattachée au commit qui a changé l'appel ou la route (le commit du dépôt dont le côté a changé ; si les deux, à préciser).

## Critères d'acceptation

- [ ] Cas d'usage : une arête HTTP entre dépôts retirée par un commit de l'API porte ce commit.
