# 0003. Tests e2e : assert_cmd et dépôts de fixture

Status: superseded en partie par 0006 (2026-11-19) : l'UI se teste avec WebdriverIO et tauri-driver ; les dépôts de fixture restent

## Contexte

relief a deux surfaces visibles par l'utilisateur : la CLI (`relief diff --json`, `relief check`) et l'UI dans le navigateur, servie par le binaire. Les deux dépendent d'un vrai dépôt git. Mocker git rendrait les tests aveugles aux vrais problèmes (renommages, merge-base, worktree sale).

## Décision

- **Dépôts de fixture** : la crate `relief-fixtures` construit des dépôts git réels et déterministes (auteur, dates et donc SHA fixes) à partir de définitions sous `tests/fixtures/<nom>/` (un dossier par commit, appliqué en surcouche, plus une liste de suppressions). La fixture principale, **acme-shop**, est le faux monorepo de la maquette avec sa PR #142 en 5 commits.
- **CLI** : `assert_cmd` lance le vrai binaire sur une fixture ; sorties vérifiées par snapshots `insta`.
- **UI** : l'outil e2e initial (Playwright contre `relief serve`) est remplacé par WebdriverIO et `tauri-driver` sur l'app native, voir l'ADR 0006. Les tests passent toujours par les rôles, textes visibles ou `data-testid`.
- **Doc** : les mêmes outils produisent les captures de la doc utilisateur (`docs/user/screenshots/`), sur la même fixture, comme dans rpg-manager-front.

## Conséquences

Chaque ticket d'UI ajoute au moins un test e2e de son parcours principal. Les tests e2e tournent sur le binaire de release : `just e2e` build d'abord.
