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

## Phase 14 : lisibilité des grosses PR (retour du 2026-11-23)

Capture d'une relecture de migration (S16 : ~30 specs e2e qui importent les mêmes helpers) : des centaines d'arêtes « new » en étoile vers un hub, au niveau symbole, chacune étiquetée. La carte est fidèle mais illisible. Principe : **alléger par défaut, ne rien perdre** — ce qui disparaît des traits revient en compteur, en badge, au survol ou à la sélection.

- **Moins de texte** : étiquettes d'arête au survol et à la sélection seulement ; au repos, une pastille par faisceau (U29).
- **Moins de traits** : arêtes agrégées au niveau affiché, celles des symboles seulement pour le nœud sélectionné ou survolé (U30) ; arêtes inchangées masquées par défaut en relecture (R16) ; arêtes des tests repliées en badge sur leur cible (R17).
- **Traits groupés** : faisceaux qui convergent vers un port d'entrée par boîte, avec leur compteur (U31) ; tracés le long des couloirs entre les boîtes (U32).
- **Changements répétitifs** : le cœur reconnaît un même changement fait dans N fichiers (E08) ; la vue d'ensemble en fait un constat et la carte montre un représentant « ×N » (R18).
- **Pas à pas** : en suivant l'ordre de lecture, seules les arêtes de l'élément en cours et de ses voisins directs restent vives (R19).
- Décision (utilisateur, 2026-11-23) : tout faire, sans attendre de maquette ; les choix de design sont notés dans chaque ticket.
