# K07 Fichier d'espace de travail et session multidépôt

Status: ready-for-agent
Type: task
Blocked by: K02
UI: non
Doc: docs/user `getting-started` (espace de travail)

Spec: `../spec.md` (Espace de travail)

## Comportement

- `relief-app` : `Workspace` lu et écrit dans `<nom>.relief.json` (dépôts : nom, chemin relatif au fichier, étiquettes, source et destination par défaut), données dans le `.relief/` voisin ; les `.relief/` des dépôts membres sont ignorés.
- Cas d'usage : créer un espace dans un dossier, ajouter un dépôt, retirer un dépôt, ouvrir ce dépôt comme espace, ouvrir un espace ; commandes Tauri correspondantes.
- `relief <fichier>.relief.json` (ou son dossier) ouvre l'espace.

## Critères d'acceptation

- [ ] Cas d'usage sur deux dépôts de fixture : créer, ajouter, rouvrir ; le cache est dans le `.relief/` de l'espace, rien n'est écrit dans les dépôts.
- [ ] Test du binaire : ouverture par le fichier et par le dossier.
