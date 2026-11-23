# K06 Écran d'accueil sans chemin

Status: ready-for-agent
Type: task
Blocked by: K03
UI: oui
Doc: docs/user `getting-started`

Spec: `../spec.md` (Espace de travail)

## Comportement

- `relief` sans argument ouvre un écran d'accueil (pas de session) : ouvrir un dépôt (sélecteur de dossier), ouvrir un espace de travail (sélecteur de fichier `*.relief.json`), récents (dépôts et espaces, enregistrés dans le dossier de configuration de l'utilisateur).
- `relief .` (ou un chemin) ouvre directement comme aujourd'hui. Les entrées multidépôt sont désactivées tant que K07 n'est pas fait.
- Ouvrir un dépôt depuis l'accueil ouvre la carte dans la même fenêtre.

## Critères d'acceptation

- [ ] Test du binaire : sans argument, la commande `meta` dit « pas de session » et l'UI affiche l'accueil.
- [ ] e2e : accueil, ouvrir la fixture depuis les récents.
- [ ] Doc FR/EN (`relief` sans argument n'ouvre plus `.`).
