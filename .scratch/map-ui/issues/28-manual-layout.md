# U28 Ranger la carte à la main

Status: needs-triage
Type: task
Blocked by: U04, U27
UI: oui
Doc: docs/user `map` (disposition personnelle)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 (`quicknotes.md`) : on veut organiser la carte comme on se représente le dépôt (le front à gauche, l'API à droite…), ce que la disposition automatique (U04) ne sait pas.

## À faire

- Maquette d'abord (comme U23) : glisser une boîte parmi ses sœurs (dans son conteneur, pas hors de lui), retour visuel pendant le glisser, ce que devient la boîte quand son conteneur grandit.
- Disposition : l'ordre et les positions choisis à la main sont des contraintes de `layoutGraph` (les autres boîtes se placent autour) ; enregistrés par dépôt avec le masquage (U27).
- « Réinitialiser la disposition » dans Affichage, et un indicateur quand la disposition est personnelle.
- Un nœud nouveau (ajouté par le diff ou le working tree) se place automatiquement.

## Critères d'acceptation

- [ ] Tests Vitest de `layout.logic` avec contraintes : une boîte déplacée garde sa place, aucune boîte ne se chevauche.
- [ ] e2e acme-shop : glisser `apps/api` à gauche de `apps/web`, recharger : l'ordre est gardé ; réinitialiser le remet.
