# Spec : relire une PR (R)

Status: ready-for-agent
Date: 2026-11-18

## But

Le mode « Relire la PR » de la maquette : le diff superposé à la carte, et tout ce qui aide le relecteur à savoir où lire et ce qui casse. Tout est calculé par le cœur (`diff-engine`) et affiché par l'UI.

## Décisions (maquette, `docs/product/BRAINSTORM.md` « Décisions UX »)

- La plage vient de `relief <path> <range>` ou d'un sélecteur dans la barre du haut (branches/tags de la commande `meta`, plus « working tree vs HEAD » et « staged »).
- Calque de diff : ajouté (vert), modifié (ambre), supprimé (rouge, pointillé), déplacé (violet, avec l'ancien emplacement en pointillé et une arête « déplacé ») ; intensité selon la taille ; conteneurs teintés s'ils contiennent des changements ; badges « API cassée », « API », « sig. interne », « format seul ».
- Arêtes : nouvelles (vert animé), retirées (rouge pointillé), inchangées (gris, masquables).
- Vue d'ensemble sans sélection : **changements structurels** calculés (signatures, violations introduites, fichiers ajoutés/supprimés/déplacés/format seul, « hors du diff, appelle une signature cassante »), pas de résumé IA.
- Le rayon d'impact vient du cas d'usage `Session::impact` (commande `impact`).
- Rayon d'impact à la sélection, **à travers HTTP par défaut, désactivable**.
- Ordre de lecture **par fichier par défaut**, options **par symbole** et **par commit** ; « vu » suivi par symbole (un fichier est vu quand tous ses symboles changés le sont) ; le mode commit filtre la carte sur les changements du commit choisi (rejeu).
- L'état « vu » est enregistré par le cœur, par dépôt et par plage (`.relief/state/review/`, ou le dossier de repli hors du dépôt pour un dépôt bare ou en lecture seule, voir l'ADR 0007), via `Session::review_state` et les commandes Tauri.
