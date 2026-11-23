# E08 Changements répétitifs

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: non
Doc: aucune (contrat JSON)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Une migration ou un renommage de masse fait le même changement dans N fichiers (même import ajouté, même symbole retiré ou renommé). La relecture les traite un par un.

## Comportement

- `relief-diff` regroupe les fichiers modifiés par la **signature** de leur changement : ensemble des arêtes ajoutées et supprimées vues depuis le fichier (sorte + cible), ensemble des symboles ajoutés / supprimés / renommés par nom. Deux fichiers sont dans le même groupe si leurs signatures sont égales ; un groupe compte au moins 3 fichiers.
- Chaque groupe a un **représentant** (le premier dans l'ordre de lecture), la liste des membres et un résumé calculé (« +import sceneNode, +import waitForScene ; −`map-node` »).
- Exposé dans `ReviewSummary` (`repeated: [{ representative, members, summary }]`), sans changer le reste du résumé.

## Critères d'acceptation

- [ ] Fixture : une plage où 4 fichiers ajoutent le même import et 2 autres un import différent : un groupe de 4, pas de groupe pour les 2.
- [ ] Déterministe : même groupe et même représentant d'un run à l'autre.
- [ ] Types TS générés à jour (`just contract`).
