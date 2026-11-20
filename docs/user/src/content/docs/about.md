---
title: 'À propos'
description: "Ce qu'est relief et ce qu'il n'est pas."
---

Ce qu'est relief et ce qu'il n'est pas.

## Principes

relief est un client local : pas de serveur distant, pas de compte, pas d'IA. Tout ce qui est affiché est calculé de façon déterministe depuis git.

## Langages supportés

relief marche sur **n'importe quel dépôt git** : sans adapter, la carte montre les dossiers et les fichiers, et le [couplage logique](../explore/#couplage-logique) relie les fichiers qui changent ensemble. Un adapter de langage ajoute les symboles (fonctions, classes, méthodes) et les liens fins entre eux (imports, appels, références) :

| Langage                | Fichiers                                     | Packages                                          | Ce qui est lu                                                                                                           |
| ---------------------- | -------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TypeScript, JavaScript | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx` | `package.json` (npm, pnpm, yarn workspaces)       | symboles, imports, appels, rendus JSX, références de types, appels HTTP, routes, pages, jobs                            |
| Python                 | `.py`                                        | `pyproject.toml` (PEP 621, Poetry, uv workspaces) | fonctions, classes, méthodes (un nom en `_` est interne), imports relatifs et absolus, appels, références d'annotations |

Chaque `package.json` à workspaces ou `pyproject.toml` devient un système. Ceux qui se trouvent sous un dossier de fixtures de test (`fixtures`, `__fixtures__`, `testdata`, `test-fixtures`) sont ignorés pour cela : leurs fichiers restent sur la carte, comme les autres dossiers. Les fichiers hors de tout système sont rangés par dossiers.

Pour les deux langages, relief compare les signatures : un paramètre requis ajouté ou retiré est **cassant**, un paramètre avec une valeur par défaut est **compatible**.

Limites connues en Python : la bibliothèque standard (`os`, `dataclasses`…) est montrée comme une dépendance externe ; un paramètre qui devient keyword-only (`*`) ou positional-only (`/`) n'est pas encore vu comme cassant ; les routes Flask et FastAPI ne sont pas encore des points d'entrée.

## Licence

Voir le dépôt du projet.
