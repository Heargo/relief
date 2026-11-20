# S05 Mesurer le rendu de la carte

Status: ready-for-agent
Type: task
Blocked by: S02
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Retour du 2026-11-20 : la carte rame (zoom, déplacement, sélection) quand beaucoup de nœuds et d'arêtes sont affichés. Lecture du code (2026-11-20), à confirmer par la mesure : à chaque frame de pan ou de zoom, `MapBusiness` recalcule `computeModes` deux fois sur tout le layout (`visibleNodes`, `boxIds`), parcourt tous les nœuds du layout, recalcule pour chaque arête sa forme, son statut de diff, ses violations et ses comptes, place chaque étiquette en la testant contre toutes les boîtes visibles (O(arêtes × boîtes)), puis `MapCanvasComponent` réécrit les styles de chaque nœud, les attributs de chaque arête, reconstruit les infobulles et recalcule l'emphase de la sélection.

## À faire

- Une fixture générée avec beaucoup d'arêtes (`wide` n'en a aucune) : par exemple `dense`, 10 packages × 150 fichiers qui s'importent entre packages, avec des changements dans le working tree.
- Un harnais de mesure du rendu (WebdriverIO sur l'app native, `just bench-ui`) : pan, zoom à la molette et sélection scriptés sur `dense` et sur excalidraw (S02), temps par frame (p50, p95) et temps des longues tâches, relevés par `PerformanceObserver` (`longtask`) et des `performance.mark` autour des `computed` et des `sync*` de la carte.
- Ajouter les chiffres et la répartition du temps (calcul, écriture DOM, style et layout du navigateur) à `docs/bench.md`.
- Fixer le budget à tenir par S06 à S09 (ex. p95 < 16 ms au pan, < 33 ms au zoom, sélection < 100 ms sur `dense`).

## Critères d'acceptation

- [ ] `just bench-ui` tourne sur `dense` et sur excalidraw et écrit ses chiffres.
- [ ] `docs/bench.md` contient la mesure, la répartition du temps et le budget du rendu.

## Suite

Les optimisations sont dans S06 (caméra en un seul transform), S07 (ne recalculer à chaque frame que ce qui suit la caméra), S08 (arêtes hors de la vue et niveau de détail) et S09 (disposition hors du thread principal). Chacune reprend le budget fixé ici.
