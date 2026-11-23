# 0009. La carte est dessinée en Canvas 2D

Status: accepted (2026-11-21, choix de l'utilisateur après le spike S14 ; amende 0002)

## Contexte

ADR 0002 dessine la carte en DOM + SVG : une div par nœud visible, un SVG pour les arêtes. S06 à S08 ont réduit ce que chaque frame recalcule, mais sur `dense` (1 349 nœuds, 4 500 arêtes) et excalidraw la sélection restait à 134 à 156 ms p95 (budget 100 ms) et le zoom loin des 33 ms : à chaque franchissement de seuil ou changement d'emphase, le navigateur recalcule le style de 1 300 à 1 500 éléments.

Le spike S14 (`.scratch/archived/scale/issues/14-map-renderer-rewrite.md`) a dessiné la même scène en Canvas 2D, depuis les mêmes signaux de `MapBusiness`, dans l'app Tauri :

- La webview (WebKitGTK) offre Canvas 2D, WebGL 2, `OffscreenCanvas` et les workers, sous Xvfb comme sur un vrai GPU ; pas WebGPU.
- Sélection : 35 à 53 ms p95 en Canvas contre 134 à 156 en DOM. Pan : 2 à 5 ms contre 3 à 13.
- Le dessin d'une frame Canvas coûte 2 à 7 ms p95. Le reste des frames lentes est du calcul, indépendant du moteur : le compteur de croisements à l'écran (60 à 190 ms par seuil, supprimé), le calcul des arêtes au seuil (25 à 35 ms), la disposition d'un sous-graphe chargé (~700 ms, S09).
- Sans le compteur, le zoom en Canvas tient 18 à 28 ms p95.

WebGL (PixiJS, regl) n'a pas été prototypé : il ne gagnerait que sur les 2 à 7 ms de dessin, au prix d'une dépendance et d'un texte par atlas. Les bibliothèques de graphe (sigma.js, Cytoscape) ne portent pas la carte imbriquée (boîtes ouvertes, en-têtes, zoom sémantique).

## Décision

- **La carte est un seul `<canvas>` en Canvas 2D**, sans dépendance. Le reste de l'UI (panneaux, fil d'Ariane, légende, niveaux, inspecteur) reste en Angular et Optimus UI.
- **Le moteur ne fait que dessiner.** `computeModes`, la disposition, `edgeShape`, `edgeState`, l'emphase, le culling et le contenu des nœuds restent des fonctions pures (`*.logic.ts`) et des signaux de `MapBusiness`. Une fonction pure construit la **scène** (ce qu'il faut dessiner, en coordonnées monde, avec les états) ; le peintre la dessine. La scène est testée sans canvas.
- **Dessin** : formes en coordonnées monde sous la transformée de la caméra, texte en pixels écran (net à toute échelle, `devicePixelRatio` pris en compte). Couleurs lues dans les variables CSS (`--relief-*`) au démarrage et à chaque changement de thème. Une frame est redessinée en entier, au plus une fois par `requestAnimationFrame`.
- **Hit-testing par géométrie** : nœud le plus petit sous le point (grille de S07), arête la plus proche (`nearestEdge` de S08), étiquette d'arête par son rectangle. Clic, double-clic, survol et infobulles en passent par là.
- **Tests e2e : une API de scène, pas le DOM.** L'app expose `window.__reliefScene()` : les nœuds et arêtes dessinés, avec leurs états (mode, statut, badges, emphase, impact, lecture…) et leurs rectangles à l'écran. Les helpers WebdriverIO (`tests/e2e/helpers/map-scene.ts`) lisent la scène et cliquent aux coordonnées par de vraies actions pointeur. Elle remplace les sélecteurs `map-node` et `map-edge` ; les autres `data-testid` ne changent pas. Elle existe dans tous les builds (une fermeture, aucun coût hors appel).
- **Accessibilité** : le canvas est focalisable et porte un `aria-label` ; une petite couche DOM hors écran décrit le nœud ou l'arête sélectionnés (région `aria-live`), et le clavier agit sur la sélection. Pas d'arbre ARIA parallèle de toute la carte.
- **Migration** : le peintre Canvas est construit à côté du DOM, choisi par une préférence (`relief.renderer`), jusqu'à la parité ; les e2e passent d'abord sur l'API de scène, valable pour les deux moteurs. Puis Canvas devient le seul rendu et le DOM de la carte est retiré.

## Conséquences

- Plus de restyle du navigateur à la sélection ni au zoom : la sélection tient son budget, le zoom n'a plus que du calcul à réduire.
- Tout ce que le CSS donnait à la carte (troncature du texte, ombres, survol, icônes, infobulles natives `title`) est réécrit dans le peintre ou dans une infobulle DOM unique.
- Les e2e ne voient plus le DOM de la carte : ils dépendent de l'API de scène, qu'il faut tenir à jour avec ce qui est dessiné.
- Les captures de la doc restent produites par WebdriverIO : le canvas apparaît dans la capture comme le reste de la page.
- ADR 0002 reste valable pour le reste de l'UI ; sa phrase « la carte elle-même est du DOM + SVG écrit à la main » et son dernier point (styles écrits directement dans le DOM) sont remplacés par cet ADR.
