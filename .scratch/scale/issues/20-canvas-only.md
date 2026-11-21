# S20 Canvas seul rendu de la carte

Status: ready-for-agent
Type: task
Blocked by: S19
UI: oui
Doc: `docs/user` `map` (captures) ; `docs/dev/rules.md` ; `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Comportement

- Canvas devient le seul rendu : la préférence `relief.renderer` et `?renderer=` disparaissent, le DOM de la carte est retiré (`sync*`, `mark`, `fill`, styles des nœuds et arêtes dans `map-canvas.component.scss`, `MERGED_TESTID`…). Le reste du composant (fil d'Ariane, niveaux, légende) reste en Angular.
- `RELIEF_RENDERER` / `RELIEF_E2E_RENDERER` disparaissent du banc et du harnais.
- `docs/dev/rules.md` : la carte est un canvas (ADR 0009), e2e par l'API de scène.
- Coins arrondis des boîtes (6 px) et de l'onglet (4 px) dans le peintre, comme le DOM (S17 les a laissés carrés) ; tests du peintre adaptés.
- Identifier la spec e2e instable vue en S16 et S17 (une spec sur 47 échoue parfois dans `just e2e-summary`, jamais en relance).
- `docs/bench.md` : section « After S20 » avec `just bench-ui` sur `dense` et excalidraw.

## Critères d'acceptation

- [ ] `just e2e` vert, `just lint` propre, `just test` vert.
- [ ] `just bench-ui` : sélection p95 < 100 ms, pan p95 < 16 ms, zoom p95 < 33 ms sur `dense` et excalidraw.
- [ ] Plus aucune référence au rendu DOM des nœuds et arêtes dans `src/ui/`.
