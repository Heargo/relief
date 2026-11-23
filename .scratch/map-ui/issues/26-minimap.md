# U26 Mini-carte

Status: needs-triage
Type: task
Blocked by: U02, S06
UI: oui
Doc: docs/user `map` (mini-carte)

Spec: `../spec.md`

## Constat

Zoomé au niveau des symboles d'un gros dépôt, on ne sait plus où on est dans l'ensemble.

## À faire

- Une mini-carte dans un coin (masquable, mémorisée) : les systèmes et modules du layout en aplats, le cadre de la vue, les nœuds changés en points de leur couleur de diff (et les nœuds atteints par l'impact quand le calque est actif).
- Clic ou glisser dans la mini-carte : déplace la vue.
- Rendu en un seul `canvas`, redessiné au changement de layout ; seul le cadre suit la caméra.

## Critères d'acceptation

- [ ] e2e : cliquer dans la mini-carte déplace la caméra ; le cadre suit un pan.
- [ ] Budget de rendu de S05 toujours tenu avec la mini-carte affichée.
