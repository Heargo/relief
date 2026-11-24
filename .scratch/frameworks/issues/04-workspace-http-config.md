# H04 Configuration des URL de base dans le fichier d'espace

Status: ready-for-agent
Type: task
Blocked by: H03
UI: non
Doc: docs/user page de l'espace de travail (format du fichier), FR + EN

Spec: `../spec.md` (Configuration) ; ADR 0011

## Comportement

- Le fichier d'espace accepte, par dépôt, une liste optionnelle `http` : `[{ "base": "environment.API_URL", "repo": "sql-monitoring-back" }]`.
- Un appel de ce dépôt dont la base vaut `base` n'est relié qu'aux routes du dépôt `repo`. Une base non listée garde la règle automatique (H03).
- Un `repo` absent de l'espace est une erreur d'espace (`AppError::Workspace`) au chargement.
- Le fichier réécrit par relief (ajout d'un dépôt, étiquettes) garde `http` intact.

## Critères d'acceptation

- [ ] Espace à trois dépôts (front, api, autre api déclarant la même route) : sans config, l'appel atteint les deux routes ; avec `http` vers `api`, une seule arête.
- [ ] `repo` inconnu : erreur d'espace qui nomme le dépôt.
- [ ] Aller-retour du fichier : `http` préservé.
