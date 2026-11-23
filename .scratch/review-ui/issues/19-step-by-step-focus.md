# R19 Relecture pas à pas

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (ordre de lecture)

Spec: `../spec.md` (Phase 14)

## Comportement

- Interrupteur « Pas à pas » dans le panneau de l'ordre de lecture. Activé, l'élément courant de l'ordre de lecture (celui qu'on vient d'ouvrir, ou le suivant non vu) et ses voisins directs (sources et cibles de ses arêtes) restent vifs ; tout le reste de la carte est atténué à 10 %, arêtes comprises.
- Suivant / précédent de l'ordre de lecture change l'élément courant et cadre la caméra sur lui et ses voisins.
- Désactivé, la carte redevient normale ; la sélection reste.

## Critères d'acceptation

- [ ] Logique : nœuds et arêtes vifs pour un élément courant.
- [ ] e2e acme-shop : pas à pas sur la deuxième entrée de l'ordre de lecture ; la scène atténue tout sauf elle et ses voisins ; « suivant » change l'élément.
- [ ] Doc `review` FR/EN.
