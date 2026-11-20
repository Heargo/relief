# Spec : source git (G)

Status: ready-for-agent
Date: 2026-11-18

## But

Tout ce que relief sait de git passe par le trait `GitSource` (`relief-git`) : lire sans checkout, comparer des arbres, comprendre les plages, traiter le working tree et l'index comme des commits virtuels (`docs/product/BRAINSTORM.md`, section 5).

## Décisions

- Implémentation `gix` ; repli sur le binaire `git` (même trait) pour ce que gix ne couvre pas ; le choix est interne.
- `RevSpec` : `HEAD`, branche, tag, SHA court ou long, `A..B`, `A...B` (merge-base), et les virtuels `WORKTREE` et `INDEX`.
- `relief diff` sans argument = WORKTREE vs HEAD ; `--staged` = INDEX vs HEAD.
- `repo-id` = SHA du premier commit (racine la plus ancienne) ; sert de clé de cache.
- relief n'écrit jamais dans le dépôt (pas de lock, pas de fichier, pas de `git gc`).
- Les tests passent par `relief-fixtures`, jamais par un mock.
