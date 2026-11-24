---
title: 'Référence CLI'
description: "L'appel de relief."
---

relief est une application de bureau : on la lance sur un dépôt et elle ouvre sa fenêtre.

## relief [chemin] [plage]

`relief [CHEMIN] [PLAGE]` ouvre la carte du dépôt `CHEMIN` ; sans `CHEMIN`, `relief` ouvre l'écran d'accueil (dépôts récents, sélecteur de dossier), pas le dossier courant (`relief .`). Sans plage, la carte montre la comparaison par défaut du dépôt : l'arbre de travail contre `main`, ou celle enregistrée par **Définir par défaut**. Une plage s'écrit `A...B` (contre le merge-base) ou `A..B`.

## relief fichier.relief.json

`relief <nom>.relief.json`, ou `relief DOSSIER` quand le dossier contient un fichier `.relief.json`, ouvre l'espace de travail multidépôt (voir [Commencer](../getting-started/#espace-de-travail)). Ses données sont dans le `.relief/` voisin du fichier.

## Options et environnement

- `RELIEF_CACHE_DIR` : dossier des données de relief, à la place de `.relief/` à la racine du dépôt.
- `--version` affiche la version.

## Code de sortie

Si le dépôt ne s'ouvre pas (chemin inexistant, dossier hors d'un dépôt git, plage invalide), relief écrit l'erreur sur la sortie d'erreur, n'ouvre aucune fenêtre et sort avec le code 2.
