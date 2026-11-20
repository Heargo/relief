# U24 Ne pas afficher les dépendances internes du nœud sélectionné

Status: ready-for-agent
Type: task
Blocked by: U18
UI: oui
Doc: user-docs `map` (sélection)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : quand un nœud est sélectionné, ses dépendances internes s'affichent et encombrent la vue.

## Question ouverte

Lecture proposée : les arêtes dont les deux extrémités sont à l'intérieur du nœud sélectionné (entre ses enfants) sont masquées ; seules ses arêtes vers l'extérieur ressortent (U18). À confirmer, et préciser : masquées ou estompées comme `dim` ? Seulement à la sélection, ou aussi au survol ?

## Décision (2026-11-20)

Masquées (classe `hidden`), et seulement à la sélection : le survol ne change rien.

## À faire

- Dans `emphasis.logic.ts`, une classe `hidden` pour les arêtes internes au nœud sélectionné.

## Critères d'acceptation

- [ ] Vitest : une arête entre deux enfants du nœud sélectionné est classée interne ; ses arêtes vers l'extérieur restent `out` / `in`.
- [ ] e2e sur acme-shop : après sélection d'un module ouvert, ses arêtes internes ne sont plus visibles.
