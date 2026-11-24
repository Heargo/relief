# K14 Règles d'architecture dans un espace de travail

Status: needs-triage
Type: task
Blocked by: K08
UI: oui
Doc: docs/user `rules`, `review`

Spec: `../spec.md` (Décisions)

## Contexte

Relevé à la review de K08 (2026-11-24) : en espace de travail, le résumé de revue n'évalue pas les violations de règles. Chaque dépôt membre peut avoir son `relief.config.yaml` ; ses règles visent des ids sans préfixe.

## Comportement attendu (à cadrer)

- Les règles de chaque dépôt membre s'évaluent sur sa partie de l'union (ids préfixés traduits).
- Des règles entre dépôts (par ex. « le front n'importe pas `ops` ») : dans le fichier d'espace ? Décision à prendre.

## Critères d'acceptation

- [ ] Cas d'usage : une violation introduite dans un dépôt membre apparaît dans le résumé de l'espace.
- [ ] Doc FR/EN : la limite notée en K08 disparaît.
