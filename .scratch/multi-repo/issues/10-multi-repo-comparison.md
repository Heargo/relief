# K10 Comparaison par dépôt dans le panneau gauche

Status: ready-for-agent
Type: task
Blocked by: K05, K08
UI: oui
Doc: docs/user `review`

Spec: `../spec.md` (Interface)

## Comportement

- En multidépôt, sous la bascule de mode, un bouton « Comparaisons par dépôt » transforme le panneau gauche en un menu : une ligne source → destination par dépôt (K05), avec un bouton retour vers le panneau normal.
- Changer la comparaison d'un dépôt recharge seulement ce dépôt.

## Critères d'acceptation

- [ ] e2e sur la fixture à deux dépôts : ouvrir le menu, changer la source d'un dépôt, revenir ; la carte suit.
- [ ] Doc FR/EN.
