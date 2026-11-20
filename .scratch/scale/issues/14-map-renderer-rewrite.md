# S14 Refondre le rendu de la carte : canvas, WebGL ou autre

Status: needs-triage
Type: task
Blocked by: S08
UI: oui
Doc: docs/user `map` si le comportement visible change ; ADR à écrire (amende 0002)

Spec: `../spec.md` (Décisions, phase 10 : « Écarté : rendu canvas ou WebGL de toute la carte… à rouvrir avec leurs chiffres »)

## Constat

Retour du 2026-11-21 : malgré S06 à S08, la carte reste trop lente dès qu'il y a beaucoup d'éléments. Après S08, sur `dense` (1 349 nœuds, 4 500 arêtes) et excalidraw, le pan tient le budget de 16 ms (3 à 14 ms p95), mais le zoom et la sélection restent loin du compte : zoom de 41 à 204 ms p95 sur `dense` et de 100 à 116 ms sur excalidraw, contre 33 ms visés ; sélection de 136 à 170 ms, contre 100 ms visés (`docs/bench.md`, section « After S08 »). Au zoom, ~40 à 50 ms sont du travail marqué (états et formes d'arêtes, `syncNodes`, layout) et jusqu'à ~150 ms sont hors marques : style et mise en page du navigateur sur 1 300 à 1 500 nœuds DOM réécrits à chaque franchissement de seuil. Ce qui reste est surtout le coût du navigateur sur un DOM de milliers d'éléments (style, layout, paint, un élément par nœud et jusqu'à 4 par arête) et le recalcul d'état au franchissement des seuils de zoom. Le DOM + SVG (ADR 0002) a montré sa limite : la condition de réouverture posée par le spec est remplie.

## Question à trancher (spike d'abord, pas d'implémentation directe)

Quel moteur de rendu pour la carte, et comment garder ce que le DOM donne aujourd'hui gratuitement ?

Options à comparer sur `dense` et excalidraw, avec `just bench-ui` :

- **Canvas 2D** (dessin immédiat, un seul élément) : simple, sans dépendance ; texte net à gérer (`devicePixelRatio`) ; plafond probable autour de quelques milliers d'arêtes par frame.
- **WebGL via une bibliothèque 2D** (PixiJS, ou regl / deck.gl pour du sur-mesure) : des dizaines de milliers d'éléments à 60 fps ; texte par atlas (bitmap / SDF) ; plus de dépendances et un rendu de texte à soigner.
- **Bibliothèque de graphe** (sigma.js, Cytoscape en mode WebGL) : nœuds et arêtes prêts, mais la carte imbriquée (boîtes qui s'ouvrent, en-têtes, zoom sémantique) ne rentre pas forcément dans leur modèle.
- **Hybride** : arêtes et boîtes fermées en canvas / WebGL, en-têtes, étiquettes et nœud sélectionné en DOM au-dessus (peu d'éléments). Garde le texte net, l'accessibilité et les e2e sur les éléments importants.
- **WebGPU** : à noter seulement ; disponibilité incertaine dans WebKitGTK (Tauri sous Linux).

Contraintes à vérifier pour chaque option :

- **WebKitGTK** (webview de Tauri sous Linux) : support réel de WebGL 2, de l'`OffscreenCanvas` et des workers ; performances sous Xvfb et sur un vrai GPU.
- **Hit-testing** : clic, survol et infobulles sur nœuds et arêtes sans DOM (index spatial, réutiliser `nearestEdge` de S08 et la grille de S07).
- **Texte** : en-têtes, libellés et étiquettes d'arêtes nets à toutes les échelles, FR et EN.
- **e2e WebdriverIO** : aujourd'hui sur le DOM (`data-testid`). Il faut un moyen d'interroger la scène (couche DOM accessible, ou API de test exposée sur `window` en build e2e) sans réécrire tous les specs.
- **Accessibilité** : une couche DOM minimale (nœud sélectionné, focus clavier) ou un arbre ARIA parallèle.
- **Captures de doc** et thèmes clair / sombre (tokens CSS lus par le moteur de rendu).
- **Code existant** : `computeModes`, layout, `edgeShape`, `edgeState`, emphase et culling sont des fonctions pures (`*.logic.ts`) : elles doivent rester la source, le moteur ne fait que dessiner.

## À faire

1. Spike (prototype jetable, skill `prototype`) : la même scène `dense` rendue par 2 ou 3 options retenues, pan / zoom / sélection mesurés avec `just bench-ui`, dans l'app Tauri et pas seulement dans un navigateur.
2. ADR qui amende 0002 (moteur choisi, stratégie e2e et accessibilité), et mise à jour de la décision « Écarté » de `scale/spec.md`.
3. Découpage en tickets d'implémentation (par exemple : moteur et caméra, arêtes, boîtes et texte, hit-testing et sélection, migration des e2e, retrait du rendu DOM).

## Critères d'acceptation

- [ ] Le spike chiffre au moins deux options sur `dense` et excalidraw (pan, zoom, sélection, p50 / p95) dans `docs/bench.md`.
- [ ] Un ADR est accepté par l'utilisateur.
- [ ] Les tickets d'implémentation sont écrits, avec un budget à tenir : 60 fps au pan et au zoom, sélection < 100 ms, sur `dense` et excalidraw.
