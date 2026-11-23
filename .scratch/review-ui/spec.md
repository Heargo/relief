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

## Phase 13 : confort de relecture (brainstorm du 2026-11-20)

Nouvelles fonctionnalités, placées après tout le reste de la roadmap pour éviter le scope creep.

Retours de `quicknotes.md` : se perdre dans les dépendances transitives, garder ce qu'on a vu et pensé, ranger la carte et les panneaux à sa main.

- **Ne pas se perdre** : historique précédent / suivant (U25), « où suis-je » et « revenir à l'entrée en cours » avec « vérifié » pour les nœuds hors diff (R11), profondeur du rayon d'impact sur la carte (R12), chemin entre deux nœuds (R13), mini-carte (U26).
- **Garder ce qu'on pense** : notes ancrées sur un nœud ou une ligne, de type note / question / à corriger, enregistrées avec « vu » (R09), export Markdown à coller dans la PR (R10).
- **Lire le code** : identifiants cliquables (R14), diff coloré avec contexte dépliable (R15).
- **Ranger l'espace** : masquer des éléments (U27), disposition à la main (U28), panneau détaché dans sa propre fenêtre pour le multi-écran (N11). U28 et N11 commencent par une maquette.
- **Écarté pour l'instant** : publier les notes en commentaires GitHub (reste dans « Plus tard ») ; notes partagées entre relecteurs.
