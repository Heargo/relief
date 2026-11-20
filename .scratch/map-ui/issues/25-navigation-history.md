# U25 Historique de navigation : précédent / suivant

Status: needs-triage
Type: task
Blocked by: U05
UI: oui
Doc: docs/user `map` (raccourcis)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 (`quicknotes.md`, se perdre dans les dépendances) : après avoir suivi plusieurs arêtes, rien ne ramène au nœud d'avant.

## À faire

- Chaque sélection (nœud, arête) et chaque cadrage par la recherche ou un lien de panneau ajoute une étape à l'historique (sélection et caméra) ; pan et zoom à la main n'en ajoutent pas.
- `Alt` + `←` / `→`, boutons 4 / 5 de la souris et deux boutons dans le fil d'Ariane : étape précédente / suivante, avec un vol de caméra.
- Logique dans un module pur (`history.logic.ts`) ; l'historique vit le temps de la session, vidé au changement de plage.

## Critères d'acceptation

- [ ] Tests Vitest de `history.logic` (pile, branche abandonnée après un retour puis une nouvelle sélection).
- [ ] e2e acme-shop : sélectionner A, puis B depuis une arête de A, `Alt+←` resélectionne A et le cadre.
