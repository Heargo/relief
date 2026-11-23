# S22 Placement des étiquettes d'arête sous une frame

Status: ready-for-agent
Type: task
Blocked by: S21
UI: oui (rien de visible)
Doc: `docs/bench.md`

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md` (budget 60 fps)

## Constat

Après S21, sur `dense` ajusté, le zoom reste à ~20 ms p95 : au franchissement de seuil, `edgeLines` coûte 8 à 12 ms (placement des étiquettes contre la grille de boîtes pour ~4000 arêtes en vue), plus des frames sans marque de 20 à 27 ms (GC probable). La réutilisation des `EdgeLine` entre frames n'apporte rien (S21).

## À faire

- Ne placer une étiquette que pour les arêtes assez longues à l'écran pour l'afficher (seuil du peintre), ou étaler le placement sur plusieurs frames sans changer le résultat au repos.
- Réduire les allocations par frame si les frames sans marque sont du GC (mesurer d'abord).

## Critères d'acceptation

- [ ] `just bench-ui` : zoom p95 < 16 ms sur `dense` ajusté et zoomé, mesuré en A/B dans les mêmes conditions.
- [ ] Au repos, la carte dessinée est identique à celle d'avant ; tous les tests existants passent sans changement.
