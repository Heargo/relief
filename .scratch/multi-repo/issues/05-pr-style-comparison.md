# K05 Comparaison façon PR : source → destination

Status: ready-for-agent
Type: task
Blocked by: K04
UI: oui
Doc: docs/user `review`

Spec: `../spec.md` (Interface)

## Comportement

- La sélection s'écrit **source → fusionnée dans → destination** (comme à la création d'une PR) ; la plage relue est `destination...source`.
- Sans configuration : source = working tree, destination = `main` (ou la branche par défaut du dépôt si `main` n'existe pas).
- « Définir par défaut » enregistre source et destination dans `.relief/settings.json` (cas d'usage `Session::settings`), relus à l'ouverture ; une plage passée en argument (`relief . A...B`) prime.

## Critères d'acceptation

- [ ] Cas d'usage : défauts sans fichier ; défauts relus après réouverture ; argument prioritaire.
- [ ] e2e acme-shop : source et destination affichées, changer la source change la carte, « par défaut » survit au rechargement.
- [ ] Doc FR/EN.
