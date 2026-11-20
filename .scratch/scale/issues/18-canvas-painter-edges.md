# S18 Peintre Canvas : arêtes, étiquettes et co-changements

Status: ready-for-agent
Type: task
Blocked by: S17
UI: oui
Doc: aucune tant que le DOM reste le rendu par défaut

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Comportement

À parité avec le SVG actuel (`syncEdges`, `syncMergedEdges`, `syncCoChange`, `syncEdgeEmphasis`) :

- Arêtes complètes : courbe (`shape.d` en `Path2D`, cache par chaîne), flèche (`shape.arrow`), épaisseur `edgeThickness(count)`, couleur par statut, `changed`, sélectionnée, chemin d'impact, violation nouvelle ou ancienne, emphase (`out`, `in`, `picked`, `dim`, `hidden`).
- Étiquettes : visibles selon `edgeLabelVisible(label, length)`, au milieu (`mx`, `my`), en pixels écran, classe (`cls`, `hl` sur le chemin d'impact), `covered`.
- Arêtes fusionnées (au-delà de 500 à l'écran) : un seul tracé fin, sans flèche ni étiquette, estompé quand quelque chose est sélectionné.
- Co-changements : tirets, couleur `--relief-cochange`.

## Critères d'acceptation

- [ ] Peintre testé sur un canvas factice : arête complète, étiquette visible ou non, fusionnées, co-changement, emphase.
- [ ] En `?renderer=canvas`, les arêtes d'acme-shop (relecture et exploration) ressemblent au SVG (capture à l'œil).
- [ ] `just e2e` (DOM par défaut) reste vert.
