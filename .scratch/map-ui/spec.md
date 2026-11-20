# Spec : la carte (U)

Status: ready-for-agent
Date: 2026-11-18

## But

L'UI de l'app native `relief`, hors diff : la carte zoomable du dépôt, telle que validée dans `docs/product/maquette/index.html` (référence visuelle et comportementale : la reprendre, pas la réinventer).

## Décisions (revue de la maquette, `docs/product/BRAINSTORM.md` « Décisions UX »)

- Trois colonnes : barre de gauche, carte, panneau de droite ; **panneaux redimensionnables** au bord (taille mémorisée, double-clic = défaut), bouton « élargir » du panneau de droite.
- **Zoom sémantique continu** : une boîte s'ouvre d'elle-même quand sa largeur à l'écran dépasse un seuil par niveau (système 470 px, module 300 px, fichier 175 px) ; une boîte fermée montre ses enfants en fantômes ; niveaux 0–3 (Système, Modules, Fichiers, Symboles) en boutons et touches `0`–`3` ; double-clic = plonger ; le niveau 4 (code) est le panneau de droite.
- Rendu DOM (une div par nœud visible, positionnée en `transform`) + un SVG pour les arêtes, recalculé par `requestAnimationFrame` ; éléments hors écran non affichés.
- **Arêtes agrégées au niveau visible** : chaque arête fine est rattachée au premier ancêtre visible de ses extrémités ; une arête agrégée affiche son nombre de liens.
- **Disposition** : grille imbriquée ; option par défaut « Moins de croisements » (ordre des enfants optimisé par recherche locale sur le nombre de croisements aux niveaux modules, fichiers, symboles), option « Grille brute ». Le layering type Sugiyama a été essayé et fait pire : ne pas le reprendre sans mesure.
- Logique dans des `*.logic.ts` purs (layout, visibilité, agrégation, croisements, niveau courant), état dans `MapBusiness` (signals), composants minces. Le composant de carte écrit les positions directement dans le DOM à chaque frame (pas de détection de changements par nœud), voir ADR 0002.
- Langues EN et FR, thème clair et sombre.

## Retours du 2026-11-20 (U14 à U20)

Revue de l'UI après U13. Référence visuelle : `docs/product/maquette/v2.html` (prime sur `index.html` pour ce qu'elle montre).

- **Zoom** : un conteneur s'ouvre de nouveau sur sa seule largeur à l'écran (comme avant U10). Quand l'en-tête réservé est trop petit pour un titre lisible, le titre passe dans une étiquette posée sur la bordure haute (option A de la maquette). Le filigrane (B) et la réserve en pixels écran (C) sont écartés.
- **Barre du haut** : à droite, un seul bouton Paramètres (thème, langue, raccourcis, documentation). La plage devient un contrôle `base ··· head` à deux sélecteurs.
- **Panneau gauche** : la bascule PR / Explorer reste en haut, telle quelle. Puis les outils du mode, puis « Affichage », commun aux deux modes.
- **Panneau droit** : un inspecteur avec un badge (Nœud, Arête, Vue d'ensemble). Une arête montre ses utilisations dans le code, pas seulement l'import.
- **Sélection** : les arêtes du nœud sélectionné ressortent (sortantes en accent, entrantes en couleur d'impact), les autres s'estompent.
