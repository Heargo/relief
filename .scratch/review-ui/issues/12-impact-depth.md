# R12 Profondeur du rayon d'impact sur la carte

Status: needs-triage
Type: task
Blocked by: R04
UI: oui
Doc: docs/user `review` (rayon d'impact)

Spec: `../spec.md` (Phase 13)

## Constat

Le rayon d'impact surligne tous les appelants transitifs d'un coup ; sur un symbole très utilisé, toute la carte est orange et on ne sait plus par où commencer.

## À faire

- Un sélecteur de profondeur dans la section d'impact (`1`, `2`, `3`, `tout`, mémorisé comme « via HTTP ») qui borne ce que la carte surligne ; la liste garde toutes les profondeurs, celles au-delà repliées (« 12 de plus à 3 sauts et au-delà »).
- Le contour des nœuds atteints s'atténue avec la profondeur (direct plus marqué).

## Critères d'acceptation

- [ ] Test de la logique (`impact.logic`) : profondeur 1 sur `SessionStore.refresh` ne marque que les appelants directs.
- [ ] e2e acme-shop : profondeur 1 puis `tout` change le nombre de nœuds surlignés.
