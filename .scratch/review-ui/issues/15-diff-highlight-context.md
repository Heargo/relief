# R15 Diff lisible : coloration et contexte

Status: needs-triage
Type: task
Blocked by: R02
UI: oui
Doc: docs/user `review` (lire le code)

Spec: `../spec.md` (Phase 13)

## Constat

Le panneau du nœud colore le code (highlight.js) mais pas le diff structurel ; le diff montre un contexte fixe autour des lignes changées.

## À faire

- Coloration syntaxique du diff avec le même surligneur que le panneau du nœud (par ligne, en gardant les fonds ajouté / retiré).
- « Afficher N lignes de plus » au-dessus et au-dessous de chaque bloc, et « tout le fichier ».
- Option côte à côte / unifié, mémorisée, dans l'en-tête du panneau élargi.

## Critères d'acceptation

- [ ] Test de la logique de découpage (lignes colorées équilibrées, comme `node-panel.logic`).
- [ ] e2e : le diff de `SessionStore.refresh` a des jetons colorés ; déplier le contexte ajoute des lignes.
