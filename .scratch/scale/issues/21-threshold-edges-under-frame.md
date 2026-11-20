# S21 Arêtes au franchissement de seuil sous une frame

Status: ready-for-agent
Type: task
Blocked by: S20
UI: oui (rien de visible)
Doc: `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md` (budget 60 fps)

## Constat

Spike S14, sans le compteur de croisements : une frame de franchissement de seuil coûte encore 25 à 35 ms sur `dense` et excalidraw, en calcul : `allEdges` (agrégation des arêtes pour les boîtes visibles, 4 à 10 ms), `edgeStates` (5 à 18 ms), `edgeLines` (4 à 18 ms). Le dessin Canvas coûte 2 à 7 ms.

## À faire

- Mesurer chaque marque au seuil, puis réduire : agrégation incrémentale (seules les boîtes dont le mode change), états d'arête mis en cache par arête agrégée et non recalculés quand seul l'ensemble change, formes calculées pour la vue seulement (déjà le cas, vérifier).
- Ne rien changer à ce qui est dessiné.

## Critères d'acceptation

- [ ] `just bench-ui` : zoom p95 < 16 ms sur `dense` et excalidraw, ajusté et zoomé (hors frame de chargement d'un sous-graphe, qui relève de S09).
- [ ] Tous les tests existants passent sans changement.
