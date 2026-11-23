# K11 Imports de paquets entre dépôts

Status: ready-for-agent
Type: task
Blocked by: K08
UI: non
Doc: docs/user `map` (arêtes entre dépôts)

Spec: `../spec.md` (Arêtes entre dépôts)

## Comportement

- Contrat des adapters (`relief-adapter-api`) : un adapter déclare les noms de paquets qu'un dépôt publie (TS : `name` des `package.json` ; Python : `[project].name` de `pyproject.toml`).
- Un import vers un de ces noms depuis un autre dépôt de l'espace est résolu vers les fichiers du dépôt qui le publie (point d'entrée du paquet), comme un import de workspace, au lieu d'un nœud externe.
- Aucun cas particulier par langage dans `relief-index`.

## Critères d'acceptation

- [ ] Fixture à deux dépôts (front qui importe `@acme/shared` publié par l'autre) : arête `imports` entre dépôts, plus de nœud externe pour ce paquet ; même chose en Python.
