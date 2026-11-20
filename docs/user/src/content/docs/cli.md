---
title: 'Référence CLI'
description: "L'appel de relief."
---

relief est une application de bureau : on la lance sur un dépôt et elle ouvre sa fenêtre.

## relief [chemin] [plage]

`relief [CHEMIN] [PLAGE]` ouvre la carte du dépôt `CHEMIN` (le dossier courant par défaut). Sans plage, la carte montre `HEAD` jusqu'à l'arbre de travail. Une plage s'écrit `A...B` (contre le merge-base) ou `A..B`.

## Options et environnement

- `RELIEF_CACHE_DIR` : dossier des données de relief, à la place de `.relief/` à la racine du dépôt.
- `--version` affiche la version.

## Code de sortie

Si le dépôt ne s'ouvre pas (chemin inexistant, dossier hors d'un dépôt git, plage invalide), relief écrit l'erreur sur la sortie d'erreur, n'ouvre aucune fenêtre et sort avec le code 2.
