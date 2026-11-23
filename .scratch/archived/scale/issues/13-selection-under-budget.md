# S13 Sélection sous le budget

Status: resolved
Type: task
Blocked by: S07
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Mesure après S07 (`docs/bench.md`) : sélectionner un nœud sur `dense` coûte ~160 ms p95 en vue d'ensemble, ~140 ms zoomée, pour un budget de 100 ms. Les marques `relief:*` n'en expliquent que ~15 ms (`syncNodes` 6, `selectedNodeEdges` 3, emphase ~1). Le reste est hors marques : détection de changement d'Angular sur le panneau droit (inspecteur, listes d'arêtes du nœud) et recalcul de style du navigateur sur `data-emph` et les classes de 4 500 arêtes.

## À faire

- Marquer le rendu du panneau droit et mesurer la part du recalcul de style (Performance panel ou `performance.measure` autour du frame suivant).
- Pistes selon la mesure : emphase portée par une seule classe sur le calque (`.has-selection`) et quelques classes sur les arêtes concernées au lieu d'un attribut sur chaque arête ; listes du panneau en `@for` avec `track` et rendu différé des longues listes ; composants du panneau en `OnPush`.

## Critères d'acceptation

- [x] `just bench-ui` : sélection p95 < 100 ms sur `dense`, vue d'ensemble et zoomée.
- [ ] Tous les tests existants passent sans changement de rendu.

## Comments

- 2026-11-21 (S14) : le spike Canvas tient la sélection à 35 à 53 ms p95 ; le coût était le restyle du DOM. Le critère est repris par S20 (Canvas seul rendu). À fermer quand S20 est résolu.

## Answer

Résolu sans code propre à ce ticket, par le passage au Canvas (S14 à S20, ADR 0009) : le DOM de 4 500 arêtes et son recalcul de style, cause de ~145 ms sur ~160, n'existent plus. `just bench-ui` après S21, sélection `work` p95 : `dense` 33 ms en vue d'ensemble et 34 ms zoomée ; excalidraw 39 à 60 ms (jusqu'à ~100 ms sous charge, avec ou sans S21). Budget de 100 ms tenu. Fermé par l'orchestrateur au triage (2026-11-23).
