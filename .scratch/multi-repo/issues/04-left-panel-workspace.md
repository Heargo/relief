# K04 Panneau gauche : espace de travail, puis mode, puis comparaison

Status: ready-for-agent
Type: task
Blocked by: K03
UI: oui
Doc: docs/user `review`, `map`

Spec: `../spec.md` (Interface)

## Comportement

- En tête du panneau gauche : nom du dépôt (ou de l'espace), branche courante.
- Puis la bascule de mode (Relire la PR / Explorer).
- Sous la bascule, la sélection de la comparaison (aujourd'hui dans la barre du haut, U19/U23), visible seulement en mode Relire la PR.

## Critères d'acceptation

- [ ] e2e : la comparaison est dans le panneau gauche en relecture, absente en exploration ; nom et branche en tête.
- [ ] Doc FR/EN.
