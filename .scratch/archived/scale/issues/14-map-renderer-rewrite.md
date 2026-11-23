# S14 Refondre le rendu de la carte : canvas, WebGL ou autre

Status: resolved
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

- [x] Le spike chiffre au moins deux options sur `dense` et excalidraw (pan, zoom, sélection, p50 / p95) dans `docs/bench.md`.
- [x] Un ADR est accepté par l'utilisateur.
- [x] Les tickets d'implémentation sont écrits, avec un budget à tenir : 60 fps au pan et au zoom, sélection < 100 ms, sur `dense` et excalidraw.

## Spike

Branche `feat/s14-map-renderer-spike`. Prototype jetable, marqué `PROTOTYPE (S14)` :

- `src/ui/src/app/modules/map/components/map-canvas/proto-renderer.ts` : peintre Canvas 2D (boîtes, arêtes en `Path2D` depuis `shape.d`, texte en pixels écran, emphase par `globalAlpha`), hit-testing par géométrie (`hitNode`, `nearestEdge`). Choisi par `?renderer=canvas` ; `dom` reste le défaut.
- `map-canvas.component.ts` : en mode prototype, les effets `sync*` du DOM ne tournent pas, un seul effet `syncProto` dessine depuis les mêmes signaux de `MapBusiness`. `window.__reliefScene()` expose nœuds (rectangles écran) et arêtes au banc.
- `tests/e2e/bench/render.ts` : `RELIEF_RENDERER=dom|canvas`, résultats dans `target/bench-ui/<repo>-<renderer>.json`, avec les 3 pires frames et leurs marques (`worst`). `bench/probe.bench.ts` sonde la webview.
- Marques ajoutées : `visibleCrossings`, `buildLayouts`, `layoutCrossings`.

### Webview (WebKitGTK, `bench/probe.bench.ts`)

| | Xvfb | Écran réel (Wayland, GPU) |
| --- | --- | --- |
| WebGL 1 / 2 | oui / oui (texture max 16 384) | oui / oui (texture max 32 768) |
| `OffscreenCanvas` 2D / WebGL 2, `transferControlToOffscreen`, workers | oui | oui |
| WebGPU | non | non |
| Canvas 2D, 5 000 courbes + 1 500 boîtes avec texte | 18 ms / frame | 12 ms / frame |

### Chiffres, Xvfb, `work` p50 / p95 en ms (max entre parenthèses quand il domine)

| Scénario | dense DOM ajusté / zoomé | dense Canvas | excalidraw DOM | excalidraw Canvas |
| --- | --- | --- | --- | --- |
| Pan | 8/10, 10/13 | 4/5, 3/3 | 2/3, 6/7 | 2/2, 3/3 |
| Zoom | 3/44, 3/202 (1 315) | 4/18, 3/196 (1 275) | 3/108, 8/104 | 2/92, 3/82 |
| Sélection | 97/156, 104/134 | 30/35, 25/51 | 111/155, 87/143 | 18/51, 18/41 |

Le dessin Canvas lui-même (`syncProto`) coûte 2 à 7 ms p95 dans tous les cas, sans culling des arêtes fusionnées.

### Ce que ça dit

- **Sélection** : le moteur est la cause. Canvas tient le budget (< 100 ms) partout, le DOM non (134 à 156). Le coût DOM était le restyle des ~1 300 éléments à chaque changement d'emphase.
- **Pan** : tenu par les deux ; Canvas divise par 2 à 4.
- **Zoom** : le p95 ne dépend presque pas du moteur. Les frames lourdes sont du calcul sur le thread principal, identique en DOM et en Canvas :
  - `visibleCrossings` (compteur du panneau Disposition, `countSegmentCrossings` en O(n²) sur les arêtes agrégées) : 160 à 194 ms sur `dense`, ~62 ms sur excalidraw, à chaque franchissement de seuil. L'analyse « After S08 » l'attribuait à tort au style et au layout du navigateur.
  - Chargement d'un sous-graphe pendant le zoom (`containerToLoad`) : `buildLayouts` ~710 ms + `layoutCrossings` ~350 ms dans une seule frame (≈ 1,3 s), c'est le terrain de S09.
  - Le reste (`allEdges`, `edgeStates`, `edgeLines`, `visibleNodes`) : 25 à 45 ms au pire.
- Conséquence pour le découpage : 60 fps au zoom demandera, en plus du moteur, de sortir `visibleCrossings` du chemin du zoom (incrémental, différé au repos, ou en worker) et le layout du thread principal (S09).

### Décisions (utilisateur, 2026-11-21)

- **Moteur : Canvas 2D.** Pas de WebGL : le dessin Canvas coûte 2 à 7 ms p95, un moteur WebGL ne gagnerait presque rien, au prix d'une dépendance et d'un rendu de texte par atlas.
- **Compteur de croisements supprimé** (pas une info utile, et il coûtait 60 à 190 ms à chaque franchissement de seuil). Retirés : `visibleCrossings`, `crossingTotals`, `crossingsOfEdges`, les trois affichages de la section Disposition (`crossings-visible`, `crossings-optimized`, `crossings-raw`), leurs clés i18n, leurs tests et deux lignes de `docs/user` `map` (FR + EN). La disposition « Moins de croisements » reste : `layoutCrossings` sert encore à choisir entre l'ordre cherché et l'ordre du snapshot dans `buildLayouts`.

### Canvas sans le compteur, Xvfb, `work` p50 / p95 en ms

| Scénario | dense ajusté / zoomé | excalidraw ajusté / zoomé |
| --- | --- | --- |
| Pan | 5/5, 3/3 | 2/2, 3/4 |
| Zoom | 4/18, 3/27 (max 758) | 2/28, 3/27 |
| Sélection | 31/35, 23/47 | 18/53, 18/40 |

- Sélection < 100 ms et zoom < 33 ms p95 tenus partout ; 60 fps (16 ms) au zoom pas encore : les frames de seuil restent à 25 à 35 ms de calcul d'arêtes (`allEdges`, `edgeStates`, `edgeLines`), et le chargement d'un sous-graphe garde une frame de ~760 ms (`buildLayouts` ~700 ms, S09).


## Answer

- Spike : peintre Canvas 2D jetable derrière `?renderer=canvas`, banc `just bench-ui` paramétré par `RELIEF_RENDERER`, sonde de la webview (`tests/e2e/bench/probe.bench.ts`). Chiffres dans `docs/bench.md` (« S14 spike »).
- Décisions de l'utilisateur : Canvas 2D (pas de WebGL), compteur de croisements supprimé (commit `78ef3f0`), pas de banc sur vrai GPU.
- ADR `docs/adr/0009-carte-en-canvas-2d.md` (amende 0002) : Canvas 2D, scène pure, e2e par `window.__reliefScene()`, couche DOM minimale pour l'accessibilité, migration à côté du DOM. Décision « Écarté » de `scale/spec.md` mise à jour.
- Tickets : S15 (API de scène), S16 (e2e sur la scène), S17 (peintre : nœuds), S18 (peintre : arêtes), S19 (interactions), S20 (Canvas seul), S21 (arêtes au seuil < 16 ms). S13 repris par S20.
