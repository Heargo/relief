# R18 Changements répétitifs dans la relecture

Status: ready-for-agent
Type: task
Blocked by: E08
UI: oui
Doc: docs/user `review` (vue d'ensemble)

Spec: `../spec.md` (Phase 14)

## Comportement

- Vue d'ensemble de la PR : une ligne par groupe de E08, « 28 fichiers : <résumé> », dépliable sur la liste des membres.
- Carte : le représentant est normal ; les autres membres sont atténués et portent « ×N identiques » sur le représentant ; leurs arêtes du diff sont repliées dans celles du représentant (compteur).
- Ordre de lecture : le groupe est une seule entrée ; marquer « vu » le représentant propose de marquer tout le groupe.
- Sélectionner un membre le déplie (ses arêtes, son badge normal).

## Critères d'acceptation

- [ ] e2e sur la fixture de E08 : une ligne de groupe dans la vue d'ensemble, une entrée dans l'ordre de lecture, membres atténués sur la carte, « vu » sur tout le groupe.
- [ ] Doc `review` FR/EN.
