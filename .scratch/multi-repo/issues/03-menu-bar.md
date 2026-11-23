# K03 Barre du haut en barre de menus

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `getting-started`, `map`

Spec: `../spec.md` (Interface)

## Comportement

- Menus **Espace de travail**, **Paramètres**, **Aide**, à gauche de la barre du haut, clavier compris (Alt + lettre, flèches, Échap).
- Paramètres : thème, langue, raccourcis, recharger (ce que contient le bouton Paramètres de U15, qui disparaît). Aide : documentation.
- Espace de travail : « Ouvrir un dépôt… », « Ouvrir un espace de travail… », « Ajouter un dépôt à l'espace… », « Ouvrir ce dépôt comme espace de travail » ; tant que K07 n'est pas fait, les entrées multidépôt sont présentes et désactivées avec une infobulle.
- Le sélecteur de plage quitte la barre du haut (K04).

## Critères d'acceptation

- [ ] e2e : chaque entrée de Paramètres et d'Aide fait ce que faisait le bouton de U15 ; navigation au clavier.
- [ ] Doc FR/EN.
